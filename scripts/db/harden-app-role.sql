-- Optional production defense-in-depth hardening (SECURITY.md §5).
-- Run as the schema owner (e.g. `inventory`) AFTER initial migrations (`prisma migrate deploy`),
-- passing a secure password for `inventory_app`:
--
--   docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T postgres \
--     psql -U inventory -d inventory -v app_pass='YOUR_STRONG_APP_PASSWORD' < scripts/db/harden-app-role.sql

SELECT format(
  'CREATE ROLE inventory_app LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT',
  :'app_pass'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'inventory_app')
\gexec

GRANT CONNECT ON DATABASE inventory TO inventory_app;
GRANT USAGE ON SCHEMA public TO inventory_app;

-- Operational CRUD privileges on application tables and sequences
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO inventory_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO inventory_app;

-- Enforce append-only ledgers at the role-privilege layer (in addition to DB triggers)
REVOKE UPDATE, DELETE ON TABLE
  public.inventory_movements,
  public.payments,
  public.audit_logs,
  public.purchase_receipts,
  public.purchase_receipt_items
FROM inventory_app;

-- Runtime app user should never modify Prisma migration history
REVOKE INSERT, UPDATE, DELETE ON TABLE public._prisma_migrations FROM inventory_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO inventory_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO inventory_app;
