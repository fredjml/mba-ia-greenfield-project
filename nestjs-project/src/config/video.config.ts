import { registerAs } from '@nestjs/config';

const DEFAULT_MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024 * 1024;
const DEFAULT_MULTIPART_PART_SIZE_BYTES = 10 * 1024 * 1024;

export default registerAs('video', () => ({
  maxUploadSizeBytes: parseInt(
    process.env.VIDEO_MAX_UPLOAD_SIZE_BYTES ||
      String(DEFAULT_MAX_UPLOAD_SIZE_BYTES),
    10,
  ),
  multipartPartSizeBytes: parseInt(
    process.env.VIDEO_MULTIPART_PART_SIZE_BYTES ||
      String(DEFAULT_MULTIPART_PART_SIZE_BYTES),
    10,
  ),
  maxMultipartParts: parseInt(
    process.env.VIDEO_MAX_MULTIPART_PARTS || '10000',
    10,
  ),
  allowedContentTypes: (
    process.env.VIDEO_ALLOWED_CONTENT_TYPES || 'video/mp4,video/webm'
  )
    .split(',')
    .map((contentType) => contentType.trim())
    .filter(Boolean),
}));
