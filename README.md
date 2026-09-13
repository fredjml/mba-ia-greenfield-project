# StreamTube — Plataforma de Compartilhamento de Vídeos

Projeto da disciplina **Desenvolvimento de Aplicações de IA** do MBA de Engenharia de Software com IA da [Full Cycle](https://fullcycle.com.br).

Este é um projeto greenfield desenvolvido para demonstrar como construir uma aplicação do zero utilizando IA de forma adequada no processo de desenvolvimento.

## Professor

<a href="https://github.com/argentinaluiz">
    <img src="https://avatars.githubusercontent.com/u/4926329?v=4?s=100" width="100px;" alt=""/>
    <br />
    <sub>
        <b>Luiz Carlos</b>
    </sub>
</a>

---

## Quadro Branco

- [Quadro Branco](./whiteboard.png)

---

## 🎨 Design System (Figma)

- [FC Tube.fig](./FC%20Tube.fig) — arquivo-fonte do **design system** do projeto no Figma.
- [FC Tube sem padrão.fig](./FC%20Tube%20sem%20padrao.fig) — arquivo-fonte puro, sem tokens, cores, tipografia e espaçamento.

Contém os fundamentos visuais do StreamTube — tokens (cores, tipografia, espaçamento, raios), componentes e as telas da plataforma. É a referência de design para a implementação do frontend: os componentes em `next-frontend/components/ui` (shadcn) e os tokens em `next-frontend/app/globals.css` derivam deste arquivo. Abra-o no Figma (`Arquivo → Importar`) para consultar especificações e estados visuais.

---

## 📋 Pré-requisitos

- Docker e Docker Compose
- Node.js v25+ (para rodar os testes E2E do Playwright no host)
- npm

## 🏗️ Arquitetura

O projeto é um monorepo baseado em containers Docker. Cada subprojeto sobe sua própria stack via `docker compose`.

- **Frontend** (Next.js 16, App Router + React Server Components) — interface da plataforma. Segue o **modelo BFF**: o navegador nunca chama a API NestJS diretamente; todo tráfego passa por Route Handlers same-origin em `app/api/**`, que fazem proxy server-side para a API.
- **API** (NestJS 11) — regras de negócio, autenticação (JWT + refresh token rotation), envio de e-mails e acesso ao banco.
- **Database** (PostgreSQL 17) — usuários, canais e tokens de autenticação.
- **Email Service** (Mailpit) — captura os e-mails transacionais (confirmação de conta e recuperação de senha) em uma UI local.
- **Video Worker** (FFmpeg/ffprobe) — processamento assíncrono, metadados e thumbnails.
- **Object Storage** (MinIO/S3) — uploads multipart, vídeos originais e thumbnails.
- **Message Queue** (Redis/BullMQ) — fila de processamento de vídeos.

O diagrama de arquitetura completo (C4) está em `docs/diagrams/software-arch.mermaid`.

## 🚀 Como rodar

Os dois subprojetos têm stacks Docker **separadas**. Suba primeiro o backend, rode as migrations e depois o frontend.

### 1. Backend (NestJS + PostgreSQL + Mailpit + MinIO + Redis)

```bash
cd nestjs-project

# Constrói e sobe API, worker e infraestrutura
docker compose up -d --build

# Cria o schema do banco (obrigatório — synchronize está desabilitado)
docker compose exec nestjs-api npm run migration:run

# A API e o worker iniciam automaticamente pelo Compose
docker compose ps
```

Serviços disponíveis:

| Serviço | URL / Porta |
|---------|-------------|
| API NestJS | http://localhost:3000 |
| PostgreSQL | `localhost:5432` (db/user/senha: `streamtube`) |
| Mailpit (UI de e-mails) | http://localhost:8025 |
| MinIO (API / Console) | http://localhost:9000 / http://localhost:9001 |
| Redis | `localhost:6379` |
| Worker BullMQ | processo interno sem porta HTTP |
| Swagger (opcional) | http://localhost:3000/api/docs — habilite com `SWAGGER_ENABLED=true` |

### 2. Frontend (Next.js)

```bash
cd next-frontend

# Garanta que o .env.local existe (veja .env.example)
# API_URL aponta para o backend; SESSION_PASSWORD protege a sessão (iron-session)

docker compose up -d
docker compose exec next-frontend npm install        # apenas na primeira vez
docker compose exec -d next-frontend npm run dev
```

A aplicação ficará disponível em **http://localhost:3001**.

> As stacks são separadas, então o frontend acessa o backend via `host.docker.internal:3000` (configurado em `next-frontend/.env.local` e no `extra_hosts` do compose).

## 🧪 Testes

### Backend (Jest)

```bash
cd nestjs-project
docker compose exec nestjs-api npm test               # unitários + integração
docker compose exec nestjs-api npm run test:e2e       # end-to-end (HTTP via supertest)
docker compose exec nestjs-api npm run test:cov       # cobertura
```

Sufixos: `*.spec.ts` (unitário), `*.integration-spec.ts` (integração com banco real), `*.e2e-spec.ts` (end-to-end). Testes de integração/e2e rodam com `--runInBand`.

### Frontend (Vitest + Playwright)

```bash
cd next-frontend
docker compose exec next-frontend npm test            # unitários + integração (Vitest + MSW)
npx playwright test                                   # end-to-end (no host, com dev server em MSW_ENABLED=true)
```

Sufixos: `*.test.ts(x)` (unitário), `*.integration.test.ts(x)` (Route Handlers com MSW), `*.e2e-spec.ts` (Playwright). MSW intercepta as chamadas à API NestJS — os testes nunca batem no backend real.

## ✅ Funcionalidades implementadas

**Fase 01 — Configuração base** e **Fase 02 — Autenticação** estão concluídas (backend + frontend).

### Autenticação (Fase 02)

Fluxo completo de **cadastro → confirmação por e-mail → login → recuperação de senha**, com canal criado automaticamente para cada usuário (a partir do prefixo do e-mail).

Endpoints da API (`nestjs-project`):

| Método & Rota | Descrição |
|---------------|-----------|
| `POST /auth/register` | Cadastro de usuário (cria usuário + canal) |
| `GET /auth/confirm-email?token=` | Confirmação de conta via link do e-mail |
| `POST /auth/resend-confirmation` | Reenvio do e-mail de confirmação |
| `POST /auth/login` | Login (retorna access + refresh token) |
| `POST /auth/refresh` | Rotação de refresh token (com family + grace period) |
| `POST /auth/logout` | Revoga os refresh tokens da sessão |
| `POST /auth/forgot-password` | Solicita e-mail de recuperação de senha |
| `POST /auth/reset-password` | Redefine a senha via token |
| `GET /auth/me` | Dados do usuário autenticado (protegido por JWT) |

Telas e Route Handlers BFF (`next-frontend`):

- `/(auth)/signup`, `/(auth)/login`, `/(auth)/forgot-password` — formulários com React Hook Form + Zod e validação inline.
- `app/api/auth/{signup,login,logout,forgot-password}` — proxy same-origin para a API.

Segurança: senhas com **Argon2**, **JWT** com `JwtAuthGuard` global (opt-out via `@Public()`), **rotação de refresh token** com detecção de reuso, **rate limiting** (`ThrottlerGuard`) nos endpoints de auth, e sessão no navegador via **iron-session** (cookies HTTP-only).

### Vídeos (Fase 03)

A Fase 03 está concluída no escopo backend. A entrega cobre API, worker, infraestrutura Docker e artefatos de processo. A interface de vídeos no frontend permanece fora do escopo desta fase.

Capacidades entregues:

| Capacidade | Evidência |
|------------|-----------|
| Upload direto de até 10 GB sem travar a API | `POST /videos/uploads/init` cria o registro e retorna URLs multipart pré-assinadas; os bytes vão direto para MinIO/S3. O limite está em `VIDEO_MAX_UPLOAD_SIZE_BYTES=10737418240`. |
| Pré-cadastro automático | A entidade `Video` é persistida com status de upload antes do envio dos bytes. |
| Object storage real | `nestjs-project/src/storage/storage.service.ts`; MinIO sobe no `nestjs-project/compose.yaml`. |
| Fila real de processamento | Redis + BullMQ, fila `video-processing`, job determinístico `process-video-<videoId>`. |
| Worker separado | `nestjs-project/src/worker.ts`, `src/worker.module.ts` e serviço `worker` no Compose. |
| Processamento automático | `VideoProcessorService` usa ffprobe/FFmpeg para metadados, duração e thumbnail. |
| Thumbnail automática | Thumbnail JPEG gerada pelo worker e enviada ao storage. |
| URL única por vídeo | `slug` público com índice único no banco; ID interno permanece UUID. |
| Streaming | `GET /videos/:slug/stream` com suporte a HTTP Range e respostas `200`, `206` e `416`. |
| Download | `GET /videos/:slug/download` retorna o arquivo original como anexo. |
| Isolamento por canal | Todas as operações privadas resolvem usuário autenticado para canal e retornam `404 VIDEO_NOT_FOUND` para recursos de outro canal. |
| Persistência | Migration `1779000000000-CreateVideos.ts` cria a tabela `videos` ligada a `channels`. |

Endpoints principais:

| Método & rota | Descrição |
|---------------|-----------|
| `POST /videos/uploads/init` | Inicia upload multipart, cria o vídeo e retorna URLs pré-assinadas. |
| `POST /videos/:id/uploads/complete` | Conclui o multipart e enfileira processamento. |
| `POST /videos/:id/uploads/abort` | Cancela upload multipart. |
| `GET /videos/:slug` | Consulta status, metadados e dados do vídeo do canal autenticado. |
| `GET /videos/:slug/stream` | Reprodução por streaming com Range. |
| `GET /videos/:slug/download` | Download do vídeo original. |

#### Evidências de compliance da Fase 03

Veredito: a Fase 03 atende integralmente a lista obrigatória do desafio no escopo backend. Não há pendência funcional ou de Definition of Done registrada para esta fase.

Repositório e Git Flow:

| Requisito | Status | Evidência |
|-----------|--------|-----------|
| Fork público | Conforme | `https://github.com/fredjml/mba-ia-greenfield-project`, fork público do repositório base. |
| Branch de trabalho | Conforme | `feature/phase-03-videos`, publicada em `origin/feature/phase-03-videos`. |
| Branch de integração | Conforme | `dev` publicada em `origin/dev`. |
| Feature derivada de `dev` | Conforme | `git merge-base --is-ancestor dev feature/phase-03-videos` retornou código `0` durante a auditoria. |
| Entrega remota | Conforme | Implementação funcional em `69cca91`; auditoria/compliance em `24710b9`. |

Artefatos obrigatórios:

| Artefato | Status | Caminho |
|----------|--------|---------|
| Decisões técnicas | Conforme | `docs/decisions/technical-decisions-phase-03-videos.md` |
| Contexto | Conforme | `docs/phases/phase-03-videos/context.md` |
| Validação clean | Conforme | `docs/phases/phase-03-videos/validation.md` |
| Plano incremental com SIs | Conforme | `docs/phases/phase-03-videos/phase-03-videos.md` |
| Referências de bibliotecas | Conforme | `docs/phases/phase-03-videos/library-refs.md` |
| Progresso por incremento | Conforme | `docs/phases/phase-03-videos/progress.md` |
| Relatório conclusivo | Conforme | `docs/phases/phase-03-videos/final-report.md` |
| Índice detalhado de evidências | Conforme | `docs/phases/phase-03-videos/README.md` |
| Instruções de IA | Conforme | `CLAUDE.md`, `nestjs-project/CLAUDE.md`, `.github/copilot-instructions.md` |

Matriz requisito, implementação e teste:

| Requisito obrigatório | Implementação | Evidência de teste |
|-----------------------|---------------|--------------------|
| Módulo de vídeos | `nestjs-project/src/videos/` | `videos.module.spec.ts`, `videos.service.spec.ts`, `test/videos.e2e-spec.ts` |
| Tabela ligada ao canal | `src/videos/entities/video.entity.ts`, migration `1779000000000-CreateVideos.ts` | `video.entity.integration-spec.ts`, `migrations.integration-spec.ts` |
| Storage para vídeos/thumbnails | `src/storage/storage.service.ts`, MinIO no Compose | `storage.service.integration-spec.ts`, `video-processor.integration-spec.ts` |
| Upload até 10 GB sem bytes na API | Upload multipart direto por URL pré-assinada | Specs de config/storage/service e E2E de init |
| Complete/abort multipart | Endpoints `/complete` e `/abort` | Storage integration, service specs e E2E |
| Fila em segundo plano | Redis/BullMQ em `src/queue/` | `video-processing-queue.service.integration-spec.ts` |
| Worker separado | `src/worker.ts`, `src/worker.module.ts` | `video-processing-worker.service.integration-spec.ts` |
| Metadados, duração e thumbnail | `video-processor.service.ts`, FFmpeg/ffprobe | `video-processor.integration-spec.ts` no container worker |
| URL única | `slug` com índice único | Testes de entidade e colisão |
| Streaming sem download completo | `GET /videos/:slug/stream` com Range | `range-header.util.spec.ts` e E2E com bytes reais |
| Download | `GET /videos/:slug/download` | E2E de download |
| Autorização por canal | Resolver owner-scoped por JWT/canal | Policy/service specs e E2E com dois usuários |
| OpenAPI | `nestjs-project/openapi.json` | `openapi-export.integration-spec.ts` |
| Infraestrutura completa | API, worker, PostgreSQL, Mailpit, MinIO e Redis no Compose | `docker compose ps`, healthchecks e API HTTP 200 |

Gates finais executados:

| Gate | Resultado |
|------|-----------|
| `docker compose exec -T nestjs-api npm test` | PASS: 36/36 suites, 199/199 testes; 2 testes de mídia opt-in pulados nessa suite. |
| `docker compose exec -T nestjs-api npm run test:e2e` | PASS: 4/4 suites, 68/68 testes. |
| `docker compose exec -T nestjs-api npx tsc --noEmit` | PASS, código 0. |
| `docker compose exec -T nestjs-api npm run lint` | PASS, código 0. |
| `docker compose exec -T nestjs-api npm run build` | PASS, código 0. |
| `docker compose exec -T nestjs-api npm audit --omit=dev` | PASS: 0 vulnerabilidades. |
| `docker compose exec -T nestjs-api npm audit` | PASS: 0 vulnerabilidades. |
| `docker compose exec -T worker sh -lc "RUN_MEDIA_INTEGRATION=true npm test -- --runInBand src/videos/video-processor.integration-spec.ts"` | PASS: 1/1 suite, 2/2 testes FFmpeg/ffprobe. |
| Runtime Compose | PASS: `nestjs-api`, `worker`, `db`, `mailpit`, `minio` e `redis` ativos; API HTTP 200; `WorkerModule` inicializado. |
| `git diff --check` | PASS. |

Observações de auditoria:

- A execução direta de `npm test` no host Windows não é a trilha autoritativa deste backend: os testes de integração dependem dos nomes Docker `db`, `redis` e `mailpit`.
- O problema de `npm.ps1` no PowerShell foi corrigido com `CurrentUser: RemoteSigned`; ainda assim, os gates finais foram executados dentro do Compose, que é o ambiente documentado.
- Os testes de mídia dependem de FFmpeg/ffprobe e rodam no container Linux do worker.
- Não foi criado arquivo físico de 10 GB; o critério é coberto pela arquitetura multipart direta, limite configurado e validações automatizadas, conforme TD-10.

## 🛠️ Estrutura do Projeto

```
green-field-ia-project/
├── docs/
│   ├── project-plan.md                  # Planejamento geral do projeto
│   ├── phases/                          # Planos e implementação por fase
│   │   ├── phase-01-configuracao-base/
│   │   ├── phase-02-auth/               # Auth (backend)
│   │   └── phase-02-auth-frontend/      # Auth (frontend)
│   └── diagrams/
│       └── software-arch.mermaid        # Diagrama de arquitetura (C4)
├── nestjs-project/                      # Backend API (NestJS 11)
│   ├── src/
│   │   ├── auth/                        # Cadastro, login, JWT, refresh, reset de senha
│   │   ├── users/                       # Entidade e serviço de usuários
│   │   ├── channels/                    # Canal 1:1 por usuário (nickname do e-mail)
│   │   ├── mail/                        # Envio de e-mails (templates Handlebars)
│   │   ├── common/                      # Filtros, pipes e exceptions de domínio
│   │   ├── config/                      # Configs namespaced (Joi)
│   │   └── database/                    # data-source, migrations e seeds
│   ├── test/                            # Testes e2e
│   ├── compose.yaml                     # API + worker + PostgreSQL + Mailpit + MinIO + Redis
│   └── Dockerfile.dev
├── next-frontend/                       # Frontend (Next.js 16, App Router)
│   ├── app/                             # Rotas, layouts, páginas e Route Handlers BFF
│   ├── components/                      # Componentes de auth, UI (shadcn) e ícones
│   ├── lib/                             # env, api (openapi-fetch), auth/session
│   ├── mocks/                           # MSW (handlers + server)
│   ├── tests/                           # E2E (Playwright)
│   ├── compose.yaml                     # Docker Compose (dev server)
│   └── Dockerfile.dev
├── CLAUDE.md                            # Instruções para IA
├── FC Tube.fig                          # Design system do projeto (Figma)
├── whiteboard.png                       # Quadro branco do projeto
└── README.md
```

## 📚 Fases do Projeto

| Fase | Descrição | Status |
|------|-----------|--------|
| **01** | Configuração Base do Projeto | ✅ Concluída |
| **02** | Cadastro, Login e Gerenciamento de Conta | ✅ Concluída |
| **03** | Upload e Processamento de Vídeos | ✅ Concluída |
| **04** | Gerenciamento de Vídeos e Canal | ⏳ Planejada |
| **05** | Página de Visualização do Vídeo | ⏳ Planejada |
| **06** | Interações Sociais (Likes, Comentários, Inscrições) | ⏳ Planejada |
| **07** | Página Inicial, Busca e Finalização | ⏳ Planejada |

Detalhes completos em `docs/project-plan.md`.

## 📖 Stack Tecnológica

| Camada | Tecnologia |
|--------|------------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, React Hook Form + Zod, iron-session, openapi-fetch |
| Backend | NestJS 11, TypeScript, TypeORM, JWT, Argon2, Mailer (Handlebars) |
| Banco de Dados | PostgreSQL 17 |
| E-mail (dev) | Mailpit |
| Containerização | Docker, Docker Compose |
| Testes | Jest, Supertest (backend); Vitest, MSW, Playwright (frontend) |
| Qualidade | ESLint, Prettier |
</content>
