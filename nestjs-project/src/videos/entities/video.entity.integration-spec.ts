import { DataSource, Repository } from 'typeorm';
import { RefreshToken } from '../../auth/entities/refresh-token.entity';
import { VerificationToken } from '../../auth/entities/verification-token.entity';
import { Channel } from '../../channels/entities/channel.entity';
import {
  cleanAllTables,
  createTestDataSource,
} from '../../test/create-test-data-source';
import { User } from '../../users/entities/user.entity';
import { Video, VideoStatus } from './video.entity';

const ALL_ENTITIES = [User, Channel, RefreshToken, VerificationToken, Video];

describe('Video entity (integration)', () => {
  let dataSource: DataSource;
  let userRepository: Repository<User>;
  let channelRepository: Repository<Channel>;
  let videoRepository: Repository<Video>;

  beforeAll(async () => {
    dataSource = createTestDataSource(ALL_ENTITIES);
    await dataSource.initialize();
    userRepository = dataSource.getRepository(User);
    channelRepository = dataSource.getRepository(Channel);
    videoRepository = dataSource.getRepository(Video);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
  });

  let userCounter = 0;
  async function createChannel(): Promise<Channel> {
    const user = await userRepository.save(
      userRepository.create({
        email: `video_user_${++userCounter}@example.com`,
        password: 'hashed',
      }),
    );

    return channelRepository.save(
      channelRepository.create({
        name: 'Video Channel',
        nickname: `video-channel-${userCounter}`,
        user_id: user.id,
      }),
    );
  }

  it('should persist video ownership, storage keys and default status', async () => {
    const channel = await createChannel();

    const video = await videoRepository.save(
      videoRepository.create({
        channel_id: channel.id,
        title: 'My first upload',
        slug: 'my-first-upload',
        original_bucket: 'streamtube-videos',
        original_key: `channels/${channel.id}/videos/original.mp4`,
      }),
    );

    expect(video.status).toBe(VideoStatus.DRAFT);
    expect(video.channel_id).toBe(channel.id);
    expect(video.thumbnail_key).toBeNull();
    expect(video.duration_seconds).toBeNull();
    expect(video.metadata).toBeNull();
  });

  it('should enforce a unique slug', async () => {
    const channel = await createChannel();

    await videoRepository.save(
      videoRepository.create({
        channel_id: channel.id,
        title: 'First',
        slug: 'same-slug',
        original_bucket: 'streamtube-videos',
        original_key: `channels/${channel.id}/videos/first.mp4`,
      }),
    );

    await expect(
      videoRepository.save(
        videoRepository.create({
          channel_id: channel.id,
          title: 'Second',
          slug: 'same-slug',
          original_bucket: 'streamtube-videos',
          original_key: `channels/${channel.id}/videos/second.mp4`,
        }),
      ),
    ).rejects.toThrow();
  });

  it('should load the related channel via the ManyToOne relation', async () => {
    const channel = await createChannel();
    await videoRepository.save(
      videoRepository.create({
        channel_id: channel.id,
        title: 'Relation',
        slug: 'relation-video',
        original_bucket: 'streamtube-videos',
        original_key: `channels/${channel.id}/videos/relation.mp4`,
      }),
    );

    const found = await videoRepository.findOne({
      where: { slug: 'relation-video' },
      relations: ['channel'],
    });

    expect(found?.channel.nickname).toBe(channel.nickname);
  });

  it('should enforce the channel foreign key', async () => {
    await expect(
      videoRepository.save(
        videoRepository.create({
          channel_id: '00000000-0000-0000-0000-000000000000',
          title: 'Missing channel',
          slug: 'missing-channel',
          original_bucket: 'streamtube-videos',
          original_key: 'channels/missing/videos/original.mp4',
        }),
      ),
    ).rejects.toThrow();
  });
});
