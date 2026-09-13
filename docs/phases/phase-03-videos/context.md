---
kind: phase
name: phase-03-videos
sources_mtime:
  docs/project-plan.md: "2026-09-12T00:00:00-03:00"
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-09-12T00:00:00-03:00"
  docs/phases/phase-02-auth/phase-02-auth.md: "2026-09-12T00:00:00-03:00"
---

# phase-03-videos - Context

## Scope

**Phase name:** Fase 03 - Upload e Processamento de Videos

**Capabilities**

- Servico de armazenamento de arquivos para videos e thumbnails.
- Servico de processamento em segundo plano via fila.
- Upload de videos com suporte a arquivos de ate 10GB sem travar a API.
- Pre-cadastro automatico do video como rascunho ao iniciar upload.
- Processamento automatico apos upload: duracao, metadados e thumbnail.
- URL unica por video.
- Streaming sem exigir download completo.
- Download do video pelo usuario.

**Out of scope**

- UI de upload/gestao de videos no `next-frontend/`.
- Transcoding adaptativo, HLS/DASH, CDN, DRM, legendas e moderacao.
- S3 real em cloud como dependencia obrigatoria local.
- Publicacao/visibilidade de videos da Fase 04.

**Deliverables**

- Modulo `videos` no backend.
- Migration e entidade/tabela `videos` ligada a `channels`.
- MinIO, Redis/BullMQ e worker no Docker Compose.
- Upload multipart/presigned direto ao storage.
- Worker com FFmpeg/ffprobe gerando metadata e thumbnail.
- Streaming com Range/206 e download.
- Testes unitarios, integracao e e2e relevantes.
- `progress.md` atualizado por SI.

**Affected subprojects:** `nestjs-project/`

**Deferred subprojects:** `next-frontend/`

**Sequencing notes:** Depends on Fase 01 and Fase 02. The channel relation from Fase 02 is the ownership boundary for videos.

**Neighbors:** Fase 02 (prior), Fase 04 and Fase 05 (future consumers of video state/streaming).

## Decisions Index

| Ref | Source | Scope | Topic | Status | Decision | Libraries |
|-----|--------|-------|-------|--------|----------|-----------|
| phase-03-videos/TD-01 | technical-decisions-phase-03-videos.md | Backend/Infra | Object storage | decided | MinIO locally, S3-compatible API | `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` |
| phase-03-videos/TD-02 | technical-decisions-phase-03-videos.md | Backend/API | Upload strategy | decided | Multipart presigned upload | AWS SDK presigner |
| phase-03-videos/TD-03 | technical-decisions-phase-03-videos.md | Backend/Infra | Queue | decided | BullMQ + Redis | `@nestjs/bullmq`, `bullmq`, `ioredis` |
| phase-03-videos/TD-04 | technical-decisions-phase-03-videos.md | Backend/Infra | Worker model | decided | Separate worker service | Docker Compose |
| phase-03-videos/TD-05 | technical-decisions-phase-03-videos.md | Backend/Worker | Metadata/thumbnail | decided | FFmpeg/ffprobe in worker image | OS packages |
| phase-03-videos/TD-06 | technical-decisions-phase-03-videos.md | Backend/Domain | Status lifecycle | decided | draft/upload/processing/ready/error | - |
| phase-03-videos/TD-07 | technical-decisions-phase-03-videos.md | Backend/Data | Unique URL | decided | `slug` via `nanoid` + unique index | `nanoid` |
| phase-03-videos/TD-08 | technical-decisions-phase-03-videos.md | Backend/API | Streaming/download | decided | Authenticated API proxy with Range | - |
| phase-03-videos/TD-09 | technical-decisions-phase-03-videos.md | Backend/API | Error contract | decided | Reuse domain error envelope | - |
| phase-03-videos/TD-10 | technical-decisions-phase-03-videos.md | Backend/QA | Testing strategy | decided | unit + integration + e2e with real local infra | `supertest` existing |

_Source files:_

- `docs/decisions/technical-decisions-phase-03-videos.md`

## Capability Coverage

| Capability | Covered by |
|------------|------------|
| Servico de armazenamento de arquivos | TD-01, TD-02 |
| Servico de processamento em segundo plano | TD-03, TD-04 |
| Upload ate 10GB sem travar | TD-02 |
| Pre-cadastro como rascunho | TD-06, SI-03.2 |
| Processamento automatico | TD-03, TD-04, TD-05 |
| Thumbnail automatica | TD-05 |
| URL unica | TD-07 |
| Streaming | TD-08 |
| Download | TD-08 |

## Inherited Conventions

- Use Docker Compose service names inside containers; never `localhost` for container-to-container calls.
- Use `@nestjs/config` with namespaced `registerAs` factories and Joi validation.
- Use TypeORM migrations; do not use `synchronize`.
- Use global `ValidationPipe`, domain exception filter and validation error envelope from Phase 02.
- Use JWT guard globally with `@Public()` opt-out.
- Keep modules separated by ownership: video logic lives in `VideosModule`; channel ownership is referenced but not reimplemented.
- Tests follow suffixes: `*.spec.ts`, `*.integration-spec.ts`, `*.e2e-spec.ts`.

## Testing Requirements

- Unit: status transitions, storage key builder, slug generation, authorization policies, range parser.
- Integration: TypeORM entity/migration, MinIO storage service, BullMQ enqueue/consume, worker with a small MP4 fixture.
- E2E: init upload, complete upload, status lookup, authz denial, streaming Range, download.
- Final DoD: `npm test`, `npm run test:e2e`, `npx tsc --noEmit`, `npm run lint`.
