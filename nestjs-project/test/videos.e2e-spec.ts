import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Queue } from 'bullmq';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Channel } from '../src/channels/entities/channel.entity';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { ValidationExceptionFilter } from '../src/common/filters/validation-exception.filter';
import { StorageService } from '../src/storage/storage.service';
import { cleanAllTables } from '../src/test/create-test-data-source';
import { User } from '../src/users/entities/user.entity';
import { InitVideoUploadResponseDto } from '../src/videos/dto/init-video-upload-response.dto';
import { VideoDetailsResponseDto } from '../src/videos/dto/video-details-response.dto';
import { VideoUploadStatusResponseDto } from '../src/videos/dto/video-upload-status-response.dto';
import { Video, VideoStatus } from '../src/videos/entities/video.entity';

describe('Videos (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let jwtService: JwtService;
  let storageService: StorageService;
  let userRepository: Repository<User>;
  let channelRepository: Repository<Channel>;
  let videoRepository: Repository<Video>;
  let inspectionQueue: Queue;
  const uploadsToAbort: Array<{ key: string; uploadId: string }> = [];
  const jobIdsToRemove: string[] = [];

  beforeAll(async () => {
    process.env.DB_HOST =
      process.env.TEST_DB_HOST ?? process.env.DB_HOST ?? 'db';
    process.env.STORAGE_ENDPOINT =
      process.env.TEST_STORAGE_ENDPOINT ??
      process.env.STORAGE_ENDPOINT ??
      'http://minio:9000';
    process.env.STORAGE_PUBLIC_ENDPOINT =
      process.env.TEST_STORAGE_PUBLIC_ENDPOINT ??
      process.env.TEST_STORAGE_ENDPOINT ??
      process.env.STORAGE_ENDPOINT ??
      'http://minio:9000';
    process.env.REDIS_HOST =
      process.env.TEST_REDIS_HOST ?? process.env.REDIS_HOST ?? 'redis';

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(
      new DomainExceptionFilter(),
      new ValidationExceptionFilter(),
    );
    await app.init();

    dataSource = moduleFixture.get(DataSource);
    jwtService = moduleFixture.get(JwtService);
    storageService = moduleFixture.get(StorageService);
    userRepository = dataSource.getRepository(User);
    channelRepository = dataSource.getRepository(Channel);
    videoRepository = dataSource.getRepository(Video);
    inspectionQueue = new Queue('video-processing', {
      connection: { host: process.env.REDIS_HOST, port: 6379 },
    });
  }, 30000);

  afterAll(async () => {
    for (const jobId of jobIdsToRemove) {
      const job = await inspectionQueue.getJob(jobId);
      await job?.remove();
    }
    await inspectionQueue?.close();
    for (const upload of uploadsToAbort) {
      await storageService
        .abortMultipartUpload(upload.key, upload.uploadId)
        .catch(() => undefined);
    }
    await app?.close();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
  });

  async function createAuthenticatedChannel(): Promise<string> {
    const email = `video-${randomUUID()}@example.com`;
    const user = await userRepository.save(
      userRepository.create({ email, password: 'hashed', is_confirmed: true }),
    );
    await channelRepository.save(
      channelRepository.create({
        name: 'Upload Channel',
        nickname: `upload-${randomUUID()}`.slice(0, 50),
        user_id: user.id,
      }),
    );
    return jwtService.sign({ sub: user.id, email });
  }

  async function initSinglePartUpload(
    accessToken: string,
    title: string,
  ): Promise<InitVideoUploadResponseDto> {
    const response = await request(app.getHttpServer())
      .post('/videos/uploads/init')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title,
        filename: 'recording.mp4',
        contentType: 'video/mp4',
        sizeBytes: 1024,
        parts: 1,
      })
      .expect(201);
    const body = response.body as InitVideoUploadResponseDto;
    const video = await videoRepository.findOneByOrFail({ id: body.videoId });
    uploadsToAbort.push({
      key: video.original_key,
      uploadId: body.uploadId,
    });
    return body;
  }

  function forgetUpload(uploadId: string): void {
    const index = uploadsToAbort.findIndex(
      (upload) => upload.uploadId === uploadId,
    );
    if (index >= 0) uploadsToAbort.splice(index, 1);
  }

  async function createReadyVideo(
    accessToken: string,
    title: string,
  ): Promise<{ video: Video; bytes: Buffer }> {
    const video = await createOwnedVideo(accessToken, title, VideoStatus.READY);
    const uploadId = await storageService.createMultipartUpload({
      key: video.original_key,
      contentType: 'video/mp4',
    });
    const uploadUrl = await storageService.createPresignedUploadPartUrl({
      key: video.original_key,
      uploadId,
      partNumber: 1,
    });
    const bytes = Buffer.from(
      Array.from({ length: 1024 }, (_, index) => index % 256),
    );
    const uploadedPart = await fetch(uploadUrl, {
      method: 'PUT',
      body: bytes,
    });
    const etag = uploadedPart.headers.get('etag');
    expect(uploadedPart.ok).toBe(true);
    expect(etag).toBeTruthy();

    await storageService.completeMultipartUpload(video.original_key, uploadId, [
      { partNumber: 1, etag: etag! },
    ]);
    return { video, bytes };
  }

  async function createOwnedVideo(
    accessToken: string,
    title: string,
    status: VideoStatus,
  ): Promise<Video> {
    const payload = await jwtService.verifyAsync<{ sub: string }>(accessToken);
    const channel = await channelRepository.findOneByOrFail({
      user_id: payload.sub,
    });
    const id = randomUUID();
    return videoRepository.save(
      videoRepository.create({
        id,
        channel_id: channel.id,
        title,
        slug: `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${id}`,
        status,
        original_bucket: storageService.bucket,
        original_key: `channels/${channel.id}/videos/${id}/original.mp4`,
        thumbnail_bucket: null,
        thumbnail_key: null,
        multipart_upload_id: null,
        size_bytes: '1024',
        duration_seconds: status === VideoStatus.READY ? 1 : null,
        metadata: status === VideoStatus.READY ? { videoCodec: 'test' } : null,
        processing_error: null,
      }),
    );
  }

  it('initializes multipart upload and persists the video', async () => {
    const accessToken = await createAuthenticatedChannel();
    const response = await request(app.getHttpServer())
      .post('/videos/uploads/init')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Integration upload',
        filename: 'recording.mp4',
        contentType: 'video/mp4',
        sizeBytes: 15 * 1024 * 1024,
        parts: 2,
      })
      .expect(201);
    const body = response.body as InitVideoUploadResponseDto;

    expect(typeof body.videoId).toBe('string');
    expect(body.slug).toMatch(/^integration-upload-[a-f0-9]{12}$/);
    expect(body.status).toBe(VideoStatus.UPLOAD_INITIATED);
    expect(typeof body.uploadId).toBe('string');
    expect(body.partSize).toBe(10 * 1024 * 1024);
    expect(body.parts).toHaveLength(2);
    expect(body.parts[0].partNumber).toBe(1);
    expect(body.parts[0].url).toContain(
      `${process.env.STORAGE_PUBLIC_ENDPOINT}/`,
    );

    const video = await videoRepository.findOneByOrFail({
      id: body.videoId,
    });
    expect(video.channel_id).toBeDefined();
    expect(video.original_key).toMatch(
      /^channels\/.+\/videos\/.+\/original\.mp4$/,
    );
    expect(video.multipart_upload_id).toBe(body.uploadId);
    expect(video.size_bytes).toBe(String(15 * 1024 * 1024));

    uploadsToAbort.push({
      key: video.original_key,
      uploadId: body.uploadId,
    });
  });

  it('rejects an unauthenticated upload initialization', async () => {
    await request(app.getHttpServer())
      .post('/videos/uploads/init')
      .send({
        title: 'Unauthorized',
        filename: 'recording.mp4',
        contentType: 'video/mp4',
        sizeBytes: 1024,
        parts: 1,
      })
      .expect(401);
  });

  it('rejects unsupported content types', async () => {
    const accessToken = await createAuthenticatedChannel();
    const response = await request(app.getHttpServer())
      .post('/videos/uploads/init')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Invalid content',
        filename: 'image.png',
        contentType: 'image/png',
        sizeBytes: 1024,
        parts: 1,
      })
      .expect(400);

    expect((response.body as { error: string }).error).toBe(
      'VIDEO_INVALID_UPLOAD',
    );
  });

  it('rejects requests without a title', async () => {
    const accessToken = await createAuthenticatedChannel();
    const response = await request(app.getHttpServer())
      .post('/videos/uploads/init')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        filename: 'recording.mp4',
        contentType: 'video/mp4',
        sizeBytes: 1024,
        parts: 1,
      })
      .expect(400);

    expect((response.body as { error: string }).error).toBe('VALIDATION_ERROR');
  });

  it('rejects files larger than the configured limit', async () => {
    const accessToken = await createAuthenticatedChannel();
    const response = await request(app.getHttpServer())
      .post('/videos/uploads/init')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Too large',
        filename: 'recording.mp4',
        contentType: 'video/mp4',
        sizeBytes: 10 * 1024 * 1024 * 1024 + 1,
        parts: 1025,
      })
      .expect(413);

    expect((response.body as { error: string }).error).toBe(
      'VIDEO_FILE_TOO_LARGE',
    );
  });

  it('rejects payloads containing video bytes', async () => {
    const accessToken = await createAuthenticatedChannel();
    const response = await request(app.getHttpServer())
      .post('/videos/uploads/init')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Unexpected bytes',
        filename: 'recording.mp4',
        contentType: 'video/mp4',
        sizeBytes: 1024,
        parts: 1,
        bytes: 'not-accepted',
      })
      .expect(400);

    expect((response.body as { error: string }).error).toBe('VALIDATION_ERROR');
  });

  it('completes an upload, persists processing and enqueues only once', async () => {
    const accessToken = await createAuthenticatedChannel();
    const upload = await initSinglePartUpload(accessToken, 'Complete upload');
    const uploadedPart = await fetch(upload.parts[0].url, {
      method: 'PUT',
      body: Buffer.alloc(1024, 1),
    });
    const etag = uploadedPart.headers.get('etag');
    expect(uploadedPart.ok).toBe(true);
    expect(etag).toBeTruthy();

    const completeBody = {
      uploadId: upload.uploadId,
      parts: [{ partNumber: 1, etag }],
    };
    const firstResponse = await request(app.getHttpServer())
      .post(`/videos/${upload.videoId}/uploads/complete`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(completeBody)
      .expect(200);
    const firstBody = firstResponse.body as VideoUploadStatusResponseDto;
    forgetUpload(upload.uploadId);

    expect(firstBody.status).toBe(VideoStatus.PROCESSING);
    expect(
      (await videoRepository.findOneByOrFail({ id: upload.videoId })).status,
    ).toBe(VideoStatus.PROCESSING);

    const jobId = `process-video-${upload.videoId}`;
    jobIdsToRemove.push(jobId);
    const firstJob = await inspectionQueue.getJob(jobId);
    expect(firstJob).toBeDefined();

    const secondResponse = await request(app.getHttpServer())
      .post(`/videos/${upload.videoId}/uploads/complete`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(completeBody)
      .expect(200);
    expect((secondResponse.body as VideoUploadStatusResponseDto).status).toBe(
      VideoStatus.PROCESSING,
    );
    expect((await inspectionQueue.getJob(jobId))?.id).toBe(firstJob?.id);
  });

  it('aborts an upload idempotently', async () => {
    const accessToken = await createAuthenticatedChannel();
    const upload = await initSinglePartUpload(accessToken, 'Abort upload');

    await request(app.getHttpServer())
      .post(`/videos/${upload.videoId}/uploads/abort`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);
    forgetUpload(upload.uploadId);
    await request(app.getHttpServer())
      .post(`/videos/${upload.videoId}/uploads/abort`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    const video = await videoRepository.findOneByOrFail({ id: upload.videoId });
    expect(video.status).toBe(VideoStatus.UPLOAD_ABORTED);
  });

  it('hides another channel video during upload completion', async () => {
    const ownerToken = await createAuthenticatedChannel();
    const otherToken = await createAuthenticatedChannel();
    const upload = await initSinglePartUpload(ownerToken, 'Private upload');

    const response = await request(app.getHttpServer())
      .post(`/videos/${upload.videoId}/uploads/complete`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        uploadId: upload.uploadId,
        parts: [{ partNumber: 1, etag: 'etag' }],
      })
      .expect(404);

    expect((response.body as { error: string }).error).toBe('VIDEO_NOT_FOUND');
  });

  it('returns owned video status and metadata by slug', async () => {
    const accessToken = await createAuthenticatedChannel();
    const { video } = await createReadyVideo(accessToken, 'Status lookup');

    const response = await request(app.getHttpServer())
      .get(`/videos/${video.slug}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const body = response.body as VideoDetailsResponseDto;

    expect(body).toMatchObject({
      videoId: video.id,
      title: video.title,
      slug: video.slug,
      status: VideoStatus.READY,
      sizeBytes: 1024,
      durationSeconds: 1,
      metadata: { videoCodec: 'test' },
      processingError: null,
    });
  });

  it('streams a valid byte range with partial content headers', async () => {
    const accessToken = await createAuthenticatedChannel();
    const { video, bytes } = await createReadyVideo(accessToken, 'Range video');

    const response = await request(app.getHttpServer())
      .get(`/videos/${video.slug}/stream`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Range', 'bytes=100-199')
      .expect(206);

    expect(response.headers['accept-ranges']).toBe('bytes');
    expect(response.headers['content-range']).toBe('bytes 100-199/1024');
    expect(response.headers['content-length']).toBe('100');
    expect(response.headers['content-type']).toContain('video/mp4');
    expect(response.body).toEqual(bytes.subarray(100, 200));
  });

  it('rejects an invalid or unsatisfiable byte range', async () => {
    const accessToken = await createAuthenticatedChannel();
    const { video } = await createReadyVideo(accessToken, 'Invalid range');

    const response = await request(app.getHttpServer())
      .get(`/videos/${video.slug}/stream`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Range', 'bytes=1024-2048')
      .expect(416);

    expect((response.body as { error: string }).error).toBe(
      'VIDEO_INVALID_RANGE',
    );
  });

  it('rejects streaming before the video is ready', async () => {
    const accessToken = await createAuthenticatedChannel();
    const video = await createOwnedVideo(
      accessToken,
      'Not ready',
      VideoStatus.PROCESSING,
    );

    const response = await request(app.getHttpServer())
      .get(`/videos/${video.slug}/stream`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Range', 'bytes=0-99')
      .expect(409);

    expect((response.body as { error: string }).error).toBe('VIDEO_NOT_READY');
  });

  it('downloads the original video with attachment headers', async () => {
    const accessToken = await createAuthenticatedChannel();
    const { video, bytes } = await createReadyVideo(
      accessToken,
      'Download video',
    );

    const response = await request(app.getHttpServer())
      .get(`/videos/${video.slug}/download`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="${video.slug}.mp4"`,
    );
    expect(response.headers['content-length']).toBe('1024');
    expect(response.body).toEqual(bytes);
  });

  it('requires authentication and hides downloads from another channel', async () => {
    const ownerToken = await createAuthenticatedChannel();
    const otherToken = await createAuthenticatedChannel();
    const { video } = await createReadyVideo(ownerToken, 'Private download');

    await request(app.getHttpServer())
      .get(`/videos/${video.slug}/download`)
      .expect(401);
    const response = await request(app.getHttpServer())
      .get(`/videos/${video.slug}/download`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
    expect((response.body as { error: string }).error).toBe('VIDEO_NOT_FOUND');
  });

  it('hides abort, lookup and stream resources from another channel', async () => {
    const ownerToken = await createAuthenticatedChannel();
    const otherToken = await createAuthenticatedChannel();
    const initiatedVideo = await createOwnedVideo(
      ownerToken,
      'Private abort',
      VideoStatus.UPLOAD_INITIATED,
    );
    initiatedVideo.multipart_upload_id = 'private-upload-id';
    await videoRepository.save(initiatedVideo);
    const readyVideo = await createOwnedVideo(
      ownerToken,
      'Private stream',
      VideoStatus.READY,
    );

    const responses = await Promise.all([
      request(app.getHttpServer())
        .post(`/videos/${initiatedVideo.id}/uploads/abort`)
        .set('Authorization', `Bearer ${otherToken}`),
      request(app.getHttpServer())
        .get(`/videos/${readyVideo.slug}`)
        .set('Authorization', `Bearer ${otherToken}`),
      request(app.getHttpServer())
        .get(`/videos/${readyVideo.slug}/stream`)
        .set('Authorization', `Bearer ${otherToken}`)
        .set('Range', 'bytes=0-99'),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(404);
      expect((response.body as { error: string }).error).toBe(
        'VIDEO_NOT_FOUND',
      );
    }
    expect(
      (await videoRepository.findOneByOrFail({ id: initiatedVideo.id })).status,
    ).toBe(VideoStatus.UPLOAD_INITIATED);
  });
});
