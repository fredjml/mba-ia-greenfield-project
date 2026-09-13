---
scope_type: phase
related_phases: [3]
status: decided
date: 2026-09-12
scope_description: "Backend video upload and processing: S3-compatible object storage, multipart direct upload, queue, worker, FFmpeg metadata/thumbnail extraction, unique video URL, range streaming, download, status lifecycle, and failure handling."
---

# Technical Decisions - Phase 03: Upload e Processamento de Videos

_Subprojects in scope:_

- `nestjs-project/` - backend API, worker, Docker Compose infrastructure, storage, queue, migrations, tests and OpenAPI.

_Subprojects out of scope:_

- `next-frontend/` - video UI is explicitly out of scope for this phase.

---

## TD-01: Object Storage Provider

**Scope:** Backend / Infrastructure

**Capability:** Servico de armazenamento de arquivos (videos e thumbnails)

**Context:** The project architecture already points to S3-compatible object storage. Local development must run without cloud cost.

**Options:**

### Option A: MinIO locally, AWS S3 API contract
- Run MinIO in Docker Compose and code against the S3 API.
- **Pros:** matches target architecture, works locally, easy cloud migration, no vendor-specific API leak when hidden behind a service.
- **Cons:** needs one more container and bucket bootstrap logic.

### Option B: Local filesystem storage
- Store videos in a mounted folder.
- **Pros:** simple for local dev.
- **Cons:** does not match S3 architecture, weakens multipart/presigned design, not production-like.

### Option C: Real AWS S3 for development
- Use cloud bucket directly.
- **Pros:** production-like API.
- **Cons:** requires credentials, internet, cost and cleanup; unnecessary for course acceptance.

**Recommendation:** Option A.

**Decision:** A - MinIO locally via Docker Compose, accessed through an S3-compatible `StorageService`.

**Libraries:** `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`

---

## TD-02: Upload Strategy for 10GB Videos

**Scope:** Backend / API Contract

**Capability:** Upload de videos com suporte a arquivos de ate 10GB sem impacto na performance

**Context:** The API must not receive or buffer the whole video. Large files require retryable and resumable upload.

**Options:**

### Option A: Multipart upload using presigned URLs
- API creates the draft video, initiates multipart upload, returns presigned URLs for parts, completes or aborts the upload.
- **Pros:** API does not carry video bytes, supports large objects and retry by part, aligns with S3 guidance.
- **Cons:** more endpoints and state to manage.

### Option B: Single presigned PUT
- API returns a single presigned URL for one direct upload.
- **Pros:** simpler.
- **Cons:** weak retry story for 10GB; user restarts whole upload on failure.

### Option C: Upload through NestJS controller with streaming
- API streams request body to storage.
- **Pros:** simpler auth gate and centralized logic.
- **Cons:** ties API resources to 10GB transfers and violates the challenge warning.

**Recommendation:** Option A.

**Decision:** A - multipart direct-to-storage upload. The API only orchestrates init, complete, abort and processing enqueue.

---

## TD-03: Queue Technology

**Scope:** Backend / Infrastructure

**Capability:** Servico de processamento em segundo plano (filas)

**Context:** The queue is the main open stack decision. It must run locally in Compose and support retry, failure handling and a separate worker.

**Options:**

### Option A: BullMQ + Redis
- Use `@nestjs/bullmq`, `bullmq`, Redis service and a separate worker process/container.
- **Pros:** documented NestJS integration, job retries, delayed/backoff options, simple Compose setup.
- **Cons:** introduces Redis.

### Option B: RabbitMQ
- Use AMQP messaging with explicit consumers.
- **Pros:** robust broker and routing model.
- **Cons:** heavier for this course phase and less direct NestJS job-processing ergonomics.

### Option C: PostgreSQL-backed queue
- Use DB table as queue.
- **Pros:** no new service.
- **Cons:** weaker worker tooling/retry ergonomics; not aligned with architecture diagram's queue container.

### Option D: In-memory queue
- Process jobs in memory.
- **Pros:** minimal code.
- **Cons:** loses jobs on restart and does not satisfy "fila real".

**Recommendation:** Option A.

**Decision:** A - BullMQ + Redis.

**Libraries:** `@nestjs/bullmq`, `bullmq`, `ioredis`

---

## TD-04: Worker Deployment Model

**Scope:** Backend / Infrastructure

**Capability:** Processamento automatico do video apos upload

**Decision:** The video worker runs as a separate Docker Compose service from the API, consuming BullMQ jobs and sharing the same source tree/build context. It uses service names (`db`, `redis`, `minio`) inside Docker networking.

**Rationale:** Processing video is CPU/IO intensive and must not block API request handling. A separate service allows independent lifecycle and future scaling.

---

## TD-05: Metadata and Thumbnail Extraction

**Scope:** Backend / Worker

**Capability:** Extracao de duracao/metadados and geracao automatica de thumbnail

**Options:**

### Option A: FFmpeg/ffprobe installed in the worker image
- Worker downloads/streams the object to a temporary path, runs ffprobe for metadata and ffmpeg for thumbnail, uploads thumbnail to storage.
- **Pros:** mature, standard tooling, deterministic local execution.
- **Cons:** requires image package installation and timeout/cleanup controls.

### Option B: Node-only media parser
- Use JS packages to parse metadata.
- **Pros:** simpler image.
- **Cons:** thumbnail extraction still needs media tooling; less robust.

### Option C: External cloud transcoding service
- Use managed video service.
- **Pros:** production-grade.
- **Cons:** outside local Compose, cost, credentials, not required.

**Recommendation:** Option A.

**Decision:** A - FFmpeg/ffprobe in the worker container with timeout, temp cleanup and sanitized errors.

---

## TD-06: Video Status Lifecycle

**Scope:** Backend / Domain

**Capability:** Pre-cadastro automatico, processamento automatico and failure behavior

**Decision:** Use explicit statuses:

```text
draft -> upload_initiated -> uploaded -> processing -> ready
                                   \-> error
upload_initiated -> upload_aborted
```

**Rationale:** The lifecycle separates draft creation, multipart state, storage completion, worker execution and terminal outcomes. It also gives tests a precise state machine.

---

## TD-07: Unique Video URL

**Scope:** Backend / Data Model

**Capability:** URL unica por video, sem conflito

**Decision:** Store an internal UUID primary key and a separate public `slug` generated with `nanoid`. Add a unique DB index on `slug`. Storage object keys must not be public identifiers.

**Libraries:** `nanoid`

---

## TD-08: Streaming and Download Strategy

**Scope:** Backend / API Contract

**Capability:** Streaming sem download completo and download pelo usuario

**Options:**

### Option A: Authenticated API proxy with Range support
- API validates access, reads the object's range from storage and returns `206 Partial Content`.
- **Pros:** authorization stays server-side, easy to test access control, no leaked long-lived object URL.
- **Cons:** API participates in the streaming path.

### Option B: Presigned GET redirect
- API validates once and returns/redirects to a presigned GET URL.
- **Pros:** less API bandwidth.
- **Cons:** harder to assert auth per request and to keep a unified HTTP contract in this phase.

**Recommendation:** Option A for Phase 03.

**Decision:** A - authenticated API endpoints for streaming and download. Future production may introduce CDN/presigned GET optimization.

---

## TD-09: Error Contract

**Scope:** Backend / API Contract

**Decision:** Reuse the Phase 02 domain error envelope:

```json
{ "statusCode": 400, "error": "VIDEO_UPLOAD_NOT_COMPLETE", "message": "..." }
```

**Rationale:** Phase 02 established domain exceptions and standardized error responses. Phase 03 should extend, not replace, that contract.

---

## TD-10: Testing Strategy

**Scope:** Backend / QA

**Decision:** Use unit tests for pure policies/state/key generation, integration tests for DB/storage/queue/worker with Compose services, and E2E tests via Supertest for API contracts. Use a small synthetic MP4 fixture; do not require an actual 10GB file in CI/local baseline.

**Rationale:** The acceptance criterion is architectural support for 10GB without routing bytes through API. A 10GB physical test is not necessary for every run and would be expensive/flaky.

---

## Decisions Summary

| ID | Decision | Choice |
|----|----------|--------|
| TD-01 | Object Storage Provider | MinIO locally, S3-compatible API |
| TD-02 | Upload Strategy | Multipart presigned upload |
| TD-03 | Queue Technology | BullMQ + Redis |
| TD-04 | Worker Deployment | Separate Docker Compose worker |
| TD-05 | Metadata/Thumbnail | FFmpeg/ffprobe in worker container |
| TD-06 | Status Lifecycle | explicit draft/upload/processing/ready/error states |
| TD-07 | Unique URL | public `slug` via `nanoid` + unique index |
| TD-08 | Streaming/Download | authenticated API proxy with Range support |
| TD-09 | Error Contract | extend Phase 02 domain error envelope |
| TD-10 | Testing Strategy | unit + integration + e2e with real local infra |
