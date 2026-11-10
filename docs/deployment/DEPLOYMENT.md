# Deployment Guide

Production and containerized setup for the Mini Inventory & Order Management System.

## 1. Architecture & Containers

| Service | Image / Target | Responsibility | Exposed Port |
|---------|----------------|----------------|--------------|
| `postgres` | `postgres:16-alpine` | Primary PostgreSQL 16 database (`pgdata` volume) | Internal only (`5432`) |
| `migrate` | `backend/Dockerfile` (`migrator`) | Runs `npx prisma migrate deploy` and idempotent `node dist/database/seed/run.js` | One-shot |
| `backend` | `backend/Dockerfile` (`runner`, non-root `node`) | Express 5 REST API (`/api/v1`) + image storage (`uploads_data` volume) | Internal only (`4000`) |
| `frontend` | `frontend/Dockerfile` (`runner`, non-root `node`) | Next.js 16 BFF UI server (`server.js` standalone build) | `127.0.0.1:3000` (behind reverse proxy) |

In production (`docker-compose.prod.yml`), PostgreSQL and Express are reachable only inside the Docker bridge network. Next.js communicates with Express over `API_BASE_URL=http://backend:4000/api/v1` and holds JWT/refresh tokens in `HttpOnly; Secure; SameSite=Lax` cookies.

## 2. Environment Variables

Copy the root template before deploying:

```bash
cp .env.prod.example .env.prod
```

Generate a strong JWT secret (must be ≥ 32 characters and must not contain `change-me`):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### Root / Production Compose Variables (`.env.prod`)

| Variable | Required | Default / Example | Description |
|----------|----------|-------------------|-------------|
| `POSTGRES_USER` | Yes | `inventory` | Schema owner used by `postgres` and `migrate` |
| `POSTGRES_PASSWORD` | Yes | — | PostgreSQL password (no default in prod) |
| `POSTGRES_DB` | Yes | `inventory` | Database name |
| `APP_DATABASE_URL` | No | Owner URL | Optional least-privilege `inventory_app` connection string for `backend` |
| `APP_URL` | Yes | `https://inventory.example.com` | Public HTTPS URL of frontend (used in CORS, password resets, redirects) |
| `CORS_ORIGINS` | Yes | `https://inventory.example.com` | Comma-separated allowed browser origins |
| `APP_BIND_HOST` | No | `127.0.0.1` | Host interface bound by `frontend` (`127.0.0.1` when behind local TLS proxy) |
| `APP_PORT` | No | `3000` | Host port bound by `frontend` |
| `TRUST_PROXY` | Yes | `1` | Trusted proxy hops for client IP detection (`express-rate-limit` + audit logs) |
| `SESSION_COOKIE_SECURE` | Yes | `true` | Marks `HttpOnly` auth cookies `Secure` (must be `true` on HTTPS) |
| `JWT_ACCESS_SECRET` | Yes | — | HMAC key for 15-minute access JWTs (boot refuses default `change-me` in prod) |
| `ACCESS_TOKEN_TTL_SECONDS` | No | `900` | Access token lifetime in seconds (`60`–`3600`) |
| `REFRESH_TOKEN_TTL_DAYS` | No | `7` | Opaque refresh token lifetime in days (`1`–`90`) |
| `BCRYPT_ROUNDS` | No | `12` | bcrypt cost factor (`4`–`15`) |
| `RATE_LIMIT_ENABLED` | No | `true` | Enable in-memory rate limiters (see TD-24 if scaled horizontally) |
| `SMTP_HOST` | Yes | `smtp.example.com` | SMTP server host (boot refuses to start without it when `NODE_ENV=production`) |
| `SMTP_PORT` | No | `587` | SMTP port (`587` STARTTLS / `465` TLS) |
| `SMTP_SECURE` | No | `false` | Set `true` for implicit TLS (`465`) |
| `SMTP_USER` / `SMTP_PASS` | Cond. | — | SMTP authentication credentials |
| `MAIL_FROM` | No | `Inventory System <no-reply@example.com>` | Outgoing email `From` header |
| `SWAGGER_ENABLED` | No | `false` | Keep `false` in production (disabled automatically when `NODE_ENV=production`) |
| `SEED_ADMIN_NAME` | No | `System Administrator` | Initial admin display name (only applied if no ADMIN user exists) |
| `SEED_ADMIN_EMAIL` | Yes | `admin@example.com` | Initial admin email (only on empty database) |
| `SEED_ADMIN_PASSWORD` | Yes | — | Initial admin password (≥ 8 chars, ≤ 72 bytes, letter + digit); change after first login |

## 3. Deploying with Production Docker Compose

1. Create and edit `.env.prod`:

   ```bash
   cp .env.prod.example .env.prod
   ```

2. Validate Compose configuration before startup:

   ```bash
   docker compose --env-file .env.prod -f docker-compose.prod.yml config --quiet
   ```

3. Build and start the stack (`migrate` runs `npx prisma migrate deploy` and idempotent base seeding before `backend` starts):

   ```bash
   docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
   ```

4. Verify service health:

   ```bash
   docker compose --env-file .env.prod -f docker-compose.prod.yml ps
   docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T backend \
     node -e "fetch('http://127.0.0.1:4000/api/v1/health/ready').then(async r => { console.log(r.status, await r.text()); process.exit(r.ok ? 0 : 1); })"
   ```

5. Log in as the seeded admin and immediately rotate the password via **Profile → Security**.

### Full-Stack Local Container Mode

Default local development uses `docker compose up -d` (`postgres` on `5433` + `mailpit` on `1025`/`8025`) with Node servers on the host. To boot all containers locally instead:

```bash
docker compose --profile fullstack up -d --build
```

## 4. Least-Privilege Database Role (Recommended Hardening)

After the first migration completes, run [scripts/db/harden-app-role.sql](../../scripts/db/harden-app-role.sql) as the schema owner (`inventory`) to create a non-owner runtime role (`inventory_app`) that cannot alter schema, touch `_prisma_migrations`, or `UPDATE`/`DELETE` append-only ledger tables (`inventory_movements`, `payments`, `audit_logs`, `purchase_receipts`, `purchase_receipt_items`):

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T postgres \
  psql -U inventory -d inventory -v app_pass='STRONG_RUNTIME_PASSWORD' < scripts/db/harden-app-role.sql
```

Then set `APP_DATABASE_URL` in `.env.prod` and recreate `backend`:

```bash
APP_DATABASE_URL=postgresql://inventory_app:STRONG_RUNTIME_PASSWORD@postgres:5432/inventory?schema=public
```

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d backend
```

## 5. Reverse Proxy & TLS Termination

Place Caddy or Nginx in front of `127.0.0.1:3000` so TLS terminates at the proxy and `X-Forwarded-*` headers flow cleanly to Next.js and Express.

### Caddy Example (`/etc/caddy/Caddyfile`)

```caddyfile
inventory.example.com {
  encode gzip zstd
  reverse_proxy 127.0.0.1:3000
}
```

### Nginx Example

```nginx
server {
  listen 443 ssl http2;
  server_name inventory.example.com;

  ssl_certificate     /etc/letsencrypt/live/inventory.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/inventory.example.com/privkey.pem;

  client_max_body_size 12m; # allows multi-image uploads (up to 5 x 2 MB)

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

## 6. Backup & Restore (`pg_dump` / `pg_restore`)

### Create a Backup

Uses PostgreSQL custom archive format (`pg_dump -Fc`) plus a gzipped tarball of `/app/uploads`:

```bash
./scripts/backup/backup.sh ./backups
```

Or manually against any compose PostgreSQL container:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U inventory -d inventory -Fc > backups/inventory-$(date -u +%Y%m%d).dump
```

### Restore & Verify

Restores stop `frontend` and `backend` first, apply `pg_restore --clean --if-exists --no-owner --single-transaction`, restore `uploads`, and restart services:

```bash
CONFIRM_RESTORE=yes ./scripts/backup/restore.sh backups/db-inventory-20261110T120000Z.dump backups/uploads-20261110T120000Z.tar.gz
```

Note on append-only triggers: `pg_restore --clean --if-exists` recreates tables, triggers, constraints, and sequences cleanly before loading data, preserving all append-only ledger triggers.

## 7. Upgrades & Operational Maintenance

1. Back up database + uploads before upgrading (`./scripts/backup/backup.sh ./backups`).
2. Pull the release commit and rebuild/restart:

   ```bash
   git pull --ff-only
   docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
   ```

3. View structured logs:

   ```bash
   docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f backend frontend
   ```
