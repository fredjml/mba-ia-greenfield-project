import { VideoStatus } from './entities/video.entity';
import {
  canProcessVideo,
  isVideoProcessingComplete,
} from './video-status.util';

describe('video processing status rules', () => {
  it.each([VideoStatus.PROCESSING, VideoStatus.ERROR])(
    'allows processing from %s',
    (status) => {
      expect(canProcessVideo(status)).toBe(true);
    },
  );

  it.each([
    VideoStatus.DRAFT,
    VideoStatus.UPLOAD_INITIATED,
    VideoStatus.UPLOADED,
    VideoStatus.READY,
    VideoStatus.UPLOAD_ABORTED,
  ])('rejects processing from %s', (status) => {
    expect(canProcessVideo(status)).toBe(false);
  });

  it('treats only ready as completed processing', () => {
    expect(isVideoProcessingComplete(VideoStatus.READY)).toBe(true);
    expect(isVideoProcessingComplete(VideoStatus.PROCESSING)).toBe(false);
    expect(isVideoProcessingComplete(VideoStatus.ERROR)).toBe(false);
  });
});
