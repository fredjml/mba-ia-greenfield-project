import { ApiProperty } from '@nestjs/swagger';
import { VideoStatus } from '../entities/video.entity';

export class VideoUploadStatusResponseDto {
  @ApiProperty({ format: 'uuid' })
  videoId: string;

  @ApiProperty()
  slug: string;

  @ApiProperty({ enum: VideoStatus })
  status: VideoStatus;
}
