import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import queueConfig from '../config/queue.config';
import { VideoProcessingQueueService } from './video-processing-queue.service';

@Module({
  imports: [ConfigModule.forFeature(queueConfig)],
  providers: [VideoProcessingQueueService],
  exports: [VideoProcessingQueueService],
})
export class QueueModule {}
