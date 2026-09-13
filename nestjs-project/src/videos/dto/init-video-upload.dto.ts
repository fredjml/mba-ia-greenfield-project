import { Type } from 'class-transformer';
import { IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class InitVideoUploadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  filename: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  contentType: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  sizeBytes: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  parts: number;
}
