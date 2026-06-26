# Security Architecture & Threat Mitigation

## Authentication

- **Auth.js** with JWT sessions and bcrypt-hashed passwords (cost factor 12).
- API routes call `requireAuth()` / `requireDocumentAccess()` before any data access.
- Middleware protects `/dashboard` and `/documents/*` routes.

## Authorization (RBAC)

| Role | Read | Edit | Sync push | Invite members | Restore versions |
|------|------|------|-----------|----------------|------------------|
| Owner | ✅ | ✅ | ✅ | ✅ | ✅ |
| Editor | ✅ | ✅ | ✅ | ❌ | ✅ |
| Viewer | ✅ | ❌ | ❌ | ❌ | ❌ |

Viewers are rejected at the API layer (`403 Editors only`) on sync push, preventing state mutation on the server.

## Tenant Isolation

### Application layer
- Every document query is scoped via `getDocumentRole()` — users without membership receive 403/404.
- Prisma queries never accept arbitrary `userId` from client payloads for authorization decisions.

### Database layer (defense in depth)
- PostgreSQL **Row Level Security** policies in `prisma/rls.sql` restrict SELECT to document owners and members.
- `withUserContext(userId)` sets `app.current_user_id` for RLS-aware queries.

## Malformed / Oversized Sync Payload Protection

### Problem
A malicious actor could send a massive JSON payload or millions of operations to cause **Out-of-Memory (OOM)** or CPU exhaustion.

### Mitigations

| Control | Limit | Location |
|---------|-------|----------|
| Max payload size | 256 KB | `parseJsonSafely()` before JSON.parse |
| Max ops per sync request | 100 | Zod `syncPushSchema` |
| Max operation content | 10,000 chars | Zod `operationSchema` |
| Max document content | 500,000 chars | Server merge validation |
| Max total operations per doc | 50,000 | `processSyncPush()` |
| Rate limit | 60 syncs/min/user | In-memory rate limiter on sync route |
| Operation ID format | UUID v4 | Zod validation |
| Position bounds | 0 – max doc length | Zod validation |

### Contingency plans

1. **OOM despite limits:** Run API in containers with memory limits; use request body size limits at reverse proxy (e.g., nginx `client_max_body_size 300k`).
2. **Rate limit bypass (distributed attack):** Move rate limiting to Redis/Upstash at edge; add per-document rate limits.
3. **Operation log growth:** Implement snapshot compaction — periodically collapse operation log into a single snapshot operation and archive old ops.
4. **Abuse detection:** Alert on sync rejection rate spikes; temporarily block document sync for investigation.

## Input Validation

All sync payloads pass through **Zod** schemas with strict types. Invalid payloads return `400` with descriptive errors — never propagated to merge logic.

## AI Endpoint Security

- Requires authentication.
- Content capped at 20,000 characters.
- Returns `503` when `OPENAI_API_KEY` is unset (no silent failures with mock data).
- AI output is presented as a suggestion — user must explicitly apply.

## Client-Side Considerations

- IndexedDB stores only documents the user has accessed (no cross-tenant data).
- `clientId` is a random UUID per browser, not derived from user identity.
- Offline edits queue locally; server validates on push.

## Recommended Production Hardening

- [ ] Enable HTTPS everywhere
- [ ] Add CSRF protection for cookie-based sessions
- [ ] Move rate limiting to Redis
- [ ] Add structured logging + alerting (Sentry, Datadog)
- [ ] Enable Prisma connection pooling (PgBouncer)
- [ ] Regular dependency audits (`npm audit`)
- [ ] WAF rules for API abuse patterns
