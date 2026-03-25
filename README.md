# Simple Price Tracker

Angular + NestJS + Prisma + PostgreSQL. Free tier: **5 active** product URL trackings; **Pro** is **€3.99/month net** plus **19% VAT** (German USt), **billed monthly** via PayPal. Ensure your PayPal billing plan matches **monthly** billing.

## Local development

From the **repository root** (recommended):

```bash
npm install                    # installs concurrently + root scripts
npm run install:all            # installs backend + frontend dependencies (first time / after clone)
```

1. Start Postgres: `docker compose up -d postgres` (or your own Postgres matching `backend/.env`).
2. Backend setup once: `cd backend && npx prisma migrate dev && npm run prisma:seed` (with `backend/.env` from `backend/.env.example`).
3. **Start API + Angular together:**

   ```bash
   npm start
   ```

   Same as `npm run dev` — runs Nest on `http://localhost:3000` and `ng serve` on `http://localhost:4200`.

Optional: `npm run dev:full` starts the Compose Postgres container, then runs `dev` (only if Docker is available).

### `P1001` / “Can’t reach database server at localhost:5432”

Prisma on your **host** must use the **published** Docker port from `docker-compose.yml` (e.g. `5460:5432` → put `localhost:5460` in `DATABASE_URL`). The container listens on 5432 **inside** Docker; your PC uses the **left** side of the mapping. Update `backend/.env` accordingly (see `backend/.env.example`).

### Manual (two terminals)

- Backend: `cd backend && npm run start:dev`
- Frontend: `cd frontend && npm start`

## Docker (all services)

From this folder:

```bash
cp .env.example .env   # fill JWT_SECRET, PayPal keys, PAYPAL_PRO_PLAN_ID
docker compose build
docker compose up -d
```

- UI: `http://localhost:8080` (nginx serves the SPA and proxies `/api` to the API; map `80:80` in `docker-compose.yml` on Linux servers if you prefer port 80).
- API directly: `http://localhost:3000/api`.

### HTTPS / Let’s Encrypt (production)

The repo includes **`docker-compose.ssl.yml`** plus **`edge`**, **`certbot`**, and **`certbot-init`** (same overall pattern as ShowBK: webroot ACME, shared volumes, renewal cron, `docker exec` nginx reload). See comments at the top of `docker-compose.ssl.yml` and `deploy/hetzner-reikalabs.md`.

- Set `SSL_PRIMARY_DOMAIN`, `LETSENCRYPT_EMAIL`, and optionally `SSL_EXTRA_DOMAINS` in `.env`.
- Create cert directories: `mkdir -p nginx/certbot_conf nginx/certbot_www`.
- Run **`certbot-init`** once while port **80** is free, then start **`edge`** + **`certbot`**.
- Set `CORS_ORIGIN` to your public `https://` origin.

Set `PAYPAL_SANDBOX_CLIENT_ID` / `PAYPAL_SANDBOX_SECRET` for sandbox; the web image substitutes the PayPal client ID at build time (see `frontend/Dockerfile`).

### Env alignment with ShowBK

You can reuse the same names as `ShowBK Photographer Gallery` / `packages/core` for **PayPal** and **`JWT_SECRET`**. For **email**, this app uses **MailerSend** (`MAILERSEND_API_KEY` + **`EMAIL_FROM`** / **`MAIL_FROM`**), not Resend. Copy values into this project’s `.env` files only on your machine — do not commit secrets.

- **Database host in Docker**: ShowBK uses `db` as the Postgres service name; this stack uses **`postgres`**. Set `DATABASE_URL` with host `postgres` when running via Compose, or use the default in `docker-compose.yml`.
- **Umami**: optional analytics — set `UMAMI_SCRIPT_URL` + `UMAMI_WEBSITE_ID` in `.env` and rebuild the `web` image (see `deploy/hetzner-reikalabs.md`).
- **Email vs push**: price-alert **emails** are optional per tracking and capped by plan (2 Free, 10 Pro); **in-app** and **web push** notifications are unlimited. See the in-app Fair use policy.
- Not used here (no code): `B2_CDN_*`, `REDIS_*`, `AWS_*` / SES, `PRODIGI_*`, `CAPTCHA_*`.

## Stack notes

- **Nginx** is included in the `web` image only (reverse proxy + static files). You can put **Cloudflare** in front; no need for Backblaze or Redis for this app’s core flow.
- **MailerSend** is optional (`MAILERSEND_API_KEY`); welcome and price-alert emails are skipped if unset.
- Price checks run on a **6-hour** cron; users can **Refresh** manually from the dashboard.

## GitHub Actions (deploy & ops)

Workflows live in `.github/workflows/` (same ideas as ShowBK: rsync, `docker-update.sh`, SSL backup, logs, restarts).

**Secrets (repository):**

| Name | Purpose |
|------|---------|
| `DEPLOY_SSH_KEY` | Private SSH key for `root` (or deploy user) on the server |
| `DEPLOY_HOST` | Server hostname or IP |

**Deploy path** defaults to `/usr/src/pricefly` (set `DEPLOY_PATH` in each workflow file if your server uses another directory).

| Workflow | Purpose |
|----------|---------|
| `deploy-daily.yml` | Scheduled + manual: backend e2e + frontend prod build, then rsync + `./docker-update.sh` |
| `deploy-no-e2e.yml` | Manual deploy without CI tests |
| `backup-ssl-certs.yml` | Copy `nginx/certbot_conf` to `/root/ssl-cert-backup/<timestamp>` on the server |
| `get-backend-logs.yml` | Tail logs for service **`api`** |
| `get-service-logs.yml` | Tail logs for any Compose service (`api`, `web`, `edge`, …) |
| `restart-backend.yml` | `docker compose … restart api` |
| `restart-frontend.yml` | `docker compose … restart web` (SPA container) |

**Server:** install Docker Compose v2, clone or rsync to `DEPLOY_PATH`, place production `.env`, and ensure `docker-update.sh` is executable. The deploy assumes **`docker-compose.yml` + `docker-compose.ssl.yml`** (TLS edge stack).
