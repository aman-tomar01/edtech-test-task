# DocSync — Local-First Collaborative Document Editor

A production-oriented demonstration of **local-first architecture**, **deterministic conflict resolution**, **offline synchronization**, and **granular version control** — built with Next.js 16, React, PostgreSQL, and Tailwind CSS.

## Features

| Capability | Implementation |
|---|---|
| **Local-first** | IndexedDB (Dexie) is the primary read/write path; UI never blocks on network |
| **Background sync** | Queue-based push/pull with automatic retry on reconnect |
| **Conflict resolution** | Lamport clocks + deterministic tie-breaking (`userId` → `operationId`) + OT position transform |
| **Version history** | Named snapshots with preview and safe restore (creates new server state, doesn't corrupt collaborators) |
| **Auth & roles** | Auth.js (JWT) with Owner / Editor / Viewer; Viewers cannot push sync |
| **Validation** | Zod schemas, payload size caps, rate limiting, operation count limits |
| **AI add-ons** | Summarize, improve, continue, tone shift via Vercel AI SDK + OpenAI |
| **Security** | PostgreSQL RLS policies, tenant-scoped API authorization, bcrypt passwords |

## Tech Stack

- **Frontend/Backend:** Next.js 16 (App Router), React 19, TypeScript
- **Database:** PostgreSQL 16 + Prisma ORM
- **Local storage:** Dexie (IndexedDB)
- **Styling:** Tailwind CSS 4
- **Auth:** Auth.js (NextAuth v5)
- **AI:** Vercel AI SDK + OpenAI
- **Testing:** Vitest

## Quick Start

### Prerequisites

- Node.js 22+
- Docker (for PostgreSQL)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set `AUTH_SECRET` (generate with `openssl rand -base64 32`).

### 3. Start PostgreSQL

```bash
docker compose up -d
```

### 4. Run migrations & seed

```bash
npx prisma db push
npx tsx prisma/seed.ts
```

### 5. Start dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Demo accounts

| Email | Password | Role on seed doc |
|---|---|---|
| alice@example.com | password123 | Owner |
| bob@example.com | password123 | Editor |
| carol@example.com | password123 | Viewer |

Seed document ID: `seed-doc-001`

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                               │
│  ┌──────────────┐    ┌─────────────┐    ┌───────────────┐  │
│  │   Editor UI  │───▶│ Sync Engine │───▶│ IndexedDB     │  │
│  │  (React)     │◀───│ (queue/merge)│◀───│ (source of    │  │
│  └──────────────┘    └──────┬──────┘    │  truth)       │  │
│                             │ online     └───────────────┘  │
└─────────────────────────────┼───────────────────────────────┘
                              ▼
                    ┌─────────────────┐
                    │  Next.js API     │
                    │  /api/documents  │
                    │  /sync, /versions│
                    └────────┬────────┘
                             ▼
                    ┌─────────────────┐
                    │  PostgreSQL      │
                    │  + RLS policies  │
                    └─────────────────┘
```

### Sync protocol

1. Edits are diffed into `insert`/`delete` operations with monotonic Lamport clocks.
2. Operations are written to IndexedDB immediately (zero network latency).
3. Background sync pushes pending ops to `POST /api/documents/[id]/sync`.
4. Server merges via deterministic ordering and returns remote ops the client hasn't seen.
5. Client merges remote + local without overwriting unsynced local work.

### Conflict resolution

Concurrent edits at the same position are ordered by:

1. `lamportClock` (ascending)
2. `userId` (lexicographic)
3. `operationId` (lexicographic)

This guarantees all clients converge to identical document state.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run test` | Run Vitest unit tests |
| `npm run db:push` | Push Prisma schema to DB |
| `npm run db:seed` | Seed demo data |

## Deployment

> **JLL policy requires InfoSec approval before deploying to external infrastructure.** For prototyping, use localhost. If you have approval, proceed. If not, contact your engineering team before deploying.

For approved deployments:

1. Provision PostgreSQL (Neon, Supabase, RDS, etc.)
2. Set environment variables: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `OPENAI_API_KEY`
3. Run `npx prisma db push` against production DB
4. Deploy to Vercel — CI workflow in `.github/workflows/ci.yml` validates build + tests

## Security

See [SECURITY.md](./SECURITY.md) for threat model, mitigations, and OOM prevention strategies.

## Testing offline sync

1. Open a document as `bob@example.com`
2. Open DevTools → Network → check **Offline**
3. Edit the document — changes persist instantly
4. Uncheck **Offline** — sync indicator shows pending → syncing → synced
5. Open same doc as `alice@example.com` in another browser — merged content appears

## License

MIT
