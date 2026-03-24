# Simple Price Tracker

Angular + NestJS + Prisma + PostgreSQL. Free tier: **5 active** product URL trackings; **Pro** (PayPal subscription) unlocks unlimited.

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

Set `PAYPAL_SANDBOX_CLIENT_ID` / `PAYPAL_SANDBOX_SECRET` for sandbox; the web image substitutes the PayPal client ID at build time (see `frontend/Dockerfile`).

### Env alignment with ShowBK

You can reuse the same names as `ShowBK Photographer Gallery` / `packages/core`: **`PAYPAL_CLIENT_ID`**, **`PAYPAL_SECRET`**, **`PAYPAL_SANDBOX_CLIENT_ID`**, **`PAYPAL_SANDBOX_SECRET`**, **`RESEND_API_KEY`**, **`EMAIL_FROM`** (and **`JWT_SECRET`**). Copy values into this project’s `.env` files only on your machine — do not commit secrets.

- **Database host in Docker**: ShowBK uses `db` as the Postgres service name; this stack uses **`postgres`**. Set `DATABASE_URL` with host `postgres` when running via Compose, or use the default in `docker-compose.yml`.
- Not used here (no code): `B2_CDN_*`, `REDIS_*`, `UMAMI_*`, `AWS_*` / SES, `PRODIGI_*`, `CAPTCHA_*`.

## Stack notes

- **Nginx** is included in the `web` image only (reverse proxy + static files). You can put **Cloudflare** in front; no need for Backblaze or Redis for this app’s core flow.
- **Resend** is optional (`RESEND_API_KEY`); welcome email is skipped if unset.
- Price checks run on a **6-hour** cron; users can **Refresh** manually from the dashboard.
