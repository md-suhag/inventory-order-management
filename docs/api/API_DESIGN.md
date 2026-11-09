# API Design

Machine-readable contract: [`openapi.yaml`](openapi.yaml) (served at `/api/docs`, raw JSON at `/api/docs/openapi.json`). An integration test fails if a registered route is missing from the spec or the spec documents a route that does not exist.

## 1. Conventions

| Topic | Convention |
|-------|-----------|
| Base URL | `/api/v1` |
| Format | JSON (`Content-Type: application/json`), body limit 100 kB |
| Resources | Plural nouns: `/products`, `/purchases/:id/receipts` |
| State changes | Action sub-resources with `POST`: `/orders/:id/confirm`, `/orders/:id/cancel`, `/payments/:id/reversal` |
| Updates | `PATCH` with partial body; unknown fields are ignored |
| IDs | UUID (v7) in paths; human-facing numbers (`SO-000123`) are separate fields |
| Money | Strings with 2 decimals (`"1250.50"`); unit costs up to 4 decimals |
| Dates | ISO 8601 UTC timestamps; date-only filters (`from`, `to`) are interpreted in the business timezone |
| Auth | `Authorization: Bearer <accessToken>` |
| Correlation | `X-Request-Id` accepted (8–64 URL-safe chars) or generated; echoed on every response and in error bodies |

## 2. Responses

```jsonc
// single resource — 200 / 201
{ "data": { "id": "…", "name": "…" } }

// list — 200
{ "data": [ … ], "meta": { "page": 1, "pageSize": 20, "total": 57, "totalPages": 3 } }

// no content — 204 (logout, delete)
```

## 3. Errors

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [{ "field": "email", "message": "Invalid email address" }],
    "requestId": "3f1c2a9e-5c4b-4d1e-9a51-0b7f0f1c2d3e"
  }
}
```

| HTTP | `code` values | When |
|------|---------------|------|
| 400 | `BAD_REQUEST`, `IDEMPOTENCY_KEY_REQUIRED`, `INVALID_TOKEN` (reset link) | Malformed JSON, missing headers, bad reset token |
| 401 | `UNAUTHENTICATED`, `INVALID_TOKEN`, `TOKEN_EXPIRED`, `INVALID_CREDENTIALS` | No/invalid/expired access token; login failure |
| 403 | `FORBIDDEN`, `ACCOUNT_INACTIVE`, `REGISTRATION_DISABLED` | Missing permission; deactivated account |
| 404 | `NOT_FOUND` | Unknown route or resource |
| 409 | `CONFLICT`, `DUPLICATE`, `REFERENCED`, `INVALID_STATE_TRANSITION`, `TRANSACTION_CONFLICT` | Unique conflicts, referenced records, wrong document status, lock conflicts |
| 413 | `PAYLOAD_TOO_LARGE` | Body > 100 kB |
| 422 | `VALIDATION_ERROR`, `INVALID_REFERENCE`, `BUSINESS_RULE_VIOLATION`, `IDEMPOTENCY_KEY_REUSED` | Field validation (all invalid fields listed); a referenced id in the body does not exist (e.g. `roleId`); business rule failures (e.g. insufficient stock, overpayment, last active admin) |
| 429 | `RATE_LIMITED` | Rate limit exceeded |
| 500 | `INTERNAL_ERROR` | Unexpected; details never exposed in production |

Clients must branch on `code`, never on `message`.

## 4. Lists: pagination, search, sort, filters

All list endpoints share one query builder (`src/common/query/list-query.ts`).

| Param | Example | Rules |
|-------|---------|-------|
| `page` | `2` | ≥ 1, default 1 |
| `pageSize` | `50` | 1–100, default 20 |
| `search` | `acme` | Trimmed, ≤ 100 chars; case-insensitive *contains* over the module's searchable fields (may include related fields such as customer name) |
| `sort` | `name:asc,createdAt:desc` | Up to 3 keys; field must be in the endpoint's whitelist; `id` is appended as a tie-breaker so pages are stable |
| filters | `status=ACTIVE,ARCHIVED`, `isActive=true`, `from=2026-11-01&to=2026-11-30` | Per endpoint; enums accept comma lists or repeated params; booleans `true`/`false` |

Invalid values return `422 VALIDATION_ERROR` naming the parameter (e.g. `query.sort`).

## 5. Idempotency

Retry-prone operations that create financial or stock records require `Idempotency-Key: <8–100 chars, a UUID is recommended>`:
goods receipts, payments/refunds/reversals, stock adjustments, return requests.

- Same key + same payload → the original result is returned (`Idempotent-Replayed: true`), nothing is created twice.
- Same key + different payload → `422 IDEMPOTENCY_KEY_REUSED`.
- Missing/invalid key → `400 IDEMPOTENCY_KEY_REQUIRED`.

State transitions (`confirm`, `complete`, `cancel`, return `complete`/`reject`) are idempotent by state machine: repeating them returns `409 INVALID_STATE_TRANSITION` and has no side effects.

## 6. Authentication flow

```
POST /auth/login            { email, password }      → { accessToken (15 min), refreshToken (7 d), user }
GET  /any-protected-route   Authorization: Bearer …  → 401 TOKEN_EXPIRED when the access token expires
POST /auth/refresh          { refreshToken }         → new { accessToken, refreshToken }  (old one revoked)
POST /auth/logout           { refreshToken }         → 204 (session family revoked)
```

The Next.js server stores both tokens in HttpOnly cookies and performs refreshes; browsers never see tokens (TECHNICAL_DECISIONS TD-06).

## 7. Implemented endpoints

| Method | Path | Auth | Permission | Notes |
|--------|------|------|-----------|-------|
| GET | `/health/live` | – | – | Liveness |
| GET | `/health/ready` | – | – | Readiness (DB check), 503 when unavailable |
| POST | `/auth/login` | – | – | Lockout after 5 failures; 10 req/min/IP |
| POST | `/auth/refresh` | – | – | Rotation + reuse detection |
| POST | `/auth/logout` | – | – | Idempotent |
| POST | `/auth/logout-all` | ✔ | – | Revokes all sessions, invalidates access tokens |
| POST | `/auth/register` | – | – | Only when `allow_self_registration`; creates inactive STAFF |
| POST | `/auth/forgot-password` | – | – | Always 202; 5 req/hour/IP |
| POST | `/auth/reset-password` | – | – | Single-use token, revokes sessions |
| GET | `/auth/me` | ✔ | – | Profile + effective permissions |
| PATCH | `/auth/me` | ✔ | – | Name, phone |
| POST | `/auth/change-password` | ✔ | – | Returns a fresh token pair |
| GET | `/users` | ✔ | `users.read` | Search name/email; filters `roleId`, `isActive`; sort `name`, `email`, `createdAt`, `lastLoginAt` |
| POST | `/users` | ✔ | `users.manage` | Active user with initial password; ADMIN role only assignable by an admin |
| GET | `/users/:id` | ✔ | `users.read` | |
| PATCH | `/users/:id` | ✔ | `users.manage` | Name, phone, role; role change revokes sessions; not own role; last active admin protected |
| POST | `/users/:id/activate` | ✔ | `users.manage` | Idempotent; clears lockout |
| POST | `/users/:id/deactivate` | ✔ | `users.manage` | Idempotent; revokes sessions; not self; last active admin protected |
| GET | `/roles/permissions` | ✔ | `roles.read` | Permission catalogue |
| GET | `/roles` | ✔ | `roles.read` | With permissions + `userCount`; search name/description; sort `name`, `createdAt` |
| POST | `/roles` | ✔ | `roles.manage` | Custom role; names unique case-insensitively; non-admins only grant what they hold |
| GET | `/roles/:id` | ✔ | `roles.read` | |
| PATCH | `/roles/:id` | ✔ | `roles.manage` | `permissions` replaces the set; ADMIN immutable; system roles not renamable; non-admins not on own role |
| DELETE | `/roles/:id` | ✔ | `roles.manage` | Custom roles only; 409 `REFERENCED` while users hold it |

Further modules are designed and added here (and to `openapi.yaml`) as each phase implements them.
