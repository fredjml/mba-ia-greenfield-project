# phase-03-videos - Progress

**Status:** in progress
**SIs:** 6/8 completed

## Pre-implementation

- **2026-09-12:** Phase 03 research and planning artifacts created.
- **2026-09-12:** Docker daemon verified with elevated access: Docker Server `29.6.2`.
- **2026-09-12:** Backend dependencies installed with `npm.cmd install --cache .npm-cache`; install completed, but npm reported 40 vulnerabilities in the current dependency tree and pending install-script approval warnings.
- **2026-09-12:** Local `.env` created from development defaults for Compose/baseline usage; it is ignored by Git.
- **2026-09-12:** Attempted cleanup of temporary `.npm-cache`; cleanup was interrupted due many transient cache path errors. `.npm-cache` was added to backend `.gitignore` and must not be committed.

## SI Status

### SI-03.1 - Dependencies, Configuration, Docker Compose, and Video Data Model
- **Status:** completed
- **Started:** 2026-09-12
- **Completed:** 2026-09-12
- **Scope authorized:** dependencies/configuration, Docker Compose MinIO/Redis, `Video` entity, migration and module skeleton.
- **I1 - Video persistence:** completed on 2026-09-12.
- **Implemented:** `videos` migration, `Video` entity, required `Channel` foreign key/relation, upload and processing status fields, unique `slug`, and composite `channel_id/status` index.
- **Validation command:** `$env:DB_HOST='localhost'; npm.cmd test -- --runInBand src/database/migrations.integration-spec.ts src/videos/entities/video.entity.integration-spec.ts src/videos/videos.module.spec.ts`
- **Validation result:** passed with `3/3` suites and `8/8` tests. Migration apply/revert, 16 planned columns, composite index, default status, unique slug, channel relation, and foreign key were verified against PostgreSQL.
- **Type-check command:** `npx.cmd tsc --noEmit`
- **Type-check result:** passed with no diagnostics.
- **Configuration validation:** `npm.cmd test -- --runInBand src/config/storage.config.spec.ts src/config/queue.config.spec.ts src/config/env.validation.integration-spec.ts` passed with `3/3` suites and `8/8` tests.
- **Infrastructure validation:** `docker compose up -d minio redis`; Redis returned `PONG`, MinIO readiness returned HTTP `200`, and PostgreSQL, MinIO and Redis reported healthy.
- **Decision:** SI-03.1 accepted. Dependencies, namespaced configuration, environment validation, Compose services, migration, entity and module skeleton meet the planned scope.
- **Observations:** baseline fix for migrations was completed before starting implementation; baseline suite was green with `23/23` suites and `144/144` tests.

### SI-03.2 - Storage Service and Multipart Upload Init
- **Status:** completed
- **Started:** 2026-09-12
- **Completed:** 2026-09-12
- **Scope authorized:** S3-compatible storage abstraction, multipart upload initialization, authenticated `POST /videos/uploads/init`, DTO validation and focused tests. Complete/abort, queue and worker remain out of scope.
- **Implemented:** `StorageModule`/`StorageService`, deterministic channel-scoped object keys, bucket bootstrap, multipart creation, public presigned part URLs, DTOs, `VideosService`, and authenticated upload-init controller.
- **Focused validation:** storage key unit tests `2/2`; MinIO integration test `1/1`; upload-init E2E tests `6/6`; module/storage focused regression `4/4`.
- **Full unit/integration command:** `$env:DB_HOST='localhost'; $env:MAIL_HOST='localhost'; npm.cmd test -- --runInBand`
- **Full unit/integration result:** passed with `29/29` suites and `157/157` tests.
- **Full E2E command:** `$env:DB_HOST='localhost'; $env:MAIL_HOST='localhost'; npm.cmd run test:e2e -- --runInBand`
- **Full E2E result:** passed with `4/4` suites and `58/58` tests.
- **Static validation:** `npx.cmd tsc --noEmit` and focused ESLint passed with no diagnostics.
- **Decision:** use the internal storage endpoint for S3 operations and the public endpoint only for URL signing. Persist a video as `upload_initiated` only after multipart creation and URL generation succeed; abort the multipart as rollback if persistence fails.
- **Scope boundary:** API receives metadata only. Complete/abort endpoints, BullMQ enqueue and worker processing remain deferred to SI-03.3 and SI-03.4.
- **Observations:** host test commands require `DB_HOST=localhost` and `MAIL_HOST=localhost`; stale storage/Redis overrides must be removed so configuration-default tests retain Compose service names. The existing PostgreSQL driver emits non-blocking `client.query()` deprecation warnings.

### SI-03.3 - Complete/Abort Upload and Enqueue Processing
- **Status:** completed
- **Started:** 2026-09-12
- **Completed:** 2026-09-12
- **Scope authorized:** authenticated complete/abort endpoints, ownership checks, multipart completion/abort, idempotent status guards and one deterministic BullMQ processing job. Worker execution remains out of scope.
- **Decision:** use `process-video-<videoId>` as the BullMQ job ID because custom BullMQ IDs must not contain `:`; payload and queue name remain as specified in the phase plan.
- **Implemented:** authenticated `POST /videos/:id/uploads/complete` and `POST /videos/:id/uploads/abort`, nested multipart DTO validation, channel-scoped lookup, MinIO complete/abort operations, status transitions and a configurable BullMQ producer.
- **Idempotency:** repeated complete in `processing` returns the current state without touching storage or queue; repeated abort in `upload_aborted` returns `204`; deterministic job IDs prevent duplicate queue jobs.
- **Failure decision:** persist `uploaded` before enqueue. If Redis enqueue fails, return `VIDEO_QUEUE_ERROR` while retaining `uploaded`, allowing a safe complete retry that skips S3 and retries only the queue operation.
- **Focused validation:** video transition unit tests `6/6`; MinIO multipart lifecycle integration tests `2/2`; Redis/BullMQ deduplication integration test `1/1`; videos E2E `9/9`.
- **Full unit/integration command:** `$env:DB_HOST='localhost'; $env:MAIL_HOST='localhost'; npm.cmd test -- --runInBand`
- **Full unit/integration result:** passed with `31/31` suites and `165/165` tests.
- **Full E2E command:** `$env:DB_HOST='localhost'; $env:MAIL_HOST='localhost'; $env:STORAGE_ENDPOINT='http://localhost:9000'; $env:STORAGE_PUBLIC_ENDPOINT='http://localhost:9000'; $env:REDIS_HOST='localhost'; npm.cmd run test:e2e -- --runInBand`
- **Full E2E result:** passed with `4/4` suites and `61/61` tests.
- **Static validation:** `npx.cmd tsc --noEmit`, focused ESLint and `git diff --check` passed.
- **Scope boundary:** no BullMQ consumer, FFmpeg invocation, metadata extraction or thumbnail generation was added; those remain in SI-03.4.
- **Observations:** PostgreSQL tests continue to emit the existing non-blocking `client.query()` deprecation warning.

### SI-03.4 - Worker Processing with FFmpeg/ffprobe
- **Status:** completed
- **Started:** 2026-09-12
- **Completed:** 2026-09-13
- **Scope authorized:** separate BullMQ worker entrypoint/service, controlled temporary files, ffprobe metadata extraction, FFmpeg thumbnail generation, storage download/upload, `ready`/`error` persistence and focused integration tests.
- **Validation decision:** FFmpeg/ffprobe are not installed on the Windows host. Media integration tests must run in the worker Docker image where the binaries are provisioned; unit and static checks remain host-executable.
- **Implemented:** separate Nest application-context worker, BullMQ `process-video` consumer, streamed MinIO download/upload, temporary-directory cleanup in `finally`, sanitized ffprobe metadata, FFmpeg JPEG thumbnail generation, idempotent `ready` handling and persisted `processing`/`ready`/`error` transitions.
- **Failure decision:** processing failures persist only the stable `MEDIA_PROCESSING_FAILED` code and rethrow the same sanitized error; command output, object contents and temporary paths are not exposed.
- **Focused validation:** status transition utility `8/8`; processor unit tests `4/4`; real Redis/BullMQ consumer integration `1/1`; Docker FFmpeg/ffprobe + MinIO + PostgreSQL integration `2/2`, covering valid and invalid media.
- **Runtime validation:** worker image built with FFmpeg/ffprobe `5.1.9`; separate Compose worker compiled with `0` errors and initialized TypeORM, storage and queue dependencies.
- **Full unit/integration result:** passed with `34/34` executed suites and `178/178` executed tests; the two Docker-only media tests are skipped on the Windows host and passed separately in the worker image.
- **Full E2E result:** passed with `4/4` suites and `61/61` tests.
- **Static validation:** `npx.cmd tsc --noEmit`, focused ESLint and `npm.cmd run build` passed with no diagnostics.
- **Configuration maintenance:** removed the unused deprecated TypeScript `baseUrl` option; no `paths` aliases or absolute imports depended on it, and type-check/build remained green.
- **Observations:** status/stream/download HTTP endpoints remain out of scope until SI-03.5.

### SI-03.5 - Video Status, Lookup, Streaming and Download
- **Status:** completed
- **Started:** 2026-09-13
- **Completed:** 2026-09-13
- **Scope authorized:** authenticated owner lookup by slug, ready-state enforcement, HTTP Range streaming through storage and attachment download.
- **Implemented:** authenticated `GET /videos/:slug`, `GET /videos/:slug/stream` and `GET /videos/:slug/download`; owner-scoped slug lookup; sanitized status/metadata DTO; storage metadata lookup and streamed object reads; single HTTP byte-range parsing with explicit, open-ended and suffix ranges; `200` full stream, `206` partial stream, `416` invalid range and attachment download headers.
- **State handling:** `processing` and all other non-ready states return `VIDEO_NOT_READY`; failed processing returns `VIDEO_PROCESSING_FAILED`; only `ready` content reaches storage streaming/download.
- **Authorization:** lookup, stream and download resolve JWT user to channel and hide missing or cross-channel videos with `VIDEO_NOT_FOUND`.
- **Focused validation:** Range parser `11/11`; video service/range tests `21/21`; videos E2E `15/15`, including real MinIO bytes, partial response headers, invalid Range, non-ready rejection, attachment headers, authentication and cross-channel denial.
- **Full unit/integration result:** passed with `35/35` executed suites and `193/193` executed tests; the two Docker-only SI-03.4 media tests remain opt-in and previously passed in the worker image.
- **Full E2E result:** passed with `4/4` suites and `67/67` tests.
- **Static validation:** focused Prettier/ESLint, `npx.cmd tsc --noEmit`, `npm.cmd run build` and editor diagnostics passed.
- **Observations:** E2E fixtures for read endpoints are created directly in PostgreSQL/MinIO so unrelated upload-init throttling cannot make the endpoint tests flaky.

### SI-03.6 - Authorization Matrix and Channel Isolation
- **Status:** completed
- **Started:** 2026-09-13
- **Completed:** 2026-09-13
- **Scope authorized:** consolidate owner policy and verify cross-channel denial for every private video endpoint using consistent `404 VIDEO_NOT_FOUND` responses.
- **Implemented:** reusable `canAccessVideo` ownership policy, a shared owner-scoped video resolver for ID and slug lookups, SQL channel scoping plus policy verification, and consistent hidden-resource behavior.
- **Authorization matrix:** upload initialization remains bound to the authenticated user's channel; complete, abort, status lookup, stream and download reject cross-channel access with `404 VIDEO_NOT_FOUND`.
- **Mutation safety:** a rejected cross-channel abort leaves the target video in `upload_initiated`; storage and queue operations are reached only after ownership succeeds.
- **Focused validation:** policy/service tests `14/14`; videos E2E `16/16`, including two users/channels and all private video resource operations.
- **Full unit/integration result:** passed with `36/36` executed suites and `197/197` executed tests; the two Docker-only media tests remain opt-in and passed during SI-03.4.
- **Full E2E result:** passed with `4/4` suites and `68/68` tests.
- **Static validation:** focused Prettier/ESLint, `npx.cmd tsc --noEmit`, `npm.cmd run build` and editor diagnostics passed.
- **Observations:** `404` is intentionally used instead of `403` so the API does not reveal whether another channel's private video exists.

### SI-03.7 - OpenAPI, Documentation and Progress Hygiene
- **Status:** pending
- **Tests:** not run
- **Observations:** none

### SI-03.8 - Final Hardening and DoD
- **Status:** pending
- **Tests:** not run
- **Observations:** none
