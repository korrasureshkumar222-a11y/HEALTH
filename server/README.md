# Chronic Disease Remote Monitoring — API

Node.js + Express API scaffold using ES modules, Mongoose, and MongoDB.

## Requirements

- Node.js 20.19+ and npm 10+
- Local MongoDB via Docker Compose or a configured MongoDB Atlas cluster

## Local setup

At the repository root, configure and start MongoDB and Mongo Express:

```powershell
Copy-Item .env.compose.example .env
# Edit .env and replace the example local-only passwords.
docker compose up -d
```

Configure the API:

```powershell
cd server
npm install
Copy-Item .env.example .env
# Set MONGO_URI and SEED_PASSWORD in server/.env.
npm run seed
npm run dev
```

The API connects to MongoDB before listening on `http://localhost:5000`. Check `GET /api/health`. Mongo Express is available at `http://localhost:8081` and both Compose services bind to localhost only.

## MongoDB URI

For the local Compose database, set `MONGO_URI` in `server/.env` to the root Compose credentials:

```dotenv
MONGO_URI=mongodb://chronic_local_admin:YOUR_LOCAL_PASSWORD@127.0.0.1:27017/chronic-care?authSource=admin
```

Use a URL-encoded password if it contains URI-reserved characters. For Atlas, set `MONGO_URI` to the Atlas connection string, configure Atlas network access and TLS, and keep credentials out of source control.

The connection helper reuses Mongoose's default client and pool behavior. It retries initial startup failures up to `DB_CONNECT_MAX_RETRIES` times with capped exponential backoff starting at `DB_RETRY_BASE_DELAY_MS`. Retry defaults are provisional startup-recovery choices; pool sizes and driver timeouts are deliberately not overridden without workload, deployment-instance, and server-capacity measurements. Monitor server/Atlas connection counts (`connections.current`, `connections.totalCreated`), operation latency, connection churn, and pool checkout/wait failures before tuning.

The process closes the HTTP listener before disconnecting MongoDB on `SIGINT`/`SIGTERM`. Mongoose continues managing reconnection after transient disconnects during normal operation.

## Development seed data

Set `SEED_PASSWORD` in `server/.env` to a local-only password of at least 12 characters, then run:

```powershell
npm run seed
```

The idempotent script creates one admin, two doctors, two CHWs, five patients, ten health-centre examples around Andhra Pradesh, and five village landing-point examples. Each seeded account uses the configured password; only its bcrypt hash is stored, and the password is never printed. Example phone numbers, people, coordinates, centres, and contacts are illustrative local-only data—do not use them to contact real services. Landing points are deliberately inactive and must be inspected and verified before any operational use.

## Environment

Configure `server/.env` using [`.env.example`](./.env.example):

```dotenv
NODE_ENV=development
PORT=5000
CORS_ORIGIN=http://localhost:5173
MONGO_URI=mongodb://127.0.0.1:27017/chronic-care
DB_CONNECT_MAX_RETRIES=5
DB_RETRY_BASE_DELAY_MS=1000
JWT_ACCESS_SECRET=replace-with-at-least-32-random-characters
JWT_REFRESH_SECRET=replace-with-a-different-32-character-secret
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=7d
COOKIE_SECURE=false
TRUST_PROXY=0
LOG_LEVEL=info
SEED_PASSWORD=replace-with-a-local-development-password
```

Use different randomly generated secrets in production, configure a strict allowed-origin list, and set `COOKIE_SECURE=true` behind HTTPS. Never commit `.env` files or put secrets in the client environment.

## Scripts

```powershell
npm run dev
npm start
npm run seed
npm test
npm run lint
```

## Current scope

- Helmet, CORS allow-list, JSON/body size limits, Mongo operator sanitization, HPP protection, cookie parsing, request IDs, request logging, and API rate limiting.
- Standard success/error response envelopes, 404 handling, and malformed JSON validation errors.
- Mongoose connection lifecycle logging, startup retry, and graceful HTTP/database shutdown.
- Phone/password patient registration, sign-in, access-token authentication, refresh rotation/reuse detection, logout, `/me`, and password change.
- Admin-only staff account creation; public registration cannot select a privileged role.
- Five failed sign-in attempts trigger a 15-minute account lock. These defaults can be changed with the auth environment settings.
- Development seed models/data, liveness endpoint at `GET /api/health`, and Jest + Supertest integration tests.

The health endpoint reports application liveness; MongoDB availability is required for server startup but is not currently included in the response payload. Configure `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` with distinct random values of at least 32 characters before using authentication. Refresh tokens are stored only as SHA-256 hashes (one current hash per session, replaced atomically at rotation) and delivered in HttpOnly, SameSite cookies; TLS is required for production.
