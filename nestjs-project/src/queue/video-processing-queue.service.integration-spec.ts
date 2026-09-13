import { randomUUID } from 'crypto';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { Queue } from 'bullmq';
import queueConfig from '../config/queue.config';
import {
  PROCESS_VIDEO_JOB_NAME,
  VideoProcessingQueueService,
} from './video-processing-queue.service';

describe('VideoProcessingQueueService (integration)', () => {
  const originalEnv = process.env;
  const queueName = `video-processing-test-${randomUUID()}`;
  let module: TestingModule;
  let service: VideoProcessingQueueService;
  let inspectionQueue: Queue;

  beforeAll(async () => {
    process.env = {
      ...originalEnv,
      REDIS_HOST:
        process.env.TEST_REDIS_HOST ?? process.env.REDIS_HOST ?? 'redis',
      VIDEO_PROCESSING_QUEUE_NAME: queueName,
    };
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, load: [queueConfig] }),
      ],
      providers: [VideoProcessingQueueService],
    }).compile();
    service = module.get(VideoProcessingQueueService);
    inspectionQueue = new Queue(queueName, {
      connection: { host: process.env.REDIS_HOST, port: 6379 },
    });
  });

  afterAll(async () => {
    await inspectionQueue.obliterate({ force: true });
    await inspectionQueue.close();
    await module.close();
    process.env = originalEnv;
  });

  it('should enqueue only one processing job for the same video', async () => {
    const videoId = randomUUID();
    const data = {
      videoId,
      channelId: randomUUID(),
      originalBucket: 'streamtube-videos',
      originalKey: `videos/${videoId}/original.mp4`,
    };

    await service.enqueue(data);
    await service.enqueue(data);

    const jobs = await inspectionQueue.getJobs(['wait', 'delayed']);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe(`${PROCESS_VIDEO_JOB_NAME}-${videoId}`);
    expect(jobs[0].data).toEqual(data);
  });
});
