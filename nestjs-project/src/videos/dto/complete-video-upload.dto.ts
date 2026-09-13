import { Type } from 'class-transformer';
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
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  partNumber: number;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  etag: string;
}

export class CompleteVideoUploadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  uploadId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10000)
  @ArrayUnique((part: CompletedVideoPartDto) => part.partNumber)
  @ValidateNested({ each: true })
  @Type(() => CompletedVideoPartDto)
  parts: CompletedVideoPartDto[];
}
