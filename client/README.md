# Chronic Disease Remote Monitoring — Client

React + Vite client for the Chronic Disease Remote Monitoring application.

## Requirements

- Node.js 20.19+ (or 22.12+), npm 10+
- Backend API available at the configured `VITE_API_BASE_URL`

## Setup

From the repository root:

```powershell
cd client
npm install
Copy-Item .env.example .env
npm run dev
```

The development server prints its local URL, normally `http://localhost:5173`.

### Environment

Set `VITE_API_BASE_URL` in `client/.env`:

```dotenv
VITE_API_BASE_URL=http://localhost:5000/api
```

Vite exposes `VITE_*` variables to browser code. Never put secrets, database credentials, or provider keys in this file.

## Installed dependencies

```powershell
npm install react-router-dom@^6 axios react-hook-form recharts react-i18next i18next dexie vite-plugin-pwa react-hot-toast lucide-react date-fns
npm install --save-dev tailwindcss@^4.3 @tailwindcss/vite@^4.3
```

A fresh checkout only needs `npm install` because versions are recorded in `package-lock.json`.

## Scripts

```powershell
npm run dev
npm run lint
npm run build
npm run preview
```

## Scaffold notes

- Access tokens are held in memory. The refresh token is expected in a secure, HttpOnly cookie managed by the API.
- `api/client.js` uses a single-flight refresh request so parallel requests receiving `401` wait for the same refresh and retry once.
- `AuthContext` restores a session at startup and exposes login, registration, and logout methods.
- `ProtectedRoute` and `RoleRoute` are client navigation guards; the API must independently enforce authorization.
- The PWA currently precaches the app shell only. Health data is not placed in service-worker runtime caches by default.
- Offline IndexedDB tables are defined as a starting point; sync behavior is not yet implemented.
- English/Telugu UI strings in this scaffold are starter translations and require complete clinical translation review before deployment.
- `npm audit --omit=dev` reports two moderate React Router v6 advisories. The available fix moves to v7, which is outside this v6 scaffold; login return paths are restricted to safe internal routes. Reassess and upgrade React Router before production deployment.
