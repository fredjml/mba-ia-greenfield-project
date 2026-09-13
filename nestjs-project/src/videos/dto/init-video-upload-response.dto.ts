import { ApiProperty } from '@nestjs/swagger';
import { VideoStatus } from '../entities/video.entity';

export class UploadPartDto {
  @ApiProperty({ example: 1 })
  partNumber: number;

  @ApiProperty({ example: 'http://localhost:9000/bucket/key?...' })
  url: string;
}

export class InitVideoUploadResponseDto {
  @ApiProperty({ format: 'uuid' })
  videoId: string;

  @ApiProperty({ example: 'my-video-a1b2c3d4e5f6' })
  slug: string;

  @ApiProperty({ enum: VideoStatus })
  status: VideoStatus;

  @ApiProperty()
  uploadId: string;

  @ApiProperty({ example: 10485760 })
  partSize: number;

  @ApiProperty({ type: [UploadPartDto] })
  parts: UploadPartDto[];
}
