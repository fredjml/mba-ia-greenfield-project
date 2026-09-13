import { buildOriginalVideoKey } from './storage-key.util';

describe('buildOriginalVideoKey', () => {
  it('should build a deterministic key scoped by channel and video', () => {
    expect(
      buildOriginalVideoKey('channel-id', 'video-id', 'Recording.MP4'),
    ).toBe('channels/channel-id/videos/video-id/original.mp4');
  });

  it('should not include path segments or unsafe extensions from the filename', () => {
    expect(
      buildOriginalVideoKey(
        'channel-id',
        'video-id',
        '../../recording.bad-ext!',
      ),
    ).toBe('channels/channel-id/videos/video-id/original');
  });
});
