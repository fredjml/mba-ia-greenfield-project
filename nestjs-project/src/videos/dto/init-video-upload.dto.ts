import { Type } from 'class-transformer';
import { IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InitVideoUploadDto {
  @ApiProperty({ example: 'My video', minLength: 1, maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title: string;

  @ApiProperty({ example: 'my-video.mp4', minLength: 1, maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  filename: string;

  @ApiProperty({ example: 'video/mp4', minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  contentType: string;

  @ApiProperty({ example: 10485760, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sizeBytes: number;

  @ApiProperty({ example: 2, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  parts: number;
}
