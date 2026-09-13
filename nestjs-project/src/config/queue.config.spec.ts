import { ConfigModule, type ConfigType } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import queueConfig from './queue.config';

const ORIGINAL_ENV = process.env;
const QUEUE_ENV_KEYS = [
  'REDIS_HOST',
  'REDIS_PORT',
  'VIDEO_PROCESSING_QUEUE_NAME',
];

const loadConfig = async (
  env: Record<string, string | undefined> = {},
): Promise<ConfigType<typeof queueConfig>> => {
  process.env = { ...ORIGINAL_ENV, ...env };
  for (const key of QUEUE_ENV_KEYS) {
    if (!(key in env)) {
      delete process.env[key];
    }
  }

  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ ignoreEnvFile: true, load: [queueConfig] }),
    ],
  }).compile();

  const config = module.get<ConfigType<typeof queueConfig>>(queueConfig.KEY);
  await module.close();
  return config;
};

describe('queueConfig', () => {
  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('should default to the Redis Compose service', async () => {
    const config = await loadConfig();

    expect(config.host).toBe('redis');
    expect(config.port).toBe(6379);
    expect(config.videoProcessingQueueName).toBe('video-processing');
  });

  it('should read explicit Redis settings', async () => {
    const config = await loadConfig({
      REDIS_HOST: 'redis.internal',
      REDIS_PORT: '6380',
      VIDEO_PROCESSING_QUEUE_NAME: 'custom-video-processing',
    });

    expect(config).toMatchObject({
      host: 'redis.internal',
      port: 6380,
      videoProcessingQueueName: 'custom-video-processing',
    });
  });
});
