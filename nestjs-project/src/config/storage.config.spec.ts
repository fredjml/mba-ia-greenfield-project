import { ConfigModule, type ConfigType } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import storageConfig from './storage.config';

const ORIGINAL_ENV = process.env;
const STORAGE_ENV_KEYS = [
  'STORAGE_ENDPOINT',
  'STORAGE_PUBLIC_ENDPOINT',
  'STORAGE_REGION',
  'STORAGE_ACCESS_KEY_ID',
  'STORAGE_SECRET_ACCESS_KEY',
  'STORAGE_BUCKET',
  'STORAGE_FORCE_PATH_STYLE',
  'STORAGE_PRESIGNED_URL_EXPIRES_SECONDS',
];

const loadConfig = async (
  env: Record<string, string | undefined> = {},
): Promise<ConfigType<typeof storageConfig>> => {
  process.env = { ...ORIGINAL_ENV, ...env };
  for (const key of STORAGE_ENV_KEYS) {
    if (!(key in env)) {
      delete process.env[key];
    }
  }

  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ ignoreEnvFile: true, load: [storageConfig] }),
    ],
  }).compile();

  const config = module.get<ConfigType<typeof storageConfig>>(
    storageConfig.KEY,
  );
  await module.close();
  return config;
};

describe('storageConfig', () => {
  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('should provide MinIO-compatible defaults', async () => {
    const config = await loadConfig();

    expect(config.endpoint).toBe('http://minio:9000');
    expect(config.publicEndpoint).toBe('http://localhost:9000');
    expect(config.bucket).toBe('streamtube-videos');
    expect(config.forcePathStyle).toBe(true);
    expect(config.presignedUrlExpiresSeconds).toBe(900);
  });

  it('should read explicit S3-compatible settings', async () => {
    const config = await loadConfig({
      STORAGE_ENDPOINT: 'http://storage:9000',
      STORAGE_PUBLIC_ENDPOINT: 'http://localhost:19000',
      STORAGE_REGION: 'sa-east-1',
      STORAGE_ACCESS_KEY_ID: 'key',
      STORAGE_SECRET_ACCESS_KEY: 'secret',
      STORAGE_BUCKET: 'videos',
      STORAGE_FORCE_PATH_STYLE: 'false',
      STORAGE_PRESIGNED_URL_EXPIRES_SECONDS: '120',
    });

    expect(config).toMatchObject({
      endpoint: 'http://storage:9000',
      publicEndpoint: 'http://localhost:19000',
      region: 'sa-east-1',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      bucket: 'videos',
      forcePathStyle: false,
      presignedUrlExpiresSeconds: 120,
    });
  });
});
