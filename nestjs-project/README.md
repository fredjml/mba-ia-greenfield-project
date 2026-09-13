# StreamTube Backend

NestJS API for StreamTube account, channel and video workflows. Phase 03 adds authenticated multipart video uploads, asynchronous FFmpeg processing, owner-scoped status lookup, HTTP Range streaming and original-file download.

## Local services

Docker Compose provides:

| Service | Purpose | Host port |
| --- | --- | --- |
| `nestjs-api` | NestJS HTTP API | `3000` |
| `worker` | BullMQ video processor with FFmpeg/ffprobe | none |
| `db` | PostgreSQL 17 | `5432` |
| `redis` | BullMQ broker | `6379` |
| `minio` | S3-compatible object storage and console | `9000`, `9001` |
| `mailpit` | SMTP capture and web interface | `1025`, `8025` |

Copy the development environment template if `.env` does not exist, then start the full stack:

```bash
docker compose up -d --build
docker compose ps
```

To start only dependencies while running Node.js on the host:

```bash
docker compose up -d db redis minio mailpit
```

## Development

```bash
npm install
npm run migration:run
npm run start:dev
npm run start:worker:dev
```

The API and worker are separate processes. Completing a multipart upload publishes one deterministic `process-video` BullMQ job. The worker downloads the source object, probes media metadata, generates a thumbnail, uploads it to MinIO and moves the video to `ready`; failures move it to `error` with a sanitized code.

The authenticated video flow is:

1. `POST /videos/uploads/init` creates the video and returns presigned multipart part URLs.
2. The client uploads each part directly to MinIO.
3. `POST /videos/{id}/uploads/complete` completes storage upload and enqueues processing.
4. `GET /videos/{slug}` reports owner-scoped status and metadata.
5. Ready videos are available from `GET /videos/{slug}/stream` and `GET /videos/{slug}/download`.

Private video resources are isolated by channel. Missing and cross-channel resources both return `404` to avoid exposing their existence.

## Validation

Integration and E2E suites share a database and must run serially. For host execution against Compose dependencies, override service hosts:

```powershell
$env:DB_HOST='localhost'
$env:MAIL_HOST='localhost'
$env:REDIS_HOST='localhost'
$env:STORAGE_ENDPOINT='http://localhost:9000'
$env:STORAGE_PUBLIC_ENDPOINT='http://localhost:9000'
npm.cmd test -- --runInBand
npm.cmd run test:e2e -- --runInBand
npx.cmd tsc --noEmit
npm.cmd run build
```

Real FFmpeg integration is opt-in with `RUN_MEDIA_INTEGRATION=true` and is intended to run in the worker image, which contains FFmpeg and ffprobe.

## OpenAPI

Swagger metadata is generated from the application module and versioned in `openapi.json`:

```powershell
$env:DB_HOST='localhost'
$env:MAIL_HOST='localhost'
$env:REDIS_HOST='localhost'
npm.cmd run openapi:export
npm.cmd test -- --runInBand src/openapi-export.integration-spec.ts
```

The Phase 03 video contract documents bearer authentication, upload failures, processing-state conflicts, byte-range responses and storage/queue failures.