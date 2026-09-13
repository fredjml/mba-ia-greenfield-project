import { access } from 'fs/promises';
import { dirname } from 'path';
import type { Repository } from 'typeorm';
import type { ProcessVideoJobData } from '../queue/video-processing-queue.service';
import { StorageService } from '../storage/storage.service';
import { Video, VideoStatus } from './entities/video.entity';
import { MediaService } from './media.service';
import { VideoProcessorService } from './video-processor.service';

describe('VideoProcessorService', () => {
  let video: Video;
  let repository: jest.Mocked<Pick<Repository<Video>, 'findOneBy' | 'save'>>;
  let storage: jest.Mocked<
    Pick<StorageService, 'downloadObject' | 'uploadObject'>
  > & { bucket: string };
  let media: jest.Mocked<Pick<MediaService, 'probe' | 'createThumbnail'>>;
  let service: VideoProcessorService;
  let jobData: ProcessVideoJobData;
  let savedStatuses: VideoStatus[];

  beforeEach(() => {
    video = {
      id: 'video-id',
      channel_id: 'channel-id',
      status: VideoStatus.PROCESSING,
      original_bucket: 'videos',
      original_key: 'channels/channel-id/videos/video-id/original.mp4',
      processing_error: null,
    } as Video;
    jobData = {
      videoId: video.id,
      channelId: video.channel_id,
      originalBucket: video.original_bucket,
      originalKey: video.original_key,
    };
    savedStatuses = [];
    repository = {
      findOneBy: jest.fn().mockResolvedValue(video),
      save: jest.fn().mockImplementation((entity: Video) => {
        savedStatuses.push(entity.status);
        return Promise.resolve(entity);
      }),
    };
    storage = {
      bucket: 'videos',
      downloadObject: jest.fn().mockResolvedValue(undefined),
      uploadObject: jest.fn().mockResolvedValue(undefined),
    };
    media = {
      probe: jest.fn().mockResolvedValue({
        durationSeconds: 2,
        metadata: {
          formatName: 'mov,mp4',
          videoCodec: 'h264',
          width: 320,
          height: 240,
        },
      }),
      createThumbnail: jest.fn().mockResolvedValue(undefined),
    };
    service = new VideoProcessorService(
      repository as unknown as Repository<Video>,
      storage as unknown as StorageService,
      media as unknown as MediaService,
    );
  });

  it('should persist media data and mark a processed video as ready', async () => {
    let temporaryInputPath = '';
    storage.downloadObject.mockImplementation(
      (_bucket, _key, destinationPath) => {
        temporaryInputPath = destinationPath;
        return Promise.resolve();
      },
    );

    await service.process(jobData);

    expect(savedStatuses).toEqual([VideoStatus.PROCESSING, VideoStatus.READY]);
    expect(video).toMatchObject({
      status: VideoStatus.READY,
      duration_seconds: 2,
      thumbnail_bucket: 'videos',
      thumbnail_key: 'channels/channel-id/videos/video-id/thumbnail.jpg',
      processing_error: null,
    });
    expect(storage.uploadObject).toHaveBeenCalledWith(
      'videos',
      video.thumbnail_key,
      expect.stringMatching(/thumbnail\.jpg$/),
      'image/jpeg',
    );
    await expect(access(dirname(temporaryInputPath))).rejects.toThrow();
  });

  it('should be idempotent when the video is already ready', async () => {
    video.status = VideoStatus.READY;

    await service.process(jobData);

    expect(repository.save).not.toHaveBeenCalled();
    expect(storage.downloadObject).not.toHaveBeenCalled();
  });

  it('should reject a job whose ownership or object does not match', async () => {
    jobData.originalKey = 'channels/other/videos/video-id/original.mp4';

    await expect(service.process(jobData)).rejects.toThrow(
      'MEDIA_PROCESSING_FAILED',
    );
    expect(repository.save).not.toHaveBeenCalled();
    expect(storage.downloadObject).not.toHaveBeenCalled();
  });

  it('should persist a sanitized error and remove temporary files on failure', async () => {
    let temporaryInputPath = '';
    storage.downloadObject.mockImplementation(
      (_bucket, _key, destinationPath) => {
        temporaryInputPath = destinationPath;
        return Promise.resolve();
      },
    );
    media.probe.mockRejectedValue(
      new Error('ffprobe failed at C:\\secret\\original.mp4'),
    );

    await expect(service.process(jobData)).rejects.toThrow(
      'MEDIA_PROCESSING_FAILED',
    );

    expect(video.status).toBe(VideoStatus.ERROR);
    expect(video.processing_error).toBe('MEDIA_PROCESSING_FAILED');
    expect(video.processing_error).not.toContain('secret');
    expect(savedStatuses).toEqual([VideoStatus.PROCESSING, VideoStatus.ERROR]);
    await expect(access(dirname(temporaryInputPath))).rejects.toThrow();
  });
});
