import { Video } from './entities/video.entity';

export function canAccessVideo(
  channelId: string,
  video: Pick<Video, 'channel_id'> | null,
): video is Video {
  return video?.channel_id === channelId;
}
