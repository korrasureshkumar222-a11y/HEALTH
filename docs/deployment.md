# Deployment Guide

This guide covers production setup for the Chronic Disease Remote Monitoring app. The repository now includes production Dockerfiles, an Nginx reverse-proxy image, a Compose deployment definition, Pino JSON request logging, optional Sentry capture, and a GitHub Actions image publish/EC2 deploy path.

> Use synthetic data for deployment tests. Do not enable real SMS or drone operations without the relevant clinical, regulatory, and provider approvals. Drone dispatch is a mockable integration, not an operational flight-control system.

## 1. Deployment choices

| Layer | Recommended | Alternatives |
|---|---|---|
| Database | MongoDB Atlas, private network/IP allowlist, daily Atlas Cloud Backup | Self-managed MongoDB with a tested external backup destination |
| API | Docker on AWS EC2 behind TLS Nginx; containers use `restart: unless-stopped` | Render or Railway Docker service |
| Web app | Nginx client container proxied through the same TLS host | Vercel or Netlify static hosting |
| TLS | Host Nginx + Certbot/Let's Encrypt | Managed TLS on Render, Railway, Vercel, or Netlify |

The checked-in production Compose file is the complete same-host option: it runs the API and Nginx frontend, and uses Atlas as the external database. The existing [docker-compose.yml](../docker-compose.yml) and `.env.compose.example` are for local MongoDB/mongo-express development; do not publish mongo-express or use its root credentials as a production database setup.

## 2. Build and run the Docker deployment

The API and client images are built from [server/Dockerfile](../server/Dockerfile) and [client/Dockerfile](../client/Dockerfile). The client's [nginx.conf](../client/nginx.conf) serves the SPA and proxies `/api` to the API over the private Compose network. Build-time `VITE_API_BASE_URL=/api` keeps browser API traffic same-origin.

On the deployment host:

1. Install Docker Engine and the Docker Compose plugin. Create a dedicated deployment directory, copy `docker-compose.production.yml` there, and prepare `.env.production` using the variable list below. Do not copy local development `.env` files or commit production credentials.
2. Set the two image names and an immutable release tag; pull and start:

   ```sh
   export SERVER_IMAGE=ghcr.io/your-org/your-repo-server
   export CLIENT_IMAGE=ghcr.io/your-org/your-repo-client
   export IMAGE_TAG=<full-git-sha>
   docker compose -f docker-compose.production.yml pull
   docker compose -f docker-compose.production.yml up -d
   docker compose -f docker-compose.production.yml ps
   docker compose -f docker-compose.production.yml logs --tail=100 server client
   ```

3. If GHCR packages are private, authenticate the host with a read-only GitHub token (package-read scope); use a dedicated deploy user and store Docker credentials securely. Alternatively make only these application images public if the organization policy permits.
4. Confirm `http://127.0.0.1:8080/healthz` and `http://127.0.0.1:8080/api/health` respond on the host. External traffic must enter through HTTPS Nginx, not port 8080 or 5000 directly.

The API is not published on a host port. `TRUST_PROXY=2` is set for the host Nginx plus the client-container Nginx hops, so Express can recognize the original client and HTTPS via forwarded headers. Keep the API port on the internal Docker network. If a load balancer/proxy hop is added, revise and test `TRUST_PROXY` to match the trusted proxy topology; managed providers typically have a different hop count.

## 3. HTTPS with Let's Encrypt on EC2

Point DNS `A`/`AAAA` records for the chosen hostname(s) to the host. Allow inbound TCP 80/443 in the cloud firewall; do not expose 8080 or 5000. Install Nginx and Certbot on the host and proxy TLS traffic to `127.0.0.1:8080`. For a single-origin deployment, a minimal HTTPS server block is:

```nginx
server {
    listen 80;
    server_name care.example.org;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl http2;
    server_name care.example.org;
    ssl_certificate /etc/letsencrypt/live/care.example.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/care.example.org/privkey.pem;
    client_max_body_size 1m;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 75s;
    }
}
```

Issue/install the certificate and configure renewal:

```sh
sudo certbot --nginx -d care.example.org
sudo certbot renew --dry-run
```

Reload host Nginx after configuration changes. Protect private keys and back up Nginx configuration. For separate web/API hostnames, use certificates for both and set the API CORS origin to the exact web origin. Keep the client and API on the same site (for example, `app.example.org` and `api.example.org`) because refresh-token cookies are `SameSite=Strict`; unrelated hosted domains may cause browser cookie blocking.

## 4. Environment variables and secrets

Use [server/.env.example](../server/.env.example) as the source for server settings and [client/.env.example](../client/.env.example) for Vite build settings. These examples contain development defaults, not production-ready values. Production secrets belong in the host secret store/GitHub Actions secrets, never in Git, image layers, command output, or tickets.

### API runtime (`.env.production`)

| Variable | Production setting |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `5000` inside the container |
| `MONGO_URI` | Atlas URI using a dedicated least-privilege DB user and TLS |
| `CORS_ORIGIN` | Exact web origin(s), comma-separated, e.g. `https://care.example.org`; no wildcard or path |
| `TRUST_PROXY` | `2` for the checked-in host-Nginx + client-Nginx topology; only trust known hops |
| `COOKIE_SECURE` | `true` |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Distinct random secrets, at least 32 characters each |
| `PII_ENCRYPTION_KEY` | Base64-encoded 32-byte AES-256 key; preserve it securely and back it up separately from the DB |
| `SMS_LOG_HASH_SECRET` | Independent random secret, at least 32 characters |
| `SMS_WEBHOOK_URL` | Public HTTPS Twilio webhook URL, e.g. `https://care.example.org/api/sms/inbound` |
| `TWILIO_AUTH_TOKEN` | Twilio account auth token used to verify inbound signatures |
| `SMS_PROVIDER` | `mock`, `http`, or `twilio`; production sends no real SMS with `mock` |
| `TWILIO_ACCOUNT_SID`, `TWILIO_FROM_NUMBER` | Required when `SMS_PROVIDER=twilio` |
| `SMS_API_URL`, `SMS_API_TOKEN` | Required when `SMS_PROVIDER=http` |
| `DRONE_PROVIDER` | Keep `mock` unless an approved, reviewed provider is configured |
| `DRONE_API_URL`, `DRONE_API_TOKEN` | Required only when selecting the HTTP drone provider |
| `SENTRY_DSN` | Optional server-side Sentry DSN; omit to disable capture |
| `LOG_LEVEL` | Usually `info`; use `debug` temporarily and avoid logging sensitive payloads |
| `DB_CONNECT_MAX_RETRIES`, `DB_RETRY_BASE_DELAY_MS` | Startup connection retry controls; defaults are 5 and 1000 ms |
| `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL` | Token lifetimes; defaults are `15m` and `7d` |
| `AUTH_MAX_FAILED_ATTEMPTS`, `AUTH_LOCK_DURATION_MINUTES`, `AUTH_BCRYPT_ROUNDS` | Auth hardening; production bcrypt rounds must remain at least 12 |

Production configuration currently validates `TWILIO_AUTH_TOKEN`, `SMS_WEBHOOK_URL`, and `SMS_LOG_HASH_SECRET` even when outbound SMS is mocked. Configure real webhook verification credentials or intentionally revise that policy before deployment; do not use a fabricated token. Twilio's configured webhook URL must match the externally visible URL used for signature verification.

Generate independent secrets, for example:

```sh
openssl rand -hex 32
openssl rand -base64 32
```

Use hex output for JWT/hash secrets. For `PII_ENCRYPTION_KEY`, use the base64 output directly. Changing the PII key without a migration plan makes existing encrypted emergency-contact fields unreadable.

Compose also needs `SERVER_IMAGE`, `CLIENT_IMAGE`, and `IMAGE_TAG` supplied by the deployment workflow or shell. These select images; they are not API runtime secrets.

### Client build variables

| Variable | Setting |
|---|---|
| `VITE_API_BASE_URL` | `/api` for the Nginx same-origin proxy; full HTTPS API base URL for Vercel/Netlify |
| `VITE_SENTRY_DSN` | Optional browser Sentry DSN. This is public build configuration, not an auth secret. |

Vite embeds these values in public JavaScript at build time. Never put private keys or provider tokens in `VITE_*` values.

## 5. MongoDB Atlas setup and daily backups

1. Create a production Atlas project and a supported production cluster in the approved region. Enable TLS (Atlas default), encryption at rest, and private networking/peering where available.
2. Create a dedicated database user with only the application database permissions it needs. Use a separate read-only identity for reporting/backup jobs where possible.
3. Restrict Atlas Network Access to the deployment host's static egress IP or private network. Do not use `0.0.0.0/0` for production.
4. Copy the Atlas connection URI into the runtime secret store as `MONGO_URI`; URL-encode special characters in its username/password and name the application database. Verify connectivity from the deployed network before switching traffic.
5. In Atlas **Backup**, enable Cloud Backup and configure a **daily** snapshot schedule and retention to meet the organization's recovery-point objective. Configure restore access and alerting. Atlas backup availability and retention depend on the selected cluster tier/region.
6. Perform a restore exercise into a separate staging project before launch, after backup-policy changes, and periodically thereafter. Verify record counts, indexes, app startup, and encrypted PII readability with the matching PII key.

For a portable manual archive (not a substitute for automated Atlas backups), use MongoDB Database Tools from a protected admin environment:

```sh
mongodump --uri "$MONGO_URI" --archive="chronic-care-$(date -u +%Y%m%dT%H%M%SZ).archive.gz" --gzip
```

Encrypt archives at rest, upload them to a private bucket with retention/object-lock policies, restrict access, and test `mongorestore` from the archive. Never store backups in the application image or public web root.

## 6. Deploy API and web using managed providers

### Render or Railway API

- Create a Docker service from the repository using `server/Dockerfile` and the `server` directory as its build context/root directory.
- Set the API environment variables in the provider's secret manager, including `NODE_ENV=production`, Atlas `MONGO_URI`, strong auth and PII secrets, exact `CORS_ORIGIN`, `COOKIE_SECURE=true`, and the platform-appropriate `TRUST_PROXY`.
- Configure the readiness/health path as `/api/health`, the internal port as `5000`, and graceful termination/health-check grace period. Keep at least one production instance; schedule/worker multiplicity must not run duplicate cron jobs without coordination.
- Bind an HTTPS custom API domain and configure Twilio's exact webhook URL if inbound SMS is enabled.

### Vercel or Netlify web

- Import the repository with `client` as the root/base directory, `npm ci` as install, and `npm run build` as build; publish `client/dist`.
- Set `VITE_API_BASE_URL=https://api.example.org/api` and, optionally, `VITE_SENTRY_DSN` in the production build environment. Redeploy whenever these build variables change.
- Configure SPA fallback rewrites to `/index.html`, but do not rewrite `/api/*` to the SPA. Set server `CORS_ORIGIN` to the exact `https://` frontend origin. Use frontend and API custom domains under the same site to preserve strict refresh-cookie behavior.
- Keep TLS, API health checks, Atlas IP access, and provider webhook configuration enabled. For Vercel/Netlify host mappings, set up DNS/TLS in their dashboard rather than using the EC2 Certbot steps.

## 7. CI/CD and release process

[.github/workflows/ci.yml](../.github/workflows/ci.yml) runs backend/frontend lint and tests, coverage thresholds, Playwright E2E, production client build, and translation checks. On a successful push to `main` (or manual workflow dispatch), it builds and publishes immutable SHA-tagged API/client images to GHCR. The `latest` tag is convenience only; deploy and rollback by SHA.

To enable automatic EC2 deployment, configure repository variable `DEPLOY_TARGET=ec2`, `DEPLOY_PATH`, and `PUBLIC_BASE_URL`; configure secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, and `DEPLOY_KNOWN_HOSTS`. The host must already have Docker, the production Compose file, `.env.production`, TLS Nginx/Certbot, and GHCR pull access. The workflow deploys only after unit and browser E2E jobs pass, pulls the pinned image tag, restarts Compose, then calls the public `/api/health` endpoint.

Restrict who can modify workflow files and production environments. Use protected `main`, required reviews/status checks, least-privilege tokens, and GitHub environments with approval gates for production. For Render/Railway/Vercel/Netlify, connect their Git integration to deploy only the protected production branch after checks, or add a reviewed provider-specific deploy hook; never expose provider credentials to pull-request builds.

## 8. Process restart, logging, monitoring, and uptime

- Compose uses `restart: unless-stopped`; Docker restarts containers after process or host restart. Confirm host Docker starts at boot. On managed platforms, enable restart-on-failure/always and health checks. Avoid running PM2 inside the Docker container; use PM2 only for a non-container Node deployment and configure its startup service.
- API request logs use Pino JSON in stdout with request ID, HTTP method, path (without query string), status, and duration. Authorization/cookie headers, response cookies, passwords, hashes, and emergency contacts are redacted. Do not add request bodies or medical values to logs. Platform log retention and access should be restricted and time-limited.
- Set `SENTRY_DSN` for server errors and `VITE_SENTRY_DSN` at client build time for browser errors. Configure Sentry environment/release, alert routing, retention, and data scrubbing; `sendDefaultPii` is disabled. Confirm no health information, phone numbers, tokens, or request bodies are sent in error context.
- Configure an external uptime monitor to GET `https://care.example.org/api/health` every 1–5 minutes and notify the on-call channel on failure. The endpoint returns app status, timestamp, and process uptime; it is a liveness check, not a deep Atlas dependency check. Alert separately on container health, Atlas availability/backup failures, elevated 5xx/latency, disk usage, and certificate expiry.
- Run the smoke checks after every deploy: login, one synthetic reading and alert, doctor RBAC, refresh cookie, report export, language toggle, and offline queue/reconnect. Do not test SOS in a way that contacts real responders.

## 9. Rollback

1. Identify the last known-good full commit SHA and confirm its images still exist in GHCR. Pause further deployments and record the current release tag.
2. Redeploy the previous images without rebuilding:

   ```sh
   export IMAGE_TAG=<last-known-good-full-git-sha>
   docker compose -f docker-compose.production.yml pull
   docker compose -f docker-compose.production.yml up -d --remove-orphans
   docker compose -f docker-compose.production.yml ps
   curl --fail https://care.example.org/api/health
   ```

   The `SERVER_IMAGE` and `CLIENT_IMAGE` values remain those configured for the deployment.

3. Inspect logs and repeat smoke checks. If rollback requires a data restore, stop writes, restore the latest verified Atlas backup to a separate cluster first, verify it, then perform a controlled connection-string cutover. Never blindly restore over production or assume application rollback reverses database schema/data changes.
4. Revert the offending commit or disable the automatic deploy, document the incident, and redeploy a corrected SHA through the normal test-and-approval path. Keep the previous image tags until the release has passed the agreed observation period.

Schema/data changes should be backward-compatible across at least one previous release (expand/migrate/contract); test down-compatibility before release. Keep the last stable image and database backup independent from the deployment host.
