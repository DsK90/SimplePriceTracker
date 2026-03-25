# Deploying `pricefly.reikalabs.com` + Umami + Cloudflare + MailerSend

Use this checklist on your Hetzner server together with the repo’s Docker Compose stack.

## 1. DNS (Cloudflare: zone `reikalabs.com`)

1. **A record** `pricefly` → your Hetzner server **public IPv4** (proxy status: **Proxied** orange cloud if you want Cloudflare features).
2. **A record** `umami` → **same** server IP (Proxied or **DNS only** — see SSL below).
3. Optional: **AAAA** for IPv6 if your server has one.

### Cloudflare SSL mode

- If the **origin** (nginx on Hetzner) terminates HTTPS with a valid certificate (Let’s Encrypt): set SSL/TLS to **Full (strict)**.
- If the origin is only HTTP on port 80: use **Full** (not ideal) or add TLS on the origin and switch to **Full (strict)**.

## 2. Umami on the server

1. Copy `deploy/umami-docker-compose.example.yml` to the server (e.g. `/opt/umami/docker-compose.yml`).
2. Create `/opt/umami/.env` with strong values:

   ```env
   UMAMI_DB_PASSWORD=<long-random>
   UMAMI_APP_SECRET=<openssl rand -hex 32>
   ```

3. `docker compose up -d` in that folder.
4. Open `https://umami.reikalabs.com` (after nginx + certs), log in with Umami defaults, **change the admin password**, then **Settings → Websites → Add website**:
   - Name: e.g. `Pricefly`
   - Domain: `https://pricefly.reikalabs.com`
5. Copy the **Website ID** and the **tracker script URL** (e.g. `https://umami.reikalabs.com/script.js`).

### Nginx for Umami + Pricefly

- Use `deploy/nginx-host-pricefly.example.conf` as a template.
- Point `umami` upstream to the port you published (example uses `3001:3000`).
- Obtain certificates (e.g. Certbot nginx plugin) for `pricefly.reikalabs.com` and `umami.reikalabs.com`.

### Future apps

- Add another **Umami website** entry per app (same Umami instance).
- Each app’s frontend build gets that site’s **Website ID** and the same `UMAMI_SCRIPT_URL` if the script stays on `umami.reikalabs.com`.

## 3. Pricefly app (this repo)

1. On the server, clone the repo and create `.env` from `.env.example`.
2. Set at least:

   ```env
   JWT_SECRET=<strong-random>
   UMAMI_SCRIPT_URL=https://umami.reikalabs.com/script.js
   UMAMI_WEBSITE_ID=<id from Umami UI>
   CORS_ORIGIN=https://pricefly.reikalabs.com
   SSL_PRIMARY_DOMAIN=pricefly.reikalabs.com
   LETSENCRYPT_EMAIL=your-email@example.com
   # Optional extra SANs on the same certificate (space-separated):
   # SSL_EXTRA_DOMAINS=umami.reikalabs.com
   ```

3. Set `DATABASE_URL`, PayPal, `MAILERSEND_API_KEY`, `EMAIL_FROM`, etc. as needed.

### Option A — HTTPS in Docker (Let’s Encrypt, same pattern as ShowBK)

1. `mkdir -p nginx/certbot_conf nginx/certbot_www`
2. Start app stack **without** the edge proxy:  
   `docker compose -f docker-compose.yml -f docker-compose.ssl.yml up -d postgres api web`
3. **While host port 80 is free** (stop any other nginx/listener), obtain certificates once:  
   `docker compose -f docker-compose.yml -f docker-compose.ssl.yml --profile init run --rm certbot-init`
4. Start TLS + renewal:  
   `docker compose -f docker-compose.yml -f docker-compose.ssl.yml up -d edge certbot`

The **`edge`** container listens on **80/443** and proxies to the internal **`web`** container (which still proxies `/api` to the API). Adjust DNS so `SSL_PRIMARY_DOMAIN` points at this server before step 3.

5. Rebuild the **`web`** image when you change Umami build args:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.ssl.yml build --no-cache web
   docker compose -f docker-compose.yml -f docker-compose.ssl.yml up -d
   ```

### Option B — Host nginx + Certbot

If you prefer TLS on the host instead of the **`edge`** service, use `deploy/nginx-host-pricefly.example.conf` and obtain certificates with Certbot on the host (see earlier sections). Do **not** run both **Option A** and **Option B** on the same ports.

6. If you use **Option B** and the host nginx proxies to Docker `web` on `127.0.0.1:8080`, bind stack ports to localhost only (or firewall) so the API is not exposed publicly except through nginx.

## 4. MailerSend (transactional email)

1. In [MailerSend](https://www.mailersend.com/) → **Sending** → **Domains**: add your domain (e.g. **`reikalabs.com`**) and add the **DNS records** they show (SPF, DKIM, etc.) in Cloudflare until the domain is **Verified**.
2. **Sending** → **Sender identities** (or use the domain’s default): ensure the **From** address you will use is allowed (e.g. `noreply@reikalabs.com`).
3. **Integrations** → **API tokens** (or **Settings** → **API tokens**): create a token with **Email** permission and copy it once.
4. In this app’s `.env` / Compose:

   - `MAILERSEND_API_KEY` — the API token from step 3.
   - `EMAIL_FROM` — must match a verified sender/domain in MailerSend, e.g. `Pricefly <noreply@reikalabs.com>`.

5. Redeploy the `api` container after changing env.

The backend uses the official **`mailersend`** npm package and `EMAIL_FROM` / `MAIL_FROM` (same meaning as before; only the provider and env key name changed from Resend).

## 5. PayPal (production)

- Use **live** credentials and set `PAYPAL_USE_SANDBOX=false`.
- In the PayPal Developer / app settings, add `https://pricefly.reikalabs.com` (and return URLs your app uses) to the allowed URLs.

## 6. Cloudflare extras (optional)

- **Always Use HTTPS**, **Automatic HTTPS Rewrites** — usually on.
- **WebSockets**: if you add them later, set **Network** compatibility as needed.
- **Rate limiting / WAF** — optional for `/api` and login routes.

## 7. Real client IP (optional)

If you need logs or rate limits per client IP in **host** nginx, configure `set_real_ip_from` for [Cloudflare IP ranges](https://www.cloudflare.com/ips/) and `real_ip_header CF-Connecting-IP`. The container nginx in this repo already forwards `X-Forwarded-Proto` correctly when Cloudflare sends `X-Forwarded-Proto: https`.
