import { randomBytes, randomUUID } from 'crypto';
import { extname } from 'path';
import { Readable } from 'stream';
import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Channel } from '../channels/entities/channel.entity';
import {
  VideoChannelNotFoundException,
  VideoFileTooLargeException,
  VideoNotFoundException,
  VideoNotReadyException,
  VideoInvalidRangeException,
  VideoProcessingFailedException,
  VideoQueueException,
  VideoStorageException,
  VideoUploadAbortedException,
  VideoUploadNotCompleteException,
  VideoUploadValidationException,
} from '../common/exceptions/domain.exception';
import videoConfig from '../config/video.config';
import { VideoProcessingQueueService } from '../queue/video-processing-queue.service';
import { StorageService } from '../storage/storage.service';
import { CompleteVideoUploadDto } from './dto/complete-video-upload.dto';
import { InitVideoUploadDto } from './dto/init-video-upload.dto';
import { InitVideoUploadResponseDto } from './dto/init-video-upload-response.dto';
import { VideoDetailsResponseDto } from './dto/video-details-response.dto';
import { VideoUploadStatusResponseDto } from './dto/video-upload-status-response.dto';
import { Video, VideoStatus } from './entities/video.entity';
import { buildOriginalVideoKey } from './storage-key.util';
import { canAccessVideo } from './video-authorization.policy';
import { parseRangeHeader } from './range-header.util';

export interface VideoContentResponse {
  stream: Readable;
  contentType: string;
  contentLength: number;
  statusCode: 200 | 206;
  contentRange?: string;
  filename?: string;
}

@Injectable()
export class VideosService {
  constructor(
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    private readonly storageService: StorageService,
    private readonly processingQueue: VideoProcessingQueueService,
    @Inject(videoConfig.KEY)
    private readonly config: ConfigType<typeof videoConfig>,
  ) {}

  async getBySlug(
    userId: string,
    slug: string,
  ): Promise<VideoDetailsResponseDto> {
    const video = await this.findOwnedVideoBySlug(userId, slug);
    return {
      videoId: video.id,
      title: video.title,
      slug: video.slug,
      status: video.status,
      sizeBytes: video.size_bytes === null ? null : Number(video.size_bytes),
      durationSeconds: video.duration_seconds,
      metadata: video.metadata,
      processingError: video.processing_error,
      createdAt: video.created_at.toISOString(),
      updatedAt: video.updated_at.toISOString(),
    };
  }

  async streamVideo(
    userId: string,
    slug: string,
    rangeHeader?: string,
  ): Promise<VideoContentResponse> {
    const video = await this.findReadyOwnedVideo(userId, slug);

    try {
      const object = await this.storageService.getObjectMetadata(
        video.original_bucket,
        video.original_key,
      );
      const range = rangeHeader
        ? parseRangeHeader(rangeHeader, object.size)
        : undefined;
      if (rangeHeader && !range) throw new VideoInvalidRangeException();
      const requestedRange = range ?? undefined;

      const stream = await this.storageService.createObjectReadStream(
        video.original_bucket,
        video.original_key,
        requestedRange,
      );
      return {
        stream,
        contentType: object.contentType,
        contentLength: requestedRange?.length ?? object.size,
        statusCode: requestedRange ? 206 : 200,
        ...(requestedRange && {
          contentRange: `bytes ${requestedRange.start}-${requestedRange.end}/${object.size}`,
        }),
      };
    } catch (error) {
      if (error instanceof VideoInvalidRangeException) throw error;
      throw new VideoStorageException();
    }
  }

  async downloadVideo(
    userId: string,
    slug: string,
  ): Promise<VideoContentResponse> {
    const video = await this.findReadyOwnedVideo(userId, slug);

    try {
      const object = await this.storageService.getObjectMetadata(
        video.original_bucket,
        video.original_key,
      );
      const stream = await this.storageService.createObjectReadStream(
        video.original_bucket,
        video.original_key,
      );
      return {
        stream,
        contentType: object.contentType,
        contentLength: object.size,
        statusCode: 200,
        filename: `${video.slug}${extname(video.original_key)}`,
      };
    } catch {
      throw new VideoStorageException();
    }
  }

  async completeUpload(
    userId: string,
    videoId: string,
    dto: CompleteVideoUploadDto,
  ): Promise<VideoUploadStatusResponseDto> {
    const video = await this.findOwnedVideo(userId, videoId);

    if (video.status === VideoStatus.UPLOAD_ABORTED) {
      throw new VideoUploadAbortedException();
    }
    if (video.status === VideoStatus.PROCESSING) {
      return this.toStatusResponse(video);
    }
    if (video.status === VideoStatus.UPLOADED) {
      return this.enqueueProcessing(video);
    }
    if (
      video.status !== VideoStatus.UPLOAD_INITIATED ||
      video.multipart_upload_id !== dto.uploadId
    ) {
      throw new VideoUploadNotCompleteException();
    }

    try {
      await this.storageService.completeMultipartUpload(
        video.original_key,
        dto.uploadId,
        [...dto.parts].sort(
          (left, right) => left.partNumber - right.partNumber,
        ),
      );
    } catch {
      throw new VideoStorageException();
    }

    video.status = VideoStatus.UPLOADED;
    await this.videoRepository.save(video);
    return this.enqueueProcessing(video);
  }

  async abortUpload(userId: string, videoId: string): Promise<void> {
    const video = await this.findOwnedVideo(userId, videoId);

    if (video.status === VideoStatus.UPLOAD_ABORTED) return;
    if (
      video.status !== VideoStatus.UPLOAD_INITIATED ||
      !video.multipart_upload_id
    ) {
      throw new VideoUploadNotCompleteException();
    }

    try {
      await this.storageService.abortMultipartUpload(
        video.original_key,
        video.multipart_upload_id,
      );
    } catch {
      throw new VideoStorageException();
    }

    video.status = VideoStatus.UPLOAD_ABORTED;
    await this.videoRepository.save(video);
  }

  async initUpload(
    userId: string,
    dto: InitVideoUploadDto,
  ): Promise<InitVideoUploadResponseDto> {
    this.validateUpload(dto);

    const channel = await this.channelRepository.findOneBy({ user_id: userId });
    if (!channel) throw new VideoChannelNotFoundException();

    const videoId = randomUUID();
    const slug = this.createSlug(dto.title);
    const originalKey = buildOriginalVideoKey(
      channel.id,
      videoId,
      dto.filename,
    );

    let uploadId: string;
    try {
      uploadId = await this.storageService.createMultipartUpload({
        key: originalKey,
        contentType: dto.contentType,
      });
    } catch {
      throw new VideoStorageException();
    }

    try {
      const parts = await Promise.all(
        Array.from({ length: dto.parts }, async (_, index) => ({
          partNumber: index + 1,
          url: await this.storageService.createPresignedUploadPartUrl({
            key: originalKey,
            uploadId,
            partNumber: index + 1,
          }),
        })),
      );

      const video = await this.videoRepository.save(
        this.videoRepository.create({
          id: videoId,
          channel_id: channel.id,
          title: dto.title,
          slug,
          status: VideoStatus.UPLOAD_INITIATED,
          original_bucket: this.storageService.bucket,
          original_key: originalKey,
          multipart_upload_id: uploadId,
          size_bytes: String(dto.sizeBytes),
        }),
      );

      return {
        videoId: video.id,
        slug: video.slug,
        status: video.status,
        uploadId,
        partSize: this.config.multipartPartSizeBytes,
        parts,
      };
    } catch {
      await this.storageService
        .abortMultipartUpload(originalKey, uploadId)
        .catch(() => undefined);
      throw new VideoStorageException();
    }
  }

  private validateUpload(dto: InitVideoUploadDto): void {
    if (dto.sizeBytes > this.config.maxUploadSizeBytes) {
      throw new VideoFileTooLargeException();
    }
    if (!this.config.allowedContentTypes.includes(dto.contentType)) {
      throw new VideoUploadValidationException(
        'Unsupported video content type',
      );
    }
    if (dto.parts > this.config.maxMultipartParts) {
      throw new VideoUploadValidationException(
        'Too many multipart upload parts',
      );
    }

    const expectedParts = Math.ceil(
      dto.sizeBytes / this.config.multipartPartSizeBytes,
    );
    if (dto.parts !== expectedParts) {
      throw new VideoUploadValidationException(
        `Expected ${expectedParts} multipart upload parts`,
      );
    }
  }

  private async findOwnedVideo(
    userId: string,
    videoId: string,
  ): Promise<Video> {
    return this.findOwnedVideoWhere(userId, { id: videoId });
  }

  private async findOwnedVideoBySlug(
    userId: string,
    slug: string,
  ): Promise<Video> {
    return this.findOwnedVideoWhere(userId, { slug });
  }

  private async findOwnedVideoWhere(
    userId: string,
    where: FindOptionsWhere<Video>,
  ): Promise<Video> {
    const channel = await this.channelRepository.findOneBy({ user_id: userId });
    if (!channel) throw new VideoNotFoundException();

    const video = await this.videoRepository.findOneBy({
      ...where,
      channel_id: channel.id,
    });
    if (!canAccessVideo(channel.id, video)) throw new VideoNotFoundException();
    return video;
  }

  private async findReadyOwnedVideo(
    userId: string,
    slug: string,
  ): Promise<Video> {
    const video = await this.findOwnedVideoBySlug(userId, slug);
    if (video.status === VideoStatus.ERROR) {
      throw new VideoProcessingFailedException();
    }
    if (video.status !== VideoStatus.READY) {
      throw new VideoNotReadyException();
    }
    return video;
  }

  private async enqueueProcessing(
    video: Video,
  ): Promise<VideoUploadStatusResponseDto> {
    try {
      await this.processingQueue.enqueue({
        videoId: video.id,
        channelId: video.channel_id,
        originalBucket: video.original_bucket,
        originalKey: video.original_key,
      });
    } catch {
      throw new VideoQueueException();
    }

    video.status = VideoStatus.PROCESSING;
    await this.videoRepository.save(video);
    return this.toStatusResponse(video);
  }

  private toStatusResponse(video: Video): VideoUploadStatusResponseDto {
    return { videoId: video.id, slug: video.slug, status: video.status };
  }

  private createSlug(title: string): string {
    const base = title
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 67);
    const suffix = randomBytes(6).toString('hex');
    return `${base || 'video'}-${suffix}`;
  }
}
