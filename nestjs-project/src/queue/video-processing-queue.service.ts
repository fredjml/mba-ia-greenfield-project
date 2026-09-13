import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Queue } from 'bullmq';
import queueConfig from '../config/queue.config';

export const PROCESS_VIDEO_JOB_NAME = 'process-video';

export interface ProcessVideoJobData {
  videoId: string;
  channelId: string;
  originalBucket: string;
  originalKey: string;
}

@Injectable()
export class VideoProcessingQueueService implements OnModuleDestroy {
  private readonly queue: Queue<ProcessVideoJobData>;

  constructor(
    @Inject(queueConfig.KEY)
    config: ConfigType<typeof queueConfig>,
  ) {
    this.queue = new Queue(config.videoProcessingQueueName, {
      connection: { host: config.host, port: config.port },
    });
  }

  async enqueue(data: ProcessVideoJobData): Promise<void> {
    await this.queue.add(PROCESS_VIDEO_JOB_NAME, data, {
      jobId: `${PROCESS_VIDEO_JOB_NAME}-${data.videoId}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
