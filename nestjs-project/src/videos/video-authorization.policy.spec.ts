import { Video } from './entities/video.entity';
import { canAccessVideo } from './video-authorization.policy';

describe('canAccessVideo', () => {
  it('should allow a video owned by the channel', () => {
    const video = { channel_id: 'channel-id' } as Video;

    expect(canAccessVideo('channel-id', video)).toBe(true);
  });

  it('should deny a video owned by another channel', () => {
    const video = { channel_id: 'other-channel-id' } as Video;

    expect(canAccessVideo('channel-id', video)).toBe(false);
  });

  it('should deny a missing video', () => {
    expect(canAccessVideo('channel-id', null)).toBe(false);
  });
});
