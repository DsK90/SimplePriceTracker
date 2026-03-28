# Umami: keine Views / CORS (z. B. `umami.showbk.com` + Pricefly auf anderer Domain)

Der Tracker (`script.js`) lädt von deinem Umami-Host, sendet die Daten aber per **`fetch()` POST** (JSON) an z. B. `/api/send`. Das ist **cross-origin**, wenn die App auf z. B. `pricefly.example.com` läuft und Umami auf `umami.showbk.com`.

Dafür muss der Browser **CORS** erlauben: Antwort auf **`OPTIONS`** (Preflight) und **`Access-Control-Allow-*`** auf der **POST**-Antwort.

## 1. Zuerst prüfen (ohne Server-Änderung)

1. **Cookie-Banner:** Nur nach **„Alle akzeptieren“** wird Umami bei Pricefly injiziert (`CookieConsentService`). Ohne Zustimmung keine Requests.
2. **Website in Umami:** Unter *Settings → Websites* einen **eigenen** Eintrag für Pricefly anlegen und die **Website-ID** in `UMAMI_WEBSITE_ID` beim **Build** des `web`-Images setzen (nicht die ID einer anderen Site wiederverwenden).
3. **Netzwerk:** Im Browser **Entwicklertools → Netzwerk**: nach Zustimmung `script.js` von `umami.showbk.com` laden lassen, dann **`send`** oder **`/api/send`** suchen.
   - **Rot / (failed):** oft CORS, Adblock, oder falsche URL.
   - Klick auf die Anfrage → **Konsole** zeigt oft: *blocked by CORS policy*.
4. **Adblock / Privatsphäre:** Listen blockieren manchmal `umami` oder `/api/send`.
5. **Umami-Version:** `docker compose pull && docker compose up -d` für `ghcr.io/umami-software/umami:latest` — neuere Images bringen oft bessere CORS-Middleware.

## 2. Nginx vor Umami: CORS für `/api/send`

Wenn die App die Header nicht setzt oder ein Proxy sie verwirft, setzt du sie **vor** Umami (nur für den Collect-Endpunkt).

**Wichtig:** `location = /api/send` muss **vor** dem allgemeinen `location /` stehen, damit er greift.

Siehe vollständiges Beispiel: `deploy/nginx-umami-vhost-cors.example.conf`.

Kurzform (einbinden im `server { … }` für `umami.showbk.com`):

- **`OPTIONS`:** `204` mit `Access-Control-Allow-Origin`, `-Methods`, `-Headers`, `-Max-Age`.
- **`POST`:** `proxy_pass` zum Umami-Container; dieselben CORS-Header mit `always` anhängen.

Erlaubte Header (passend zum offiziellen Tracker): `Content-Type`, `x-umami-cache`.

`Access-Control-Allow-Origin` kann für reine Tracking-POSTs ohne Cookies oft `*` sein. Wenn du lieber nur bekannte Frontends erlauben willst, nutze eine `map` auf `$http_origin` und setze `$cors_origin` statt `*`.

## 3. Cloudflare (falls aktiv für `umami.showbk.com`)

- **Caching:** Page Rules / Cache Rules: `/api/send` **nicht cachen** (sonst leere oder falsche Antworten).
- Firewall: keine Blockade für `POST` auf `/api/send`.

## 4. Umami-Umgebungsvariablen (optional)

- `CORS_MAX_AGE` (Sekunden für Preflight-Cache), siehe [Umami Environment variables](https://docs.umami.is/docs/environment-variables).

Nach Änderungen an Nginx: `nginx -t && systemctl reload nginx` (oder dein Prozess).

## 5. Doppelte CORS-Header

Wenn Umami **und** Nginx jeweils `Access-Control-Allow-Origin` setzen, meldet die Konsole manchmal einen Fehler. Dann im `location = /api/send` vor `add_header` z. B.:

```nginx
proxy_hide_header Access-Control-Allow-Origin;
proxy_hide_header Access-Control-Allow-Methods;
```

## 6. `POST /api/send` → **400 Bad Request** (nicht CORS)

Ein **400** bedeutet: die Anfrage kam beim Server an, wurde aber **inhaltlich abgelehnt**. Das ist **kein** reines CORS-Problem (das wäre oft ein Netzwerk-/Browser-Block mit CORS-Meldung).

Typische Ursachen:

1. **Falsche Website-ID**  
   In Pricefly muss `UMAMI_WEBSITE_ID` **exakt** die UUID der Website sein, die du unter *Umami → Settings → Websites* für **dieses** Projekt angelegt hast.  
   Eine ID von einer anderen App oder ein veralteter Build mit leerer/fehlender Variable führt oft zu 400. Nach Änderung: **`web`-Image neu bauen** (Compose-`build` args lesen die Werte aus der `.env`).

2. **Domain-Filter in Umami**  
   Wenn für die Website **erlaubte Domains** gesetzt sind, muss der **Hostname** der laufenden App (z. B. `pricefly.example.com`) dort passen — sonst kann die API ablehnen.

3. **Falsche Umami-Instanz**  
   `script.js` und `/api/send` müssen zur **gleichen** Installation gehören (gleicher Host wie `UMAMI_SCRIPT_URL` bzw. `UMAMI_HOST_URL`). Eine ID aus Instanz A an Instanz B senden → 400.

4. **Sehr alte / sehr neue Umami-Version**  
   Bei selbst gehostetem Umami: Image aktualisieren (`docker compose pull` …), damit Tracker und API zusammenpassen.

**In der Pricefly-Codebasis:** Es gibt **keinen** fest eingebauten Default mehr für `UMAMI_WEBSITE_ID`. Ohne gesetzte ID wird der Tracker gar nicht geladen — damit entstehen keine „Geister“-Requests mit falscher UUID.

Zum Debuggen: In den DevTools die **POST**-Antwort von `/api/send` öffnen → **Antworttext** (Body) enthält bei neueren Umami-Versionen oft einen kurzen Ablehnungsgrund.
