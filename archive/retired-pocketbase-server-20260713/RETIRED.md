Retired 2026-07-13: this was the self-hosted PocketBase server config
(Caddy reverse proxy, docker-compose, schema export) for driver-log's old
auth+sync backend. PocketBase has been dropped entirely in favor of this
repo's own `api/`+`lib/` serverless functions on Vercel, backed by Neon
Postgres (see `sql/schema.sql` and the root `README.md`'s "Cloud backend
setup" section). Kept for reference only — nothing here is deployed.
