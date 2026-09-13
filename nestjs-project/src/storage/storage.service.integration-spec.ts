import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import storageConfig from '../config/storage.config';
import { StorageService } from './storage.service';

describe('StorageService (integration)', () => {
  const originalEnv = process.env;
  let module: TestingModule;
  let storageService: StorageService;

  beforeAll(async () => {
    process.env = {
      ...originalEnv,
      STORAGE_ENDPOINT:
        process.env.TEST_STORAGE_ENDPOINT ?? 'http://localhost:9000',
      STORAGE_PUBLIC_ENDPOINT:
        process.env.TEST_STORAGE_PUBLIC_ENDPOINT ?? 'http://localhost:9000',
    };

    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, load: [storageConfig] }),
      ],
      providers: [StorageService],
    }).compile();

    storageService = module.get(StorageService);
  });

  afterAll(async () => {
    await module.close();
    process.env = originalEnv;
  });

  it('should create, upload and complete a multipart upload', async () => {
    const key = `integration/${crypto.randomUUID()}/original.mp4`;
    const uploadId = await storageService.createMultipartUpload({
      key,
      contentType: 'video/mp4',
    });

    const url = await storageService.createPresignedUploadPartUrl({
      key,
      uploadId,
      partNumber: 1,
    });
    const parsedUrl = new URL(url);

    expect(uploadId).toBeTruthy();
    expect(parsedUrl.origin).toBe('http://localhost:9000');
    expect(parsedUrl.searchParams.get('partNumber')).toBe('1');
    expect(parsedUrl.searchParams.get('uploadId')).toBe(uploadId);
    expect(parsedUrl.searchParams.get('X-Amz-Signature')).toBeTruthy();

    const uploadResponse = await fetch(url, {
      method: 'PUT',
      body: Buffer.alloc(1024, 1),
    });
    const etag = uploadResponse.headers.get('etag');

    expect(uploadResponse.ok).toBe(true);
    expect(etag).toBeTruthy();
    await storageService.completeMultipartUpload(key, uploadId, [
      { partNumber: 1, etag: etag! },
    ]);
  });

  it('should abort a multipart upload', async () => {
    const key = `integration/${crypto.randomUUID()}/aborted.mp4`;
    const uploadId = await storageService.createMultipartUpload({
      key,
      contentType: 'video/mp4',
    });

    await expect(
      storageService.abortMultipartUpload(key, uploadId),
    ).resolves.toBeUndefined();
  });
});
