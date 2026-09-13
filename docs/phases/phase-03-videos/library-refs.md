---
libs:
  "@nestjs/bullmq":
    version: "to be pinned during implementation"
    source: "NestJS official queues documentation"
    fetched_at: "2026-09-12T00:00:00-03:00"
  bullmq:
    version: "to be pinned during implementation"
    source: "NestJS official queues documentation"
    fetched_at: "2026-09-12T00:00:00-03:00"
  ioredis:
    version: "to be pinned during implementation"
    source: "BullMQ/NestJS Redis queue dependency"
    fetched_at: "2026-09-12T00:00:00-03:00"
  "@aws-sdk/client-s3":
    version: "to be pinned during implementation"
    source: "AWS SDK for JavaScript v3 S3 documentation"
    fetched_at: "2026-09-12T00:00:00-03:00"
  "@aws-sdk/s3-request-presigner":
    version: "to be pinned during implementation"
    source: "AWS S3 presigned URL documentation"
    fetched_at: "2026-09-12T00:00:00-03:00"
  nanoid:
    version: "to be pinned during implementation"
    source: "package documentation / installed version check required"
    fetched_at: "2026-09-12T00:00:00-03:00"
sources_mtime:
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-09-12T00:00:00-03:00"
---

# phase-03-videos - Library References

Distilled references for the Phase 03 libraries and platform APIs. Before implementing, re-fetch with Context7 whenever available and compare with the versions actually installed in `nestjs-project/package.json`.

## @nestjs/bullmq / bullmq / ioredis

**Source:** NestJS official Queues technique documentation.

**Use in this phase:**

- Register a queue module in the API for producer behavior.
- Register a processor/worker in the worker service for consumer behavior.
- Use Redis as the queue backend in Docker Compose.
- Configure retries/backoff in job options, not ad hoc retry loops.

**Contracts to preserve:**

- Queue name: `video-processing`.
- Job name: `process-video`.
- Job payload must be small and contain identifiers, not file bytes.
- Job ID should be deterministic per video when possible to reduce duplicate processing.

## AWS SDK for JavaScript v3 S3

**Source:** AWS SDK for JavaScript v3 S3 documentation and AWS S3 multipart upload documentation.

**Use in this phase:**

- `CreateMultipartUploadCommand`
- `UploadPartCommand` presigning
- `CompleteMultipartUploadCommand`
- `AbortMultipartUploadCommand`
- `HeadObjectCommand`
- `GetObjectCommand`
- `PutObjectCommand`

**Contracts to preserve:**

- The API does not receive video bytes.
- Presigned URLs expire.
- Storage object keys are internal and never used as public video URLs.
- Multipart completion validates part ETags provided by the client.

## MinIO

**Source:** MinIO S3-compatible behavior and JavaScript API documentation.

**Use in this phase:**

- Local object storage service in Compose.
- S3-compatible endpoint for the AWS SDK.
- Separate buckets or prefixes for original videos and thumbnails.

**Contracts to preserve:**

- Compose service name should be used from containers.
- Browser/client upload URL must use a host reachable from the host/browser if manual testing is performed.

## FFmpeg / ffprobe

**Source:** FFmpeg command-line tools.

**Use in this phase:**

- `ffprobe` extracts duration and metadata.
- `ffmpeg` extracts a thumbnail frame.

**Contracts to preserve:**

- Run in the worker container, not in the API request path.
- Use argument arrays or controlled command construction; never concatenate unsanitized shell input.
- Enforce timeout and temp file cleanup.

## nanoid

**Source:** package documentation / installed version check required before implementation.

**Use in this phase:**

- Generate public video slugs.

**Contracts to preserve:**

- Add DB unique index on `videos.slug`.
- Retry on unique collision.
- Keep internal UUID separate from public slug.
