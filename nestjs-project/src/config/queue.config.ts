import { registerAs } from '@nestjs/config';

export default registerAs('queue', () => ({
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  videoProcessingQueueName:
    process.env.VIDEO_PROCESSING_QUEUE_NAME || 'video-processing',
}));
