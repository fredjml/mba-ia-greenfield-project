import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CompletedVideoPartDto {
  @ApiProperty({ example: 1, minimum: 1, maximum: 10000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  partNumber: number;

  @ApiProperty({ example: '"d41d8cd98f00b204e9800998ecf8427e"' })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  etag: string;
}

export class CompleteVideoUploadDto {
  @ApiProperty({ example: 'multipart-upload-id', minLength: 1, maxLength: 256 })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  uploadId: string;

  @ApiProperty({ type: () => [CompletedVideoPartDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10000)
  @ArrayUnique((part: CompletedVideoPartDto) => part.partNumber)
  @ValidateNested({ each: true })
  @Type(() => CompletedVideoPartDto)
  parts: CompletedVideoPartDto[];
}
