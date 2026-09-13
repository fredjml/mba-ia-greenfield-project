import { registerAs } from '@nestjs/config';

export default registerAs('storage', () => ({
  endpoint: process.env.STORAGE_ENDPOINT || 'http://minio:9000',
  publicEndpoint:
    process.env.STORAGE_PUBLIC_ENDPOINT || 'http://localhost:9000',
  region: process.env.STORAGE_REGION || 'us-east-1',
  accessKeyId: process.env.STORAGE_ACCESS_KEY_ID || 'streamtube',
  secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY || 'streamtube-secret',
  bucket: process.env.STORAGE_BUCKET || 'streamtube-videos',
  forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE !== 'false',
  presignedUrlExpiresSeconds: parseInt(
    process.env.STORAGE_PRESIGNED_URL_EXPIRES_SECONDS || '900',
    10,
  ),
}));
