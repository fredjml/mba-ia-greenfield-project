import { VideoStatus } from './entities/video.entity';

export function canProcessVideo(status: VideoStatus): boolean {
  return status === VideoStatus.PROCESSING || status === VideoStatus.ERROR;
}

export function isVideoProcessingComplete(status: VideoStatus): boolean {
  return status === VideoStatus.READY;
}
