---
kind: phase
name: phase-03-videos
sources_mtime:
  docs/project-plan.md: "2026-09-12T00:00:00-03:00"
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-09-12T00:00:00-03:00"
  docs/phases/phase-03-videos/context.md: "2026-09-12T00:00:00-03:00"
---

# Phase 03 - Upload e Processamento de Videos

## Objective

Deliver backend video upload and processing: pre-register a video for the authenticated user's channel, upload large files directly to S3-compatible storage using multipart presigned URLs, process the uploaded video asynchronously in a worker, generate metadata and thumbnail, expose a unique URL slug, support HTTP range streaming, and provide download.

---

## Step Implementations

### SI-03.1 - Dependencies, Configuration, Docker Compose, and Video Data Model

**Description:** Add Phase 03 dependencies, storage/queue/video config namespaces, Docker Compose services for MinIO and Redis, and the `Video` entity + migration linked to `Channel`.

**Technical actions:**

- Install production dependencies: `@nestjs/bullmq`, `bullmq`, `ioredis`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `nanoid`.
- Create config namespaces: `storage`, `queue`, `video`.
- Extend Joi env validation and `.env.example` with MinIO/S3, Redis, upload and presigned URL variables.
- Add MinIO and Redis to `nestjs-project/compose.yaml`.
- Create `src/videos/entities/video.entity.ts`.
- Generate migration `CreateVideos`.
- Add `VideosModule` skeleton with TypeORM repository registration.

**Tests:**

| File | Layer | Verifies |
|------|-------|----------|
| `src/config/storage.config.spec.ts` | Unit | storage config defaults and required values |
| `src/config/queue.config.spec.ts` | Unit | queue config reads Redis service name |
| `src/videos/entities/video.entity.integration-spec.ts` | Integration | columns, channel FK, slug unique index, default status |
| `src/videos/videos.module.spec.ts` | Unit | module compiles |

**Dependencies:** Phase 02 `Channel` entity.

**Acceptance criteria:**

- `videos` table exists with `channel_id`, `slug`, status, original object key, thumbnail object key, duration and metadata.
- `slug` is unique.
- Compose includes MinIO and Redis services.

---

### SI-03.2 - Storage Service and Multipart Upload Init

**Description:** Implement storage abstraction and the endpoint that creates a draft video, starts multipart upload and returns presigned part URLs.

**Technical actions:**

- Create `StorageModule` / `StorageService` wrapping S3-compatible operations.
- Create DTOs for upload init.
- Implement `POST /videos/uploads/init`.
- Create draft/upload-initialized video for the current user's channel.
- Generate object key and multipart upload ID.
- Return video ID/slug, upload ID, part size and presigned part URLs.

**Tests:**

| File | Layer | Verifies |
|------|-------|----------|
| `src/videos/storage-key.util.spec.ts` | Unit | key format is deterministic and scoped |
| `src/storage/storage.service.integration-spec.ts` | Integration | MinIO create multipart and presign |
| `test/videos.e2e-spec.ts` | E2E | authenticated init returns upload contract |

**Dependencies:** SI-03.1

**Acceptance criteria:**

- API does not accept video bytes.
- Invalid title/file metadata returns validation errors.
- Unauthenticated request is rejected.

---

### SI-03.3 - Complete/Abort Upload and Enqueue Processing

**Description:** Complete or abort multipart upload, update video status and enqueue processing job exactly once.

**Technical actions:**

- Implement `POST /videos/:id/uploads/complete`.
- Implement `POST /videos/:id/uploads/abort`.
- Validate ownership by channel.
- Validate multipart part list and complete upload in storage.
- Enqueue `process-video` job in BullMQ.
- Use idempotent status checks and deterministic job ID.

**Tests:**

| File | Layer | Verifies |
|------|-------|----------|
| `src/videos/videos.service.spec.ts` | Unit | status guards and idempotent enqueue |
| `src/videos/videos.service.integration-spec.ts` | Integration | complete updates DB and creates queue job |
| `test/videos.e2e-spec.ts` | E2E | complete and abort contracts |

**Dependencies:** SI-03.2

**Acceptance criteria:**

- Completed upload changes status to `uploaded` or `processing`.
- Abort changes status to `upload_aborted`.
- Duplicate complete does not enqueue duplicate work.

---

### SI-03.4 - Worker Processing with FFmpeg/ffprobe

**Description:** Create a worker service that consumes processing jobs, extracts metadata, creates a thumbnail and updates the video to ready or error.

**Technical actions:**

- Add worker entrypoint and Docker Compose service.
- Install FFmpeg/ffprobe in the worker image.
- Create `VideoProcessor`.
- Download original object to temp path or stream to controlled temp file.
- Run ffprobe for duration/metadata.
- Run ffmpeg for thumbnail.
- Upload thumbnail to storage.
- Update status and metadata in DB.
- Handle retry/failure with sanitized errors.

**Tests:**

| File | Layer | Verifies |
|------|-------|----------|
| `src/videos/video-status.util.spec.ts` | Unit | status transitions |
| `src/videos/video-processor.integration-spec.ts` | Integration | fixture MP4 reaches ready and thumbnail exists |
| `src/videos/video-processor.integration-spec.ts` | Integration | invalid file reaches error |

**Dependencies:** SI-03.3

**Acceptance criteria:**

- Worker processes a small fixture video end-to-end.
- `duration_seconds` and `metadata` are persisted.
- Thumbnail object is stored.
- Failures do not expose unsafe command details.

---

### SI-03.5 - Video Status, Lookup, Streaming and Download

**Description:** Expose endpoints to inspect video status, stream video content with HTTP Range support and download the original file.

**Technical actions:**

- Implement `GET /videos/:slug`.
- Implement `GET /videos/:slug/stream`.
- Implement `GET /videos/:slug/download`.
- Parse and validate Range headers.
- Proxy storage object streams/ranges through the API after authorization.
- Return `206 Partial Content`, `Accept-Ranges`, `Content-Range`, `Content-Length` where appropriate.
- Return `Content-Disposition: attachment` for download.

**Tests:**

| File | Layer | Verifies |
|------|-------|----------|
| `src/videos/range-header.util.spec.ts` | Unit | valid/invalid Range parsing |
| `test/videos.e2e-spec.ts` | E2E | Range returns 206 |
| `test/videos.e2e-spec.ts` | E2E | download returns attachment headers |

**Dependencies:** SI-03.4

**Acceptance criteria:**

- Ready videos can be streamed via range.
- Non-ready videos cannot be streamed as ready content.
- Download is authenticated and authorized.

---

### SI-03.6 - Authorization Matrix and Channel Isolation

**Description:** Ensure all video endpoints enforce channel ownership for draft/upload/manage/download operations.

**Technical actions:**

- Resolve authenticated user -> channel in video service.
- Add authorization guard/policy helpers where useful.
- Add tests with two users/channels.
- Use 403 or 404 consistently to avoid leaking cross-channel resource existence.

**Tests:**

| File | Layer | Verifies |
|------|-------|----------|
| `src/videos/video-authorization.policy.spec.ts` | Unit | owner/non-owner decisions |
| `test/videos.e2e-spec.ts` | E2E | user A cannot complete/abort/stream/download user B video |

**Dependencies:** SI-03.2 through SI-03.5

**Acceptance criteria:**

- No endpoint allows cross-channel access to private upload/processing resources.

---

### SI-03.7 - OpenAPI, Documentation and Progress Hygiene

**Description:** Update Swagger decorators/OpenAPI export and keep phase documentation aligned with actual code.

**Technical actions:**

- Add Swagger decorators to video DTOs/controllers.
- Export updated OpenAPI spec.
- Update `progress.md` after each SI.
- Update `CLAUDE.md` only after implementation is real.

**Dependencies:** SI-03.1 through SI-03.6

**Acceptance criteria:**

- OpenAPI includes Phase 03 endpoints.
- `progress.md` reflects tests and status.
- Documentation does not claim unimplemented behavior.

---

### SI-03.8 - Final Hardening and DoD

**Description:** Run full validation and fix only issues required to meet the phase DoD.

**Technical actions:**

- Run unit/integration/e2e suites.
- Run `npx tsc --noEmit`.
- Run `npm run lint`.
- Review logs for secrets/presigned URL leaks.
- Verify Compose services: API, DB, Mailpit, MinIO, Redis, worker.

**Dependencies:** SI-03.1 through SI-03.7

**Acceptance criteria:**

- Full DoD passes.
- No critical/high security finding remains open.

---

## Technical Specifications

### Data Model

#### Video

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, generated | internal identifier |
| channel_id | uuid | FK -> channels.id, not null | owner channel |
| title | varchar(120) | not null | initial title at upload init |
| slug | varchar | unique, not null | public URL identifier |
| status | enum | not null | draft/upload_initiated/uploaded/processing/ready/error/upload_aborted |
| original_bucket | varchar | not null | S3/MinIO bucket |
| original_key | varchar | not null | storage object key |
| thumbnail_bucket | varchar | nullable | thumbnail bucket |
| thumbnail_key | varchar | nullable | thumbnail key |
| multipart_upload_id | varchar | nullable | active upload id |
| size_bytes | bigint | nullable | expected or observed size |
| duration_seconds | integer | nullable | ffprobe result |
| metadata | jsonb | nullable | sanitized media metadata |
| processing_error | varchar | nullable | sanitized failure code/message |
| created_at | timestamp | not null | generated |
| updated_at | timestamp | not null | generated |

### API Contracts

#### POST /videos/uploads/init

Authenticated.

Request body:

- `title`: string, required.
- `filename`: string, required.
- `contentType`: string, required, expected video type.
- `sizeBytes`: number, required, max 10GB.
- `parts`: number, required.

Response 201:

- `videoId`
- `slug`
- `status`
- `uploadId`
- `partSize`
- `parts`: array of `{ partNumber, url }`

#### POST /videos/:id/uploads/complete

Authenticated owner.

Request body:

- `uploadId`
- `parts`: array of `{ partNumber, etag }`

Response 200:

- `videoId`
- `slug`
- `status`

#### POST /videos/:id/uploads/abort

Authenticated owner. Response 204.

#### GET /videos/:slug

Authenticated owner for draft/upload/processing states. Future public behavior belongs to later phases.

#### GET /videos/:slug/stream

Authenticated. Supports `Range: bytes=start-end`.

Responses:

- `206 Partial Content` for valid range.
- `200 OK` only when returning full content intentionally.
- `416 Range Not Satisfiable` for invalid range.

#### GET /videos/:slug/download

Authenticated. Returns original file with `Content-Disposition: attachment`.

### Authorization Matrix

| Endpoint | Public | Authenticated owner | Other authenticated user | Notes |
|----------|--------|---------------------|--------------------------|-------|
| POST /videos/uploads/init | | yes | no | creates video for current channel |
| POST /videos/:id/uploads/complete | | yes | no | validates channel ownership |
| POST /videos/:id/uploads/abort | | yes | no | validates channel ownership |
| GET /videos/:slug | | yes | no | Phase 03 private/manage view |
| GET /videos/:slug/stream | | yes | no | public watch belongs to later phase |
| GET /videos/:slug/download | | yes | no | owner download in this phase |

### Error Catalog

| Code | HTTP | Trigger |
|------|------|---------|
| VIDEO_NOT_FOUND | 404 | video slug/id does not exist or is hidden by authz |
| VIDEO_UPLOAD_NOT_COMPLETE | 409 | complete called before valid multipart upload state |
| VIDEO_UPLOAD_ABORTED | 409 | operation attempted on aborted upload |
| VIDEO_NOT_READY | 409 | stream/download requested before ready |
| VIDEO_PROCESSING_FAILED | 409 | operation requires ready but processing ended in error |
| VIDEO_FILE_TOO_LARGE | 413 | `sizeBytes` exceeds max |
| VIDEO_INVALID_RANGE | 416 | invalid Range header |
| VIDEO_STORAGE_ERROR | 502 | storage operation failed |
| VIDEO_QUEUE_ERROR | 502 | queue operation failed |

### Events / Messages

#### BullMQ job: `process-video`

Queue: `video-processing`

Payload:

```json
{
  "videoId": "uuid",
  "channelId": "uuid",
  "originalBucket": "videos",
  "originalKey": "channels/<channelId>/videos/<videoId>/original"
}
```

Job options:

- deterministic `jobId`: `process-video:<videoId>`
- attempts: 3
- backoff: exponential
- removeOnComplete: bounded count
- removeOnFail: bounded count

## Dependency Map

```text
SI-03.1
  -> SI-03.2
      -> SI-03.3
          -> SI-03.4
              -> SI-03.5
SI-03.2..SI-03.5 -> SI-03.6
SI-03.1..SI-03.6 -> SI-03.7
SI-03.1..SI-03.7 -> SI-03.8
```

## Deliverables

- [ ] `videos` table and TypeORM entity linked to `channels`
- [ ] MinIO, Redis and worker in Docker Compose
- [ ] Multipart direct upload with presigned URLs
- [ ] Complete/abort upload endpoints
- [ ] BullMQ producer and worker consumer
- [ ] FFmpeg/ffprobe metadata and thumbnail generation
- [ ] Unique video slug
- [ ] Streaming endpoint with Range support
- [ ] Download endpoint
- [ ] Unit, integration and e2e tests
- [ ] `progress.md` updated per SI
- [ ] `CLAUDE.md` updated after code is real
- [ ] `npm test`, `npm run test:e2e`, `npx tsc --noEmit`, `npm run lint` pass
