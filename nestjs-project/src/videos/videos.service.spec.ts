import { Readable } from 'stream';
import type { Repository } from 'typeorm';
import { Channel } from '../channels/entities/channel.entity';
import {
  VideoInvalidRangeException,
  VideoNotFoundException,
  VideoNotReadyException,
  VideoProcessingFailedException,
  VideoQueueException,
  VideoUploadAbortedException,
} from '../common/exceptions/domain.exception';
import type videoConfig from '../config/video.config';
import { VideoProcessingQueueService } from '../queue/video-processing-queue.service';
import { StorageService } from '../storage/storage.service';
import { Video, VideoStatus } from './entities/video.entity';
import { VideosService } from './videos.service';

describe('VideosService upload transitions', () => {
  const channel = { id: 'channel-id', user_id: 'user-id' } as Channel;
  let video: Video;
  let videoRepository: jest.Mocked<
    Pick<Repository<Video>, 'findOneBy' | 'save'>
  >;
  let channelRepository: jest.Mocked<Pick<Repository<Channel>, 'findOneBy'>>;
  let storageService: jest.Mocked<
    Pick<
      StorageService,
      | 'completeMultipartUpload'
      | 'abortMultipartUpload'
      | 'getObjectMetadata'
      | 'createObjectReadStream'
    >
  >;
  let processingQueue: jest.Mocked<
    Pick<VideoProcessingQueueService, 'enqueue'>
  >;
  let service: VideosService;

  beforeEach(() => {
    video = {
      id: 'video-id',
      channel_id: channel.id,
      slug: 'video-slug',
      status: VideoStatus.UPLOAD_INITIATED,
      original_bucket: 'videos',
      original_key: 'channels/channel-id/videos/video-id/original.mp4',
      multipart_upload_id: 'upload-id',
      title: 'Video title',
      size_bytes: '100',
      duration_seconds: null,
      metadata: null,
      processing_error: null,
      created_at: new Date('2026-09-13T00:00:00.000Z'),
      updated_at: new Date('2026-09-13T00:00:00.000Z'),
    } as Video;
    videoRepository = {
      findOneBy: jest.fn().mockResolvedValue(video),
      save: jest
        .fn()
        .mockImplementation((entity) => Promise.resolve(entity as Video)),
    };
    channelRepository = {
      findOneBy: jest.fn().mockResolvedValue(channel),
    };
    storageService = {
      completeMultipartUpload: jest.fn().mockResolvedValue(undefined),
      abortMultipartUpload: jest.fn().mockResolvedValue(undefined),
      getObjectMetadata: jest
        .fn()
        .mockResolvedValue({ size: 100, contentType: 'video/mp4' }),
      createObjectReadStream: jest
        .fn()
        .mockResolvedValue(Readable.from(Buffer.alloc(10))),
    };
    processingQueue = { enqueue: jest.fn().mockResolvedValue(undefined) };

    service = new VideosService(
      videoRepository as unknown as Repository<Video>,
      channelRepository as unknown as Repository<Channel>,
      storageService as unknown as StorageService,
      processingQueue as unknown as VideoProcessingQueueService,
      {
        maxUploadSizeBytes: 100,
        multipartPartSizeBytes: 10,
        maxMultipartParts: 10,
        allowedContentTypes: ['video/mp4'],
      } as ReturnType<typeof videoConfig>,
    );
  });

  it('should complete storage, persist uploaded and enqueue processing', async () => {
    const result = await service.completeUpload('user-id', video.id, {
      uploadId: 'upload-id',
      parts: [{ partNumber: 1, etag: 'etag-1' }],
    });

    expect(storageService.completeMultipartUpload).toHaveBeenCalledWith(
      video.original_key,
      'upload-id',
      [{ partNumber: 1, etag: 'etag-1' }],
    );
    expect(processingQueue.enqueue).toHaveBeenCalledTimes(1);
    expect(videoRepository.save).toHaveBeenCalledTimes(2);
    expect(result.status).toBe(VideoStatus.PROCESSING);
  });

  it('should not complete or enqueue a video already processing', async () => {
    video.status = VideoStatus.PROCESSING;

    const result = await service.completeUpload('user-id', video.id, {
      uploadId: 'upload-id',
      parts: [{ partNumber: 1, etag: 'etag-1' }],
    });

    expect(storageService.completeMultipartUpload).not.toHaveBeenCalled();
    expect(processingQueue.enqueue).not.toHaveBeenCalled();
    expect(result.status).toBe(VideoStatus.PROCESSING);
  });

  it('should retry enqueue from uploaded without completing storage again', async () => {
    video.status = VideoStatus.UPLOADED;

    await service.completeUpload('user-id', video.id, {
      uploadId: 'upload-id',
      parts: [{ partNumber: 1, etag: 'etag-1' }],
    });

    expect(storageService.completeMultipartUpload).not.toHaveBeenCalled();
    expect(processingQueue.enqueue).toHaveBeenCalledTimes(1);
    expect(video.status).toBe(VideoStatus.PROCESSING);
  });

  it('should preserve uploaded status when enqueue fails', async () => {
    processingQueue.enqueue.mockRejectedValueOnce(new Error('redis down'));

    await expect(
      service.completeUpload('user-id', video.id, {
        uploadId: 'upload-id',
        parts: [{ partNumber: 1, etag: 'etag-1' }],
      }),
    ).rejects.toBeInstanceOf(VideoQueueException);
    expect(video.status).toBe(VideoStatus.UPLOADED);
  });

  it('should abort an initiated upload and be idempotent afterwards', async () => {
    await service.abortUpload('user-id', video.id);

    expect(storageService.abortMultipartUpload).toHaveBeenCalledTimes(1);
    expect(video.status).toBe(VideoStatus.UPLOAD_ABORTED);

    await service.abortUpload('user-id', video.id);
    expect(storageService.abortMultipartUpload).toHaveBeenCalledTimes(1);
  });

  it('should reject completing an aborted upload', async () => {
    video.status = VideoStatus.UPLOAD_ABORTED;

    await expect(
      service.completeUpload('user-id', video.id, {
        uploadId: 'upload-id',
        parts: [{ partNumber: 1, etag: 'etag-1' }],
      }),
    ).rejects.toBeInstanceOf(VideoUploadAbortedException);
  });

  it('should expose owned video status and sanitized metadata by slug', async () => {
    video.metadata = { videoCodec: 'h264' };

    await expect(service.getBySlug('user-id', video.slug)).resolves.toEqual({
      videoId: video.id,
      title: video.title,
      slug: video.slug,
      status: video.status,
      sizeBytes: 100,
      durationSeconds: null,
      metadata: { videoCodec: 'h264' },
      processingError: null,
      createdAt: '2026-09-13T00:00:00.000Z',
      updatedAt: '2026-09-13T00:00:00.000Z',
    });
  });

  it('should create a partial stream for a valid range', async () => {
    video.status = VideoStatus.READY;

    const result = await service.streamVideo(
      'user-id',
      video.slug,
      'bytes=10-19',
    );

    expect(result).toMatchObject({
      contentType: 'video/mp4',
      contentLength: 10,
      statusCode: 206,
      contentRange: 'bytes 10-19/100',
    });
    expect(storageService.createObjectReadStream).toHaveBeenCalledWith(
      video.original_bucket,
      video.original_key,
      { start: 10, end: 19, length: 10 },
    );
  });

  it('should reject invalid ranges without opening the object stream', async () => {
    video.status = VideoStatus.READY;

    await expect(
      service.streamVideo('user-id', video.slug, 'bytes=100-100'),
    ).rejects.toBeInstanceOf(VideoInvalidRangeException);
    expect(storageService.createObjectReadStream).not.toHaveBeenCalled();
  });

  it('should reject content access when processing is incomplete or failed', async () => {
    video.status = VideoStatus.PROCESSING;
    await expect(
      service.downloadVideo('user-id', video.slug),
    ).rejects.toBeInstanceOf(VideoNotReadyException);

    video.status = VideoStatus.ERROR;
    await expect(
      service.streamVideo('user-id', video.slug),
    ).rejects.toBeInstanceOf(VideoProcessingFailedException);
  });

  it('should reject a repository result that does not belong to the channel', async () => {
    video.channel_id = 'other-channel-id';

    await expect(
      service.getBySlug('user-id', video.slug),
    ).rejects.toBeInstanceOf(VideoNotFoundException);
  });
});
