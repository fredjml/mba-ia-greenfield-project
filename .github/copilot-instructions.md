# GitHub Copilot Instructions

## Sources of truth

- Follow `CLAUDE.md` for repository-wide architecture, Git Flow and Definition of Done.
- Follow `nestjs-project/CLAUDE.md` for backend commands, test classification and Docker operation.
- For Phase 03 video work, use `docs/phases/phase-03-videos/phase-03-videos.md` as the plan and `docs/phases/phase-03-videos/README.md` as the compliance/evidence index.
- Use `docs/decisions/technical-decisions-phase-03-videos.md` for resolved design decisions. Do not replace those decisions without updating their rationale and affected artifacts.

## Phase 03 boundaries

- Phase 03 is backend-only. Do not add video UI to `next-frontend/`.
- Keep video bytes out of the API upload path. Upload uses S3-compatible multipart presigned URLs; the API only creates, completes or aborts uploads and enqueues processing.
- Run media processing only in the separate BullMQ worker. FFmpeg/ffprobe extract metadata and create thumbnails.
- Scope every private video operation to the authenticated user's channel. Return `404 VIDEO_NOT_FOUND` for missing or cross-channel resources.
- Preserve HTTP Range behavior: full stream `200`, valid partial stream `206`, invalid range `416`, and attachment headers for download.
- Keep TypeORM migrations authoritative; do not enable production schema synchronization.

## Validation and delivery

- Run affected tests first, then the full backend unit/integration and e2e suites for functional changes.
- Before completion, run `npx tsc --noEmit`, `npm run lint`, `npm run build` and `git diff --check`.
- Run FFmpeg/ffprobe integration tests in the Linux worker image when the host lacks those binaries.
- Use `feature/*` branches based on `dev`; never commit directly to `main`.
- Keep phase planning, progress, OpenAPI and operational documentation consistent with implemented behavior.
