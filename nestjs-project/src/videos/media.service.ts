import { execFile } from 'child_process';
import { Injectable } from '@nestjs/common';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

interface ProbeOutput {
  format?: {
    duration?: string;
    format_name?: string;
    bit_rate?: string;
  };
  streams?: Array<{
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
  }>;
}

export interface SanitizedMediaInfo {
  durationSeconds: number;
  metadata: Record<string, unknown>;
}

@Injectable()
export class MediaService {
  async probe(inputPath: string): Promise<SanitizedMediaInfo> {
    const { stdout } = await execFileAsync(
      'ffprobe',
      [
        '-v',
        'error',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        inputPath,
      ],
      { maxBuffer: 1024 * 1024 },
    );
    const output = JSON.parse(stdout) as ProbeOutput;
    const videoStream = output.streams?.find(
      (stream) => stream.codec_type === 'video',
    );
    const duration = Number(output.format?.duration);

    if (!videoStream || !Number.isFinite(duration) || duration < 0) {
      throw new Error('Invalid media probe result');
    }

    return {
      durationSeconds: Math.round(duration),
      metadata: {
        formatName: output.format?.format_name ?? null,
        bitRate: output.format?.bit_rate ?? null,
        videoCodec: videoStream.codec_name ?? null,
        width: videoStream.width ?? null,
        height: videoStream.height ?? null,
      },
    };
  }

  async createThumbnail(inputPath: string, outputPath: string): Promise<void> {
    await execFileAsync('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-i',
      inputPath,
      '-frames:v',
      '1',
      '-vf',
      'scale=1280:-2:force_original_aspect_ratio=decrease',
      outputPath,
    ]);
  }
}
