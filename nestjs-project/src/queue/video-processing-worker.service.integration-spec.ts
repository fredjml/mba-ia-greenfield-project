import { randomUUID } from 'crypto';
import { Queue, QueueEvents } from 'bullmq';
import queueConfig from '../config/queue.config';
import { VideoProcessorService } from '../videos/video-processor.service';
import {
  PROCESS_VIDEO_JOB_NAME,
  type ProcessVideoJobData,
} from './video-processing-queue.service';
import { VideoProcessingWorkerService } from './video-processing-worker.service';

describe('VideoProcessingWorkerService (integration)', () => {
  const queueName = `video-processing-worker-test-${randomUUID()}`;
  const connection = {
    host: process.env.TEST_REDIS_HOST ?? process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
  };
  let queue: Queue<ProcessVideoJobData>;
  let queueEvents: QueueEvents;
  let workerService: VideoProcessingWorkerService;
  let processor: jest.Mocked<Pick<VideoProcessorService, 'process'>>;

  beforeAll(async () => {
    processor = { process: jest.fn().mockResolvedValue(undefined) };
    workerService = new VideoProcessingWorkerService(
      {
        ...connection,
        videoProcessingQueueName: queueName,
      } as ReturnType<typeof queueConfig>,
      processor as unknown as VideoProcessorService,
    );
    queue = new Queue(queueName, { connection });
    queueEvents = new QueueEvents(queueName, { connection });
    await queueEvents.waitUntilReady();
    workerService.onModuleInit();
  });

  afterAll(async () => {
    await workerService.onModuleDestroy();
    await queue.obliterate({ force: true });
    await queueEvents.close();
    await queue.close();
  });

  it('should consume a process-video job and delegate its payload', async () => {
    const data: ProcessVideoJobData = {
      videoId: randomUUID(),
      channelId: randomUUID(),
      originalBucket: 'streamtube-videos',
      originalKey: `integration/${randomUUID()}/original.mp4`,
    };
    const job = await queue.add(PROCESS_VIDEO_JOB_NAME, data);

    await expect(job.waitUntilFinished(queueEvents, 5000)).resolves.toBeNull();
    expect(processor.process).toHaveBeenCalledWith(data);
  });
});
