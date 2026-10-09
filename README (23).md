# Chronic Disease Remote Monitoring (MERN) — Build Guide & AI Prompts

A full-stack MERN application for remotely monitoring patients with chronic diseases (diabetes, hypertension, heart disease), designed for **rural India (Telugu + English)** with **offline-first** support, **SMS fallback**, **Community Health Workers (CHW)**, **SOS**, and **emergency drone dispatch** to village landing points.

> **How to use this file:** Work phase by phase. Copy each **PROMPT** into GitHub Copilot Chat / Cursor / Claude / ChatGPT. Run and test the result before moving to the next phase. Commit after every phase (`git commit -m "phase-N done"`).

---

## 0. Global Context Prompt (paste FIRST in every new AI session)

```
You are a senior MERN stack engineer. I am building "Chronic Disease Remote Monitoring",
a full-stack app. Stack: React (Vite) + React Router + Axios + React Hook Form + Tailwind CSS +
Recharts + react-i18next (Telugu/English) + Workbox PWA + IndexedDB (Dexie);
Node.js + Express + Mongoose + JWT + bcrypt + Helmet + express-rate-limit + Zod/Joi;
MongoDB. Roles: patient, doctor, chw (community health worker), admin.
Rules: clean folder structure, async/await, centralized error handling, input validation,
environment variables for secrets, JSDoc comments on non-trivial functions, no hardcoded
secrets, mobile-first UI, low-bandwidth friendly. Always show file paths before each code block.
Never skip files; give complete working code.
```

---

## 1. Project Overview

| Item | Detail |
|---|---|
| Goal | Let patients log vitals at home/village, alert doctors early, and trigger emergency response |
| Users | Patient, Doctor, CHW, Admin |
| Diseases (v1) | Diabetes, Hypertension, Cardiac |
| Languages | English, Telugu (తెలుగు) |
| Connectivity | Offline-first PWA + SMS gateway fallback |
| Emergency | SOS → alert doctor/CHW → nearest health centre → drone dispatch to village drop point |

### Core Features
Authentication & RBAC · Patient management · Health readings (BP, sugar, heart rate, weight, SpO2) · Patient & doctor dashboards · Health charts · Rule-based alerts · SOS · Offline storage & auto sync · Telugu/English · CHW module · Notifications · Appointments · Reports (PDF/CSV) · Security · Testing · Deployment · Drone dispatch & landing points · Nearest health centre · SMS/offline mode.

---

## 2. Requirements

### 2.1 Functional
1. Register/login with role; JWT access + refresh tokens.
2. Patient profile: demographics, village, disease, emergency contact, GPS, assigned doctor/CHW.
3. Log readings (manual, or CHW enters on behalf of patient).
4. Auto-classify readings (normal / warning / critical) and create alerts.
5. Doctor sees assigned patients, risk-sorted, adds notes/prescriptions.
6. Patient sees own trends, medications, appointments.
7. SOS button creates emergency incident with location.
8. Nearest health centre lookup (geospatial query).
9. Drone dispatch request to a registered village landing/drop point.
10. Offline: save readings/SOS locally, sync automatically when online.
11. SMS: send readings by formatted SMS; receive alert SMS.
12. In-app + SMS + push notifications; appointment reminders.
13. Reports: patient summary PDF, CSV export.
14. Language toggle Telugu/English across the entire UI.

### 2.2 Non-Functional
Mobile-first · works on 2G · page load < 3s · HTTPS · audit logs · 80%+ test coverage on critical modules · accessible (large fonts, icons, voice-friendly).

### 2.3 Default Clinical Thresholds (configurable by admin; doctor must validate)
| Metric | Normal | Warning | Critical |
|---|---|---|---|
| Systolic BP | 90–129 | 130–179 | ≥180 or <80 |
| Diastolic BP | 60–84 | 85–119 | ≥120 or <50 |
| Fasting sugar (mg/dL) | 70–125 | 126–249 | ≥250 or <54 |
| Heart rate (bpm) | 60–100 | 101–129 / 50–59 | ≥130 or <45 |
| SpO2 (%) | ≥95 | 91–94 | ≤90 |

> ⚠️ These are illustrative defaults for a project/demo. Real deployment requires clinician-approved thresholds and regulatory review.

---

## 3. System Architecture

```
[PWA React App] <--HTTPS/JWT--> [Express API] <--> [MongoDB]
   | IndexedDB (offline queue)        |--> SMS Gateway (Twilio/MSG91)
   | Service Worker (sync)            |--> Push (FCM / web-push)
                                      |--> Drone Service (mock/REST adapter)
                                      |--> Cron (reminders, missed-reading checks)
```

## 4. Folder Structure

```
chronic-care/
├── client/
│   ├── public/ (manifest.json, icons, locales/en, locales/te)
│   └── src/
│       ├── api/ components/ context/ hooks/ pages/ routes/ i18n/ offline/ utils/
├── server/
│   ├── src/
│   │   ├── config/ controllers/ middleware/ models/ routes/ services/ jobs/ utils/ validators/
│   │   ├── app.js
│   │   └── server.js
│   └── tests/
├── docs/ (wireframes, api.md)
├── docker-compose.yml
└── README.md
```

## 5. Database Collections

`users, patients, doctors, chws, healthRecords, alerts, medications, appointments, notifications, notes, sosIncidents, healthCentres, landingPoints, droneMissions, smsLogs, auditLogs, syncLogs`

---

# PHASE-WISE PROMPTS

---

## Phase 1 — Requirements & Planning

**PROMPT 1.1**
```
Based on the context, generate a complete Software Requirements Specification for the
Chronic Disease Remote Monitoring app: user personas (patient, doctor, CHW, admin),
user stories with acceptance criteria, functional and non-functional requirements,
risk list, and an MVP vs Phase-2 scope split. Output as docs/SRS.md.
```

**PROMPT 1.2 — API & DB design**
```
Design the MongoDB schema (Mongoose-style field lists with types, indexes, refs) for all
collections: users, patients, doctors, chws, healthRecords, alerts, medications,
appointments, notifications, notes, sosIncidents, healthCentres, landingPoints,
droneMissions, smsLogs, auditLogs. Include 2dsphere indexes for geo fields.
Then list all REST endpoints grouped by module with method, path, role access,
request body and response. Output as docs/api.md.
```

---

## Phase 2 — UI Wireframes

**PROMPT 2.1**
```
Create low-fidelity wireframes as ASCII/Mermaid plus a component list for these screens
(mobile-first, large touch targets, icons + text, Telugu/English toggle in header):
1 Login/Register  2 Patient Home (latest vitals cards, big SOS button, next appointment)
3 Add Reading  4 Charts/History  5 Medications  6 Appointments  7 Nearby Health Centres
8 Doctor Dashboard (risk-sorted patient list, alert feed, filters)  9 Patient Detail (doctor)
10 CHW Home (village patient list, quick-add reading, offline badge, sync status)
11 SOS Status (timeline: alert sent → doctor notified → ambulance/drone dispatched)
12 Admin (users, thresholds, health centres, landing points, drone missions)
13 Reports. For each: purpose, elements, navigation, states (loading/empty/error/offline).
Output as docs/wireframes.md. Also propose a Tailwind color palette with accessible
contrast and green/amber/red status colors.
```

---

## Phase 3 — React Setup

**PROMPT 3.1**
```
Scaffold the client with Vite + React in /client. Install and configure: react-router-dom v6,
axios, react-hook-form, tailwindcss, recharts, react-i18next, i18next, dexie,
vite-plugin-pwa, react-hot-toast, lucide-react, date-fns.
Create the folder structure (api, components, context, hooks, pages, routes, i18n, offline, utils).
Provide: tailwind.config.js, index.css, main.jsx, App.jsx with routes,
an axios instance with base URL from env and interceptors (attach JWT, refresh on 401),
AuthContext skeleton, ProtectedRoute and RoleRoute components, a responsive Layout
with header (language toggle, online/offline indicator), and placeholder pages.
Give exact install commands and .env.example.
```

---

## Phase 4 — Node + Express Setup

**PROMPT 4.1**
```
Scaffold /server with Node + Express (ES modules). Install express, mongoose, dotenv, cors,
helmet, morgan, express-rate-limit, express-mongo-sanitize, hpp, bcryptjs, jsonwebtoken,
cookie-parser, zod, node-cron, nodemon, jest, supertest.
Create: src/app.js (middlewares, routes mount, 404 handler), src/server.js,
config/env.js, utils/ApiError.js, utils/asyncHandler.js, middleware/errorHandler.js,
a /api/health route, and package.json scripts. Include .env.example and .gitignore.
Use a consistent JSON response format { success, message, data }.
```

---

## Phase 5 — MongoDB Connection

**PROMPT 5.1**
```
Create config/db.js that connects to MongoDB with Mongoose (retry logic, event logging,
graceful shutdown). Support local MongoDB and MongoDB Atlas via MONGO_URI.
Add a docker-compose.yml with mongo + mongo-express for local dev.
Add a seed script (src/seed/seed.js) that creates: 1 admin, 2 doctors, 2 CHWs,
5 patients, 10 sample health centres around Andhra Pradesh with GeoJSON coordinates,
and 5 village landing points. Passwords hashed.
```

---

## Phase 6 — User Model

**PROMPT 6.1**
```
Create Mongoose models: User (name, phone [unique, primary login], email optional,
passwordHash, role enum [patient, doctor, chw, admin], language enum [en, te],
isActive, lastLogin, refreshTokens, fcmToken), Patient (user ref, age, gender, village,
mandal, district, location GeoJSON Point with 2dsphere index, conditions[], bloodGroup,
allergies, emergencyContacts[], assignedDoctor, assignedChw, nearestHealthCentre),
Doctor (user ref, specialization, registrationNo, hospital, availability),
Chw (user ref, assignedVillages[], employeeId).
Add timestamps, indexes, a pre-save bcrypt hook, comparePassword method,
and toJSON transform that removes sensitive fields.
```

---

## Phase 7 — Register / Login

**PROMPT 7.1**
```
Implement auth endpoints: POST /api/auth/register, /login, /refresh, /logout, /me,
and /change-password. Login by phone + password. Validate with Zod (Indian 10-digit phone).
Issue short-lived access token (15m) and refresh token (7d, httpOnly cookie, rotated and
stored hashed). Lock account after 5 failed attempts for 15 minutes. Only admin can create
doctor/chw/admin users; public registration creates patients only.
Include controllers, services, validators, routes and Jest + Supertest tests.
```

**PROMPT 7.2 — Frontend**
```
Build Login and Register pages in React using React Hook Form with validation messages
in English/Telugu via react-i18next. Large inputs, show/hide password, loading states,
error toasts. Implement AuthContext (login, logout, refresh, persisted user),
and redirect by role after login (patient → /patient, doctor → /doctor, chw → /chw, admin → /admin).
```

---

## Phase 8 — JWT Authentication

**PROMPT 8.1**
```
Create middleware/auth.js: protect (verify access token, load user, reject inactive),
and handle expired/invalid tokens with clear ApiError codes. Add token utilities
(signAccess, signRefresh, verify). Add axios interceptor logic on the client that
queues requests during refresh, retries once, and logs out on refresh failure.
Write tests for valid, expired, tampered, and missing tokens.
```

---

## Phase 9 — Role-Based Access Control

**PROMPT 9.1**
```
Implement middleware authorize(...roles) and ownership checks:
- patient: only own data
- doctor: only assigned patients
- chw: only patients in assigned villages
- admin: all
Create reusable helpers canAccessPatient(user, patientId). Apply to all patient and
reading routes. Add a client RoleRoute and a hook usePermissions(). Write a permissions
matrix table in docs/rbac.md and tests proving forbidden access returns 403.
```

---

## Phase 10 — Patient Management

**PROMPT 10.1**
```
Build patient module APIs: create/update patient profile, list patients (pagination,
search by name/phone/village, filter by condition/risk), get patient detail,
assign doctor/CHW (admin), deactivate. CHW can register a patient on behalf of a villager.
Auto-link nearest health centre using a $near geospatial query on registration.
Add audit logging for create/update. Build React pages: PatientList (table + cards on mobile),
PatientForm (React Hook Form, GPS capture button, village picker), PatientDetail.
```

---

## Phase 11 — Health Readings

**PROMPT 11.1 — Backend**
```
Create HealthRecord model (patient, type enum [bp, sugar, heartRate, weight, spo2, temperature],
values {systolic, diastolic, value, unit, sugarContext [fasting, postMeal, random]},
recordedAt, recordedBy, source enum [self, chw, sms, device], clientId (UUID for dedupe),
status enum [normal, warning, critical], notes). Add index (patient, recordedAt desc)
and unique sparse index on clientId.
Endpoints: POST /api/readings (single and bulk for sync), GET /api/readings/:patientId
(date range, type, pagination), DELETE (admin only). Create services/classifier.js that
classifies each reading from configurable thresholds and returns status; write unit tests
for edge values. On warning/critical, trigger the alert service.
```

**PROMPT 11.2 — Frontend**
```
Build AddReading page: tabs/cards for BP, sugar, heart rate, weight, SpO2 with big numeric
inputs, unit labels, date-time defaulting to now, instant feedback (green/amber/red)
using client-side thresholds, and success screen. Works offline (see Phase 18).
Build ReadingHistory list with filters and status chips.
```

---

## Phase 12 — Patient Dashboard

**PROMPT 12.1**
```
Build the Patient Dashboard: greeting in selected language, latest-vitals cards with
status colors and trend arrows, a persistent large red SOS button, today's medications
checklist, next appointment card, unread alerts/notifications badge, nearest health
centre card with distance and call button, and a sync status indicator.
Create GET /api/dashboard/patient aggregating this data in one call.
Design for 360px width, big text and icons for low-literacy users.
```

---

## Phase 13 — Doctor Dashboard

**PROMPT 13.1**
```
Build the Doctor Dashboard: summary tiles (total patients, critical now, missed readings
today, appointments today), patient table sorted by risk score, live alert feed,
filters by condition/village/status, and quick actions (call, add note, schedule appointment).
Create GET /api/dashboard/doctor with MongoDB aggregation computing latest status per
patient and a risk score (critical > warning > missed readings). Patient detail view for
doctors with charts, notes, medications (prescribe/edit), and timeline.
```

---

## Phase 14 — Health Charts

**PROMPT 14.1**
```
Using Recharts, build reusable components: BPChart (systolic/diastolic lines with normal-range
shaded band), SugarChart (line + reference lines), HeartRateChart, WeightChart, SpO2Chart.
Add range selector (7d, 30d, 90d), tooltips, responsive container, color-blind-safe colors,
an empty state, and a data table fallback for accessibility. Create backend endpoint
GET /api/readings/:patientId/series?type=&range= returning aggregated daily averages/min/max.
Add summary stats (average, highest, lowest, % in range).
```

---

## Phase 15 — Alerts

**PROMPT 15.1**
```
Create Alert model (patient, record ref, type [critical_reading, missed_reading, sos,
medication_missed], severity, message en/te, status [open, acknowledged, resolved],
acknowledgedBy, resolvedAt). Build services/alertService.js: create alert on warning/critical,
deduplicate within a time window, escalate if not acknowledged in X minutes
(doctor → CHW → admin), and fan out via notification service. Add node-cron jobs:
missed-reading detector (no reading in 24h), medication reminders.
Endpoints: list, acknowledge, resolve. Client: AlertsPage with filters and a realtime
badge (polling every 30s, or Socket.IO if you prefer).
```

---

## Phase 16 — SOS Emergency

**PROMPT 16.1**
```
Implement SOS: SosIncident model (patient, location GeoJSON, status [triggered, doctorNotified,
chwNotified, ambulanceRequested, droneRequested, resolved], timeline[], resolvedBy).
POST /api/sos (accepts GPS; if missing, fall back to patient's saved location).
On trigger: create critical alert, notify assigned doctor + CHW + emergency contacts via
push and SMS, find the 3 nearest health centres, and return them. Client: SOS button with
hold-for-2-seconds-to-confirm, countdown cancel, haptic feedback, full-screen status timeline,
one-tap call to emergency number 108, and offline behaviour: queue SOS locally AND
automatically open an SMS composer (sms: URI) with pre-filled text and coordinates.
```

---

## Phase 17 — Telugu + English (i18n)

**PROMPT 17.1**
```
Set up react-i18next with locales en and te in /client/public/locales. Translate all UI strings
(navigation, forms, validation, alerts, vital names, status labels, SOS messages, medication
instructions). Add a LanguageToggle persisted in localStorage and user profile. Use a Telugu-supporting
font (Noto Sans Telugu) with fallback. Localize numbers and dates. Add server-side
message templates in both languages for alerts and SMS. Add a script that detects
missing translation keys. Provide the full te.json for everything built so far.
```

---

## Phase 18 — Offline Storage & Auto Sync

**PROMPT 18.1**
```
Make the client an offline-first PWA: vite-plugin-pwa with manifest, icons, precache app shell,
runtime caching for GET APIs (stale-while-revalidate). Use Dexie (IndexedDB) tables:
pendingReadings, pendingSos, cachedPatients, cachedReadings, syncMeta.
Create offline/syncManager.js: when a reading/SOS/patient form is submitted offline, store it
with a UUID clientId and status "pending"; on 'online' event, app start, and via Background
Sync (with fallback timer), POST pending items in batches to /api/sync, retry with exponential
backoff, mark synced, resolve conflicts by server-timestamp + clientId dedupe.
Show a SyncStatus component (offline badge, pending count, last synced, manual sync button).
Backend: POST /api/sync accepting mixed batches, idempotent, returning per-item results.
Add tests for dedupe and partial failure.
```

---

## Phase 19 — Community Health Worker (CHW) Module

**PROMPT 19.1**
```
Build the CHW module: CHW home showing assigned villages and patients with today's pending
readings, a fast "Add reading for patient" flow (search/scan patient, enter vitals, submit,
works offline), village-wise visit planner with a checklist, ability to register new patients,
trigger SOS on behalf of a patient, mark home visits (with GPS + notes), and view alerts for
their villages. Backend: CHW-scoped endpoints with RBAC, visit log model (chw, patient,
date, notes, location), and weekly CHW performance summary endpoint (patients covered,
readings entered, alerts handled).
```

---

## Phase 20 — Nearest Health Centre

**PROMPT 20.1**
```
Create HealthCentre model (name, type [PHC, CHC, district hospital, private], address,
phone, services[], hasAmbulance, hasLandingPoint, location GeoJSON, 24x7 flag) with
2dsphere index. Endpoint GET /api/health-centres/nearest?lat=&lng=&limit=&type= using $geoNear
returning distance. Admin CRUD. Client: NearbyCentres page with list, distance, call,
open-in-maps link (geo: URI), and cached results for offline use.
```

---

## Phase 21 — Drone Dispatch & Village Landing / Drop Point

**PROMPT 21.1**
```
Implement an emergency-supplies drone dispatch module (design as a mockable integration;
real drone operations require DGCA/regulatory approval and are out of scope for the software).
Models: LandingPoint (village, name, location GeoJSON, surfaceType, obstructionsNotes,
contactPerson, phone, verifiedBy, verifiedAt, isActive, photos[]), DroneMission
(sosIncident ref, patient, origin healthCentre, landingPoint, payload [e.g. medicine, AED,
glucose kit], status [requested, approved, dispatched, enRoute, arrived, delivered, aborted],
eta, timeline[], requestedBy, approvedBy).
Flow: from an SOS or doctor action, call POST /api/drone/missions; the service selects the
nearest active landing point to the patient and nearest health centre with hasDrone,
computes distance/ETA, requires doctor/admin approval, and calls a DroneProvider adapter
interface (MockDroneProvider for dev, HttpDroneProvider for real APIs).
Send notifications to the village contact person via SMS: "Drone arriving at <point> in <n> min,
keep area clear". Admin UI: map of landing points (Leaflet + OpenStreetMap), mission list with
live status, and abort button. Include safety rules: weather check hook, no-fly flag per point.
```

**PROMPT 21.2 — Landing point management**
```
Build admin + CHW screens to add/verify landing points: capture GPS, upload photo (compressed),
checklist (open flat area min 10x10m, no wires/trees, away from crowd, contact person
available), verification status, and re-verification reminders every 6 months.
```

---

## Phase 22 — SMS / Offline Mode

**PROMPT 22.1**
```
Add an SMS integration module (Twilio or MSG91 behind a SmsProvider interface).
Outbound: alert SMS, appointment reminders, drone arrival notice, OTP — in the user's language
(Telugu uses Unicode encoding). Inbound webhook POST /api/sms/inbound to let patients without
smartphones submit readings using a simple format, e.g. "BP 140 90", "SUGAR 180 F", "HR 88",
"SOS". Parse (case-insensitive, tolerant), identify patient by sender phone, store reading with
source "sms", classify, reply with a confirmation + status in their language. Log all messages
in smsLogs, rate limit per number, and verify provider webhook signatures.
Write parser unit tests with malformed inputs.
```

---

## Phase 23 — Notifications

**PROMPT 23.1**
```



---

## Phase 24 — Appointments

**PROMPT 24.1**
```
Implement appointments: Appointment model (patient, doctor, scheduledAt, mode [video, phone,
in-person at health centre], reason, status [requested, confirmed, completed, cancelled,
no-show], notes). Doctor availability slots; prevent double-booking with a transaction or
unique index. Endpoints for request, confirm/reschedule/cancel, list by role.
Client: booking calendar with available slots, appointments list, doctor schedule view,
CHW can book on patient's behalf. Hook into notifications for reminders.
```

---

## Phase 25 — Medications & Doctor Notes

**PROMPT 25.1**
```
Add Medication model (patient, name, dose, frequency, timings, startDate, endDate,
prescribedBy, instructions en/te, active) and adherence log (taken/missed with timestamp).
Patient daily checklist with "taken" tap (offline capable), missed-dose detection job,
doctor prescribing UI, and Notes model for doctor/CHW clinical notes with visibility rules.
```

---

## Phase 26 — Reports

**PROMPT 26.1**
```
Generate reports: (1) Patient summary PDF (profile, 30-day vitals stats, charts as images,
alerts, medications, doctor notes) using pdfkit or puppeteer with Telugu font embedding;
(2) CSV export of readings; (3) Admin reports: patients per village, critical alerts per week,
CHW activity, SOS response times, drone missions. Endpoints with RBAC, date-range filters,
and a Reports page with preview + download + share.
```

---

## Phase 27 — Security

**PROMPT 27.1**
```
Harden the app: helmet with CSP, strict CORS allowlist, express-rate-limit (stricter on
auth and SMS endpoints), express-mongo-sanitize, hpp, xss sanitization, request size limits,
Zod validation on every route, secure httpOnly SameSite cookies, bcrypt cost 12, password policy,
account lockout, refresh-token rotation and reuse detection, audit logs for sensitive actions
(login, data view, export, role change), field-level encryption for sensitive PII (e.g. emergency
contacts) using AES-256-GCM, data retention policy, HTTPS redirect, dependency audit
script, and a security checklist in docs/security.md covering OWASP Top 10 and
health-data privacy (consent, minimal data, India DPDP Act considerations).
```

---

## Phase 28 — UI Polish

**PROMPT 28.1**
```
Polish the UI: consistent design system (buttons, inputs, cards, badges, modals, tables),
dark mode optional, skeleton loaders, empty/error states, form accessibility (labels, aria,
focus), large-text mode, icon-first navigation with bottom tab bar on mobile, voice hints
(optional: Web Speech API reading out the vital status in Telugu/English), and
Lighthouse score targets: Performance 85+, Accessibility 95+, PWA pass.
```

---

## Phase 29 — Testing

**PROMPT 29.1**
```
Create a testing suite:
Backend: Jest + Supertest + mongodb-memory-server — unit tests (classifier, SMS parser,
alert dedupe, RBAC helpers), integration tests (auth, readings, alerts, sync, SOS, drone mission
flow). Frontend: Vitest + React Testing Library (forms, ProtectedRoute, language toggle,
offline queue with fake-indexeddb). E2E: Playwright (register → login → add reading →
critical alert → doctor sees alert; offline add reading → reconnect → synced; SOS flow).
Add coverage thresholds, GitHub Actions workflow running lint + tests, and a manual test
checklist in docs/test-plan.md including low-network and Telugu UI cases.
```

---

## Phase 30 — Deployment

**PROMPT 30.1**
```
Prepare deployment: Dockerfiles for client (nginx) and server, docker-compose for
production, environment variable docs, MongoDB Atlas setup, deploy backend to Render/Railway/
AWS EC2 and frontend to Vercel/Netlify (or nginx on same server), HTTPS with Let's Encrypt,
CI/CD with GitHub Actions (test → build → deploy), PM2 or container restart policy,
structured logging (pino/winston), Sentry for error monitoring, uptime check on /api/health,
automated daily MongoDB backups, and a rollback procedure. Write docs/deployment.md.
```

---

## Phase 31 — Final Documentation

**PROMPT 31.1**
```
Generate the final README.md for the repo: overview, screenshots placeholders, features,
architecture diagram (Mermaid), tech stack, setup (client/server/.env), seed data and demo
logins, API summary linking docs/api.md, offline/PWA notes, SMS command reference (English/Telugu),
drone module disclaimer, testing, deployment, roadmap, contributing, license.
```

---

## Useful Debugging Prompts

```
"Here is my error and the file. Explain the root cause, then give the minimal fix."
"Review this file for security issues, performance problems and missing validation."
"Refactor this controller into controller + service + validator without changing behavior."
"Write tests for this function covering edge cases and failure modes."
"Convert all hardcoded strings in this component to i18n keys with en and te values."
```

## Suggested Build Order Summary

| # | Phase | Output |
|---|---|---|
| 1–2 | Requirements, wireframes | SRS, API docs, screens |
| 3–6 | React, Express, MongoDB, models | Running skeleton |
| 7–9 | Auth, JWT, RBAC | Secure login |
| 10–14 | Patients, readings, dashboards, charts | Core MVP |
| 15–16 | Alerts, SOS | Safety features |
| 17–18 | Telugu, offline sync | Rural readiness |
| 19–22 | CHW, health centres, drone, SMS | Field operations |
| 23–26 | Notifications, appointments, meds, reports | Care workflow |
| 27–31 | Security, UI, testing, deploy, docs | Production |

## Important Disclaimers
- This is a software project; clinical thresholds, alert logic and emergency workflows **must be reviewed by qualified medical professionals** before real-world use.
- Drone delivery requires aviation-authority approval (DGCA in India) and certified operators; the module here is an integration/simulation layer.
- Health data is sensitive: follow applicable privacy law (e.g., India's DPDP Act) and obtain patient consent.
