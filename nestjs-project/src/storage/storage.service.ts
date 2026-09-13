import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { createReadStream, createWriteStream } from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import storageConfig from '../config/storage.config';

interface MultipartUploadInput {
  key: string;
  contentType: string;
}

interface PresignUploadPartInput {
  key: string;
  uploadId: string;
  partNumber: number;
}

export interface CompletedUploadPart {
  partNumber: number;
  etag: string;
}

export interface StorageObjectMetadata {
  size: number;
  contentType: string;
}

@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly client: S3Client;
  private readonly publicClient: S3Client;

  constructor(
    @Inject(storageConfig.KEY)
    private readonly config: ConfigType<typeof storageConfig>,
  ) {
    const sharedOptions = {
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle,
    };

    this.client = new S3Client({ ...sharedOptions, endpoint: config.endpoint });
    this.publicClient = new S3Client({
      ...sharedOptions,
      endpoint: config.publicEndpoint,
    });
  }

  get bucket(): string {
    return this.config.bucket;
  }

  onModuleDestroy(): void {
    this.client.destroy();
    this.publicClient.destroy();
  }

  async createMultipartUpload(input: MultipartUploadInput): Promise<string> {
    await this.ensureBucket(this.bucket);
    const result = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: input.key,
        ContentType: input.contentType,
      }),
    );

    if (!result.UploadId) {
      throw new Error('Storage did not return a multipart upload ID');
    }

    return result.UploadId;
  }

  async createPresignedUploadPartUrl(
    input: PresignUploadPartInput,
  ): Promise<string> {
    return getSignedUrl(
      this.publicClient,
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: input.key,
        UploadId: input.uploadId,
        PartNumber: input.partNumber,
      }),
      { expiresIn: this.config.presignedUrlExpiresSeconds },
    );
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
      }),
    );
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: CompletedUploadPart[],
  ): Promise<void> {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map((part) => ({
            ETag: part.etag,
            PartNumber: part.partNumber,
          })),
        },
      }),
    );
  }

  async downloadObject(
    bucket: string,
    key: string,
    destinationPath: string,
  ): Promise<void> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    if (!(result.Body instanceof Readable)) {
      throw new Error('Storage object body is not a readable stream');
    }
    await pipeline(result.Body, createWriteStream(destinationPath));
  }

  async getObjectMetadata(
    bucket: string,
    key: string,
  ): Promise<StorageObjectMetadata> {
    const result = await this.client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    );
    const size = result.ContentLength;
    if (size === undefined || !Number.isSafeInteger(size) || size < 0) {
      throw new Error('Storage object size is invalid');
    }
    return {
      size,
      contentType: result.ContentType ?? 'application/octet-stream',
    };
  }

  async createObjectReadStream(
    bucket: string,
    key: string,
    range?: { start: number; end: number },
  ): Promise<Readable> {
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ...(range && { Range: `bytes=${range.start}-${range.end}` }),
      }),
    );
    if (!(result.Body instanceof Readable)) {
      throw new Error('Storage object body is not a readable stream');
    }
    return result.Body;
  }

  async uploadObject(
    bucket: string,
    key: string,
    sourcePath: string,
    contentType: string,
  ): Promise<void> {
    await this.ensureBucket(bucket);
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: createReadStream(sourcePath),
        ContentType: contentType,
      }),
    );
  }

  private async ensureBucket(bucket: string): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch (error) {
      const statusCode = (error as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;
      if (statusCode !== 404) throw error;

      await this.client.send(new CreateBucketCommand({ Bucket: bucket }));
    }
  }
}
