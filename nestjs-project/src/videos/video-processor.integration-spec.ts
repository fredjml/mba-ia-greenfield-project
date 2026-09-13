import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
import { access, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import { DataSource, Repository } from 'typeorm';
import { Channel } from '../channels/entities/channel.entity';
import storageConfig from '../config/storage.config';
import { StorageService } from '../storage/storage.service';
import { createTestDataSource } from '../test/create-test-data-source';
import { User } from '../users/entities/user.entity';
import { Video, VideoStatus } from './entities/video.entity';
import { MediaService } from './media.service';
import { VideoProcessorService } from './video-processor.service';

const execFileAsync = promisify(execFile);
const describeMediaIntegration =
  process.env.RUN_MEDIA_INTEGRATION === 'true' ? describe : describe.skip;

describeMediaIntegration('VideoProcessorService (media integration)', () => {
  let dataSource: DataSource;
  let videoRepository: Repository<Video>;
  let storageService: StorageService;
  let processor: VideoProcessorService;
  let fixtureDirectory: string;
  let user: User;
  let channel: Channel;

  beforeAll(async () => {
    dataSource = createTestDataSource([User, Channel, Video]);
    await dataSource.initialize();
    videoRepository = dataSource.getRepository(Video);
    storageService = new StorageService({
      endpoint: process.env.STORAGE_ENDPOINT ?? 'http://minio:9000',
      publicEndpoint:
        process.env.STORAGE_PUBLIC_ENDPOINT ?? 'http://localhost:9000',
      region: 'us-east-1',
      accessKeyId: 'streamtube',
      secretAccessKey: 'streamtube-secret',
      bucket: 'streamtube-videos',
      forcePathStyle: true,
      presignedUrlExpiresSeconds: 900,
    } as ReturnType<typeof storageConfig>);
    processor = new VideoProcessorService(
      videoRepository,
      storageService,
      new MediaService(),
    );
    fixtureDirectory = await mkdtemp(join(tmpdir(), 'streamtube-fixtures-'));

    user = await dataSource.getRepository(User).save({
      email: `worker-${randomUUID()}@example.com`,
      password: 'not-used',
      is_confirmed: true,
    });
    channel = await dataSource.getRepository(Channel).save({
      name: 'Worker integration channel',
      nickname: `worker-${randomUUID()}`,
      description: null,
      user_id: user.id,
    });
  }, 30000);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await videoRepository.delete({ channel_id: channel.id });
      await dataSource.getRepository(Channel).delete(channel.id);
      await dataSource.getRepository(User).delete(user.id);
      await dataSource.destroy();
    }
    storageService?.onModuleDestroy();
    if (fixtureDirectory) {
      await rm(fixtureDirectory, { recursive: true, force: true });
    }
  });

  it('should probe valid media, upload a thumbnail and mark it ready', async () => {
    const video = await createVideo('valid');
    const sourcePath = join(fixtureDirectory, `${video.id}.mp4`);
    await execFileAsync('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=blue:s=320x240:d=1',
      '-c:v',
      'mpeg4',
      '-pix_fmt',
      'yuv420p',
      sourcePath,
    ]);
    await storageService.uploadObject(
      video.original_bucket,
      video.original_key,
      sourcePath,
      'video/mp4',
    );

    await processor.process(jobFor(video));

    const processed = await videoRepository.findOneByOrFail({ id: video.id });
    expect(processed.status).toBe(VideoStatus.READY);
    expect(processed.duration_seconds).toBe(1);
    expect(processed.metadata).toMatchObject({
      videoCodec: 'mpeg4',
      width: 320,
      height: 240,
    });
    expect(processed.thumbnail_key).toBe(
      `channels/${channel.id}/videos/${video.id}/thumbnail.jpg`,
    );

    const downloadedThumbnail = join(fixtureDirectory, `${video.id}.jpg`);
    await storageService.downloadObject(
      processed.thumbnail_bucket!,
      processed.thumbnail_key!,
      downloadedThumbnail,
    );
    await expect(access(downloadedThumbnail)).resolves.toBeUndefined();
  }, 30000);

  it('should mark invalid media as error without exposing probe details', async () => {
    const video = await createVideo('invalid');
    const sourcePath = join(fixtureDirectory, `${video.id}.mp4`);
    await writeFile(sourcePath, 'not-a-video');
    await storageService.uploadObject(
      video.original_bucket,
      video.original_key,
      sourcePath,
      'video/mp4',
    );

    await expect(processor.process(jobFor(video))).rejects.toThrow(
      'MEDIA_PROCESSING_FAILED',
    );

    const processed = await videoRepository.findOneByOrFail({ id: video.id });
    expect(processed.status).toBe(VideoStatus.ERROR);
    expect(processed.processing_error).toBe('MEDIA_PROCESSING_FAILED');
    expect(processed.processing_error).not.toContain(sourcePath);
  }, 30000);

  async function createVideo(kind: string): Promise<Video> {
    const id = randomUUID();
    return videoRepository.save({
      id,
      channel_id: channel.id,
      title: `Worker ${kind} video`,
      slug: `worker-${kind}-${id}`,
      status: VideoStatus.PROCESSING,
      original_bucket: storageService.bucket,
      original_key: `integration/${id}/original.mp4`,
      thumbnail_bucket: null,
      thumbnail_key: null,
      multipart_upload_id: null,
      size_bytes: null,
      duration_seconds: null,
      metadata: null,
      processing_error: null,
    });
  }

  function jobFor(video: Video) {
    return {
      videoId: video.id,
      channelId: video.channel_id,
      originalBucket: video.original_bucket,
      originalKey: video.original_key,
    };
  }
});
