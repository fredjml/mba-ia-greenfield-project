import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ProcessVideoJobData } from '../queue/video-processing-queue.service';
import { StorageService } from '../storage/storage.service';
import { Video, VideoStatus } from './entities/video.entity';
import { MediaService } from './media.service';
import {
  canProcessVideo,
  isVideoProcessingComplete,
} from './video-status.util';

const PROCESSING_ERROR_CODE = 'MEDIA_PROCESSING_FAILED';

@Injectable()
export class VideoProcessorService {
  constructor(
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,
    private readonly storageService: StorageService,
    private readonly mediaService: MediaService,
  ) {}

  async process(data: ProcessVideoJobData): Promise<void> {
    const video = await this.videoRepository.findOneBy({ id: data.videoId });
    if (!video) throw new Error(PROCESSING_ERROR_CODE);
    if (isVideoProcessingComplete(video.status)) return;
    if (!canProcessVideo(video.status) || !this.matchesJob(video, data)) {
      throw new Error(PROCESSING_ERROR_CODE);
    }

    video.status = VideoStatus.PROCESSING;
    video.processing_error = null;
    await this.videoRepository.save(video);

    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'streamtube-'));
    const inputPath = join(temporaryDirectory, 'original');
    const thumbnailPath = join(temporaryDirectory, 'thumbnail.jpg');

    try {
      await this.storageService.downloadObject(
        video.original_bucket,
        video.original_key,
        inputPath,
      );
      const mediaInfo = await this.mediaService.probe(inputPath);
      await this.mediaService.createThumbnail(inputPath, thumbnailPath);

      const thumbnailKey = `channels/${video.channel_id}/videos/${video.id}/thumbnail.jpg`;
      await this.storageService.uploadObject(
        this.storageService.bucket,
        thumbnailKey,
        thumbnailPath,
        'image/jpeg',
      );

      video.duration_seconds = mediaInfo.durationSeconds;
      video.metadata = mediaInfo.metadata;
      video.thumbnail_bucket = this.storageService.bucket;
      video.thumbnail_key = thumbnailKey;
      video.processing_error = null;
      video.status = VideoStatus.READY;
      await this.videoRepository.save(video);
    } catch {
      video.status = VideoStatus.ERROR;
      video.processing_error = PROCESSING_ERROR_CODE;
      await this.videoRepository.save(video);
      throw new Error(PROCESSING_ERROR_CODE);
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }

  private matchesJob(video: Video, data: ProcessVideoJobData): boolean {
    return (
      video.channel_id === data.channelId &&
      video.original_bucket === data.originalBucket &&
      video.original_key === data.originalKey
    );
  }
}
