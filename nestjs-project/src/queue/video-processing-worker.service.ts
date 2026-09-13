import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Worker } from 'bullmq';
import queueConfig from '../config/queue.config';
import { VideoProcessorService } from '../videos/video-processor.service';
import {
  PROCESS_VIDEO_JOB_NAME,
  type ProcessVideoJobData,
} from './video-processing-queue.service';

@Injectable()
export class VideoProcessingWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private worker: Worker<ProcessVideoJobData> | undefined;

  constructor(
    @Inject(queueConfig.KEY)
    private readonly config: ConfigType<typeof queueConfig>,
    private readonly processor: VideoProcessorService,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<ProcessVideoJobData>(
      this.config.videoProcessingQueueName,
      async (job) => {
        if (job.name !== PROCESS_VIDEO_JOB_NAME) {
          throw new Error('UNSUPPORTED_VIDEO_JOB');
        }
        await this.processor.process(job.data);
      },
      {
        connection: { host: this.config.host, port: this.config.port },
        concurrency: 1,
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
