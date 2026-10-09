# MongoDB Schema and REST API

## Chronic Disease Remote Monitoring

| Document field | Value |
|---|---|
| Version | 1.0 |
| Status | Proposed API and persistence contract |
| Base path | `/api` |
| API format | JSON over HTTPS |
| Authentication | Short-lived JWT access token; rotated refresh token in secure HttpOnly cookie |

This document is a design baseline derived from the project build guide and [SRS](./SRS.md). It describes the API contract; implementation status is called out where relevant. Endpoints marked **Phase 2** are not required for the first MVP release.

## 1. Conventions

### 1.1 Common API behavior

- JSON requests use `Content-Type: application/json`, except multipart uploads and provider webhooks.
- Protected routes require `Authorization: Bearer <accessToken>`. The refresh token is sent only through the configured secure cookie.
- Successful responses use:

  ```json
  {
    "success": true,
    "message": "Request completed",
    "data": {}
  }
  ```

- Errors use a consistent shape and do not expose stack traces, credentials, tokens, or sensitive clinical details:

  ```json
  {
    "success": false,
    "message": "Request could not be completed",
    "error": {
      "code": "VALIDATION_ERROR",
      "details": [{ "field": "recordedAt", "message": "Must be a valid date" }]
    }
  }
  ```

- Common status codes: `200` read/update/action success, `201` resource created, `202` accepted for asynchronous processing, `204` successful no-content operation, `400` validation error, `401` unauthenticated, `403` unauthorized, `404` unavailable/not found, `409` conflict/idempotency conflict, `422` semantically invalid input, `429` rate limit, `500` unexpected server error, `503` unavailable dependency.
- Resource identifiers are MongoDB ObjectIds serialized as strings. Date-times are ISO 8601 UTC strings. Enumerations are case-sensitive.
- List routes accept `page` (default `1`) and `limit` (default `20`, maximum `100`) unless the route defines a different cursor contract. List response shape: `{ items: [], page, limit, total, hasMore }`.
- Filter/sort parameters must be allow-listed. Clients must not pass MongoDB query operators or raw sort expressions.
- The server determines the authenticated actor and role. Do not accept `role`, `recordedBy`, `createdBy`, or other trusted identity fields as client authority.
- Request/response field sets below are contract-level summaries. Sensitive fields and database internals must not be returned.

### 1.2 Role abbreviations

| Label | Meaning |
|---|---|
| `Public` | No access token; strictly limited to registration and login. |
| `Patient` | Authenticated patient; own data only. |
| `Doctor` | Authenticated doctor; patients assigned to that doctor only. |
| `CHW` | Authenticated community health worker; patients in assigned villages only. |
| `Admin` | Authenticated administrator; administrative operations. Clinical data access must be necessary, permissioned, and audited. |
| `Assigned care team` | Doctor and/or CHW with current access to the patient. |
| `Patient scope` | Patient themself, assigned doctor/CHW, or explicitly authorized admin. Server verifies scope for every patient-specific operation. |
| `Provider` | Verified external service callback, authenticated by provider signature/secret and network policy; not a user role. |

### 1.3 Data and authorization rules

1. Every patient-specific read, write, export, notification action, and bulk-sync item is checked against current patient scope on the server.
2. Patient self-registration creates only a patient user. Doctors, CHWs, and admins are created through an authorized provisioning process.
3. The client cannot set classification, approval, notification delivery, provider verification, audit actor, or server timestamps.
4. Do not place credentials, raw refresh tokens, or unnecessary health data in URLs, logs, or analytics.
5. Geospatial fields use GeoJSON `[longitude, latitude]` coordinate order and WGS84 degrees.
6. Optional fields omitted by a client remain unset; explicit `null` is allowed only where the endpoint documents clearing behavior.
7. All indexes listed below are proposed indexes. Validate query plans against expected production data before deployment; avoid duplicative indexes without evidence.

## 2. Mongoose-style schema definitions

### 2.1 Shared conventions

- Every schema uses `{ timestamps: true, versionKey: false }` unless noted. Mongoose creates `createdAt` and `updatedAt`.
- `ObjectId` means `Schema.Types.ObjectId`; all `ref` values name the model/collection.
- `Date` values are stored as BSON dates in UTC.
- String normalization (trim, case normalization where appropriate), enum constraints, and required fields should be enforced in schema and request validation.
- Use `.select(false)` for sensitive fields. `toJSON`/`toObject` transforms must remove secrets and internal fields.
- Personal and health data encryption at rest/field-level encryption is a deployment/security decision that must be implemented and key-managed separately; schema declarations alone do not provide encryption.

### 2.2 `users`

Authentication principal shared by all roles.

```js
{
  _id: ObjectId,
  name: { type: String, required: true, trim: true, maxlength: 120 },
  phone: { type: String, required: true, unique: true }, // normalized Indian E.164/10-digit policy
  email: { type: String, trim: true, lowercase: true, sparse: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ["patient", "doctor", "chw", "admin"], required: true },
  language: { type: String, enum: ["en", "te"], default: "en" },
  isActive: { type: Boolean, default: true },
  lastLogin: Date,
  failedLoginCount: { type: Number, default: 0, min: 0, select: false },
  lockedUntil: { type: Date, select: false },
  refreshTokens: [{
    tokenHash: { type: String, required: true, select: false },
    sessionId: { type: String, required: true },
    tokenId: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
    rotatedAt: Date,
    revokedAt: Date,
  }], // one current hash per session; raw refresh token is never persisted
  fcmToken: { type: String, select: false }, // Phase 2; consider separate device subscription model
  consent: {
    status: { type: String, enum: ["pending", "accepted", "withdrawn"], default: "pending" },
    policyVersion: String,
    acceptedAt: Date,
    withdrawnAt: Date
  },
  notificationPreferences: {
    inApp: { type: Boolean, default: true },
    push: { type: Boolean, default: false },
    sms: { type: Boolean, default: false },
    quietHours: { start: String, end: String, timezone: String }
  }
}
```

**Indexes**

- `{ phone: 1 }` unique.
- `{ email: 1 }` unique sparse if email uniqueness is a product rule; otherwise use a non-unique sparse index.
- `{ role: 1, isActive: 1 }`.
- TTL on `refreshTokens` is not directly suitable for array-element expiry. Remove expired/revoked token entries with application cleanup; enforce expiry during refresh validation.

**Rules:** Hash passwords with an approved adaptive password hash; never return `passwordHash`, refresh token hashes, failed-login counters, lock details, or push tokens. Keep role-specific details in their own collections.

### 2.3 `patients`

Patient-specific profile and care-team relationships. A profile created by a CHW
may remain unlinked until the villager completes signup with the same phone number.

```js
{
  _id: ObjectId,
  user: { type: ObjectId, ref: "User", unique: true, sparse: true }, // optional until account signup
  name: { type: String, trim: true }, // retained for pending CHW registrations
  phone: { type: String, trim: true }, // normalized Indian mobile number
  age: Number,
  gender: { type: String, enum: ["female", "male", "other", "prefer_not_to_say"] },
  village: { type: String, required: true, trim: true },
  mandal: { type: String, trim: true },
  district: { type: String, trim: true },
  location: { // optional; GeoJSON Point with [longitude, latitude]
    type: { type: String, enum: ["Point"], required: true },
    coordinates: { type: [Number], required: true } // [longitude, latitude]
  },
  conditions: [{ type: String, enum: ["diabetes", "hypertension", "cardiac", "other"] }],
  bloodGroup: { type: String, enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] },
  allergies: [{ name: { type: String, required: true }, notes: String }],
  emergencyContacts: [{
    name: { type: String, required: true },
    relationship: String,
    phone: { type: String, required: true },
    consentToContact: { type: Boolean, default: false }
  }],
  assignedDoctor: { type: ObjectId, ref: "Doctor" },
  assignedChw: { type: ObjectId, ref: "Chw" },
  nearestHealthCentre: { type: ObjectId, ref: "HealthCentre" },
  status: { type: String, enum: ["active", "inactive"], default: "active" },
  consent: {
    status: { type: String, enum: ["accepted", "withdrawn"], required: true },
    policyVersion: { type: String, required: true },
    acceptedAt: { type: Date, required: true },
    capturedBy: { type: ObjectId, ref: "User", required: true },
    method: { type: String, enum: ["self", "chw", "admin"], required: true }
  }
}
```

**Indexes**

- `{ user: 1 }` unique sparse; a profile created on behalf of a villager is initially unlinked.
- `{ phone: 1 }` unique sparse; supports later self-registration linking without allowing account takeover.
- `{ location: "2dsphere" }`.
- `{ assignedDoctor: 1, status: 1 }`, `{ assignedChw: 1, status: 1 }`.
- `{ district: 1, mandal: 1, village: 1, status: 1 }`.
- Do not index emergency-contact phone unless an authorized lookup use case requires it.

**Rules:** Validate coordinate ranges; location is optional and should be omitted rather than represented as invalid GeoJSON. Emergency contact access is sensitive and should be restricted.

### 2.4 `doctors`

```js
{
  _id: ObjectId,
  user: { type: ObjectId, ref: "User", required: true, unique: true },
  specialization: { type: String, required: true, trim: true },
  registrationNo: { type: String, required: true, trim: true },
  hospital: { type: String, trim: true },
  availability: [{
    dayOfWeek: { type: Number, min: 0, max: 6, required: true },
    startTime: { type: String, required: true }, // local HH:mm, 30-minute boundaries
    endTime: { type: String, required: true },
    timezone: { type: String, default: "Asia/Kolkata" }
  }],
  isVerified: { type: Boolean, default: false },
  verifiedBy: { type: ObjectId, ref: "User" },
  verifiedAt: Date
}
```

**Indexes:** `{ user: 1 }` unique; `{ registrationNo: 1 }` unique (or unique compound with issuing authority if registration numbers are not globally unique).

### 2.5 `chws`

```js
{
  _id: ObjectId,
  user: { type: ObjectId, ref: "User", required: true, unique: true },
  assignedVillages: [{
    village: { type: String, required: true, trim: true },
    mandal: String,
    district: String
  }],
  employeeId: { type: String, required: true, unique: true, trim: true },
  isVerified: { type: Boolean, default: false },
  verifiedBy: { type: ObjectId, ref: "User" },
  verifiedAt: Date
}
```

**Indexes:** `{ user: 1 }` unique; `{ employeeId: 1 }` unique; multikey `{ "assignedVillages.district": 1, "assignedVillages.mandal": 1, "assignedVillages.village": 1 }`.

### 2.6 `healthRecords`

One row/document per measurement. Classification is server-calculated under a versioned ruleset.

```js
{
  _id: ObjectId,
  patient: { type: ObjectId, ref: "Patient", required: true },
  type: { type: String, enum: ["bp", "sugar", "heartRate", "weight", "spo2", "temperature"], required: true },
  values: {
    systolic: Number, // bp
    diastolic: Number, // bp
    value: Number, // scalar types
    unit: String,
    sugarContext: { type: String, enum: ["fasting", "postMeal", "random"] }
  },
  recordedAt: { type: Date, required: true },
  recordedBy: { type: ObjectId, ref: "User", required: true },
  source: { type: String, enum: ["self", "chw", "sms", "device"], required: true },
  clientId: { type: String, trim: true }, // globally unique UUID for offline idempotency
  status: { type: String, enum: ["normal", "warning", "critical", "unclassified"], required: true },
  classification: {
    rulesetVersion: String,
    classifiedAt: Date
  },
  notes: { type: String, maxlength: 1000 }
}
```

**Indexes**

- `{ patient: 1, recordedAt: -1, _id: -1 }`.
- `{ patient: 1, type: 1, recordedAt: -1 }`.
- `{ clientId: 1 }` unique sparse; client UUIDs are globally unique. Reuse for a different actor or patient returns `409 CLIENT_ID_CONFLICT`.
- `{ status: 1, recordedAt: -1 }` only if used by supported alert/dashboard queries.

**Validation:** `bp` requires systolic/diastolic and mmHg; `sugar` requires value/unit and context where clinically required; scalar types require a compatible unit. Validate physiological plausibility without silently modifying submitted values. Exact validation and classification rules require clinical approval.

### 2.7 `alerts`

```js
{
  _id: ObjectId,
  patient: { type: ObjectId, ref: "Patient", required: true },
  record: { type: ObjectId, ref: "HealthRecord" },
  sosIncident: { type: ObjectId, ref: "SosIncident" },
  type: { type: String, enum: ["critical_reading", "warning_reading", "missed_reading", "sos", "medication_missed"], required: true },
  severity: { type: String, enum: ["info", "warning", "critical"], required: true },
  message: {
    en: { type: String, required: true },
    te: { type: String, required: true }
  },
  status: { type: String, enum: ["open", "acknowledged", "resolved"], default: "open" },
  acknowledgedBy: { type: ObjectId, ref: "User" },
  acknowledgedAt: Date,
  acknowledgmentNote: { type: String, maxlength: 1000 },
  resolvedBy: { type: ObjectId, ref: "User" },
  resolvedAt: Date,
  resolutionNote: { type: String, maxlength: 1000 },
  dedupeKey: { type: String, required: true, unique: true },
  escalation: {
    level: { type: Number, default: 0, min: 0 },
    lastEscalatedAt: Date,
    nextEscalationAt: Date
  }
}
```

**Indexes:** `{ patient: 1, status: 1, createdAt: -1 }`; `{ severity: 1, status: 1, createdAt: -1 }`; `{ dedupeKey: 1 }` unique. Reading alerts deduplicate by patient, alert type, and a configurable time bucket; repeated requests for the same reading also return the existing active alert. Resolved alerts do not suppress new alerts.

The service notifies the assigned doctor first, then escalates to the assigned CHW and an active admin if an open alert remains unacknowledged. `ALERT_DEDUPE_WINDOW_MINUTES` defaults to 30 and `ALERT_ESCALATION_MINUTES` defaults to 15. Missed-reading alerts use a 24-hour dedupe window. In-app delivery creates a `delivered` notification record; push/SMS/email delivery is not configured by this MVP.

### 2.8 `medications` (implemented core; adherence Phase 2)

```js
{
  _id: ObjectId,
  patient: { type: ObjectId, ref: "Patient", required: true },
  name: { type: String, required: true, trim: true },
  dose: { type: String, required: true },
  frequency: { type: String, required: true },
  timings: [{ type: String, required: true }], // local HH:mm or approved schedule representation
  startDate: { type: Date, required: true },
  endDate: Date,
  prescribedBy: { type: ObjectId, ref: "Doctor", required: true },
  instructions: { en: String, te: String },
  active: { type: Boolean, default: true },
  adherence: [{
    scheduledAt: Date,
    status: { type: String, enum: ["taken", "missed"], required: true },
    recordedAt: { type: Date, required: true },
    recordedBy: { type: ObjectId, ref: "User" },
    clientId: String
  }]
}
```

**Indexes:** `{ patient: 1, active: 1, startDate: -1 }`; `{ prescribedBy: 1, createdAt: -1 }`; sparse unique idempotency index for adherence entries should use a separate adherence collection if independently indexed/deduplicated at scale.

### 2.9 `appointments` (implemented core)

```js
{
  _id: ObjectId,
  patient: { type: ObjectId, ref: "Patient", required: true },
  doctor: { type: ObjectId, ref: "Doctor", required: true },
  scheduledAt: { type: Date, required: true },
  durationMinutes: { type: Number, enum: [30, 60], default: 30 },
  mode: { type: String, enum: ["video", "phone", "inPerson"], required: true },
  healthCentre: { type: ObjectId, ref: "HealthCentre" },
  reason: { type: String, maxlength: 1000 },
  status: { type: String, enum: ["requested", "confirmed", "completed", "cancelled", "no-show"], default: "requested" },
  notes: { type: String, maxlength: 2000 },
  createdBy: { type: ObjectId, ref: "User", required: true },
  reservedSlotKeys: [String], // unique 30-minute UTC bucket keys while requested/confirmed
  isActiveReservation: { type: Boolean, default: true },
  statusHistory: [{
    status: String,
    changedBy: { type: ObjectId, ref: "User" },
    changedAt: Date,
    note: String
  }]
}
```

The unique partial multikey index `{ doctor: 1, reservedSlotKeys: 1 }` where `isActiveReservation: true` atomically prevents concurrent overlapping reservations. Appointment starts align to the doctor's 30-minute availability grid; durations are 30 or 60 minutes. Cancellation releases reservation keys. Doctor availability is stored as weekly local-time windows (`dayOfWeek`, `startTime`, `endTime`, IANA `timezone`).

**Indexes:** `{ patient: 1, scheduledAt: 1 }`; `{ doctor: 1, scheduledAt: 1, status: 1 }`; unique partial multikey `{ doctor: 1, reservedSlotKeys: 1 }` where `isActiveReservation: true`, enforcing atomic 30-minute slot reservations across requested and confirmed appointments.

### 2.10 `notifications`

```js
{
  _id: ObjectId,
  user: { type: ObjectId, ref: "User", required: true },
  patient: { type: ObjectId, ref: "Patient" },
  type: { type: String, enum: ["critical_alert", "warning_alert", "sos_update", "appointment_reminder", "medication_reminder", "prescription", "drone_update", "system"], required: true },
  title: { en: String, te: String },
  body: { en: String, te: String },
  channel: { type: String, enum: ["inApp", "push", "sms", "email"], required: true },
  status: { type: String, enum: ["queued", "sent", "delivered", "failed", "read"], default: "queued" },
  readAt: Date,
  providerMessageId: String,
  failureCode: String,
  data: { type: Map, of: Schema.Types.Mixed }, // allow-listed non-sensitive navigation metadata only
  relatedResource: {
    kind: { type: String, enum: ["Alert", "SosIncident", "Appointment", "Medication", "DroneMission"] },
    id: ObjectId
  },
  dedupeKey: { type: String, unique: true, sparse: true }
}
```

**Indexes:** `{ user: 1, status: 1, createdAt: -1 }`; `{ user: 1, createdAt: -1 }`; `{ providerMessageId: 1 }` sparse where provider callbacks need lookup.

### 2.11 `notes`

```js
{
  _id: ObjectId,
  patient: { type: ObjectId, ref: "Patient", required: true },
  author: { type: ObjectId, ref: "User", required: true },
  authorRole: { type: String, enum: ["doctor", "chw"], required: true },
  kind: { type: String, enum: ["clinical", "visit"], required: true },
  body: { type: String, required: true, maxlength: 5000 },
  visibility: { type: String, enum: ["careTeam", "doctorOnly"], default: "careTeam" },
  relatedRecord: { type: ObjectId, ref: "HealthRecord" },
  relatedSosIncident: { type: ObjectId, ref: "SosIncident" },
  visitLocation: {
    type: { type: String, enum: ["Point"] },
    coordinates: [Number]
  },
  editedAt: Date,
  editReason: String
}
```

**Indexes:** `{ patient: 1, createdAt: -1 }`; `{ author: 1, createdAt: -1 }`. Notes should be append-only or edits should preserve an auditable revision history; visibility must be enforced on reads.

### 2.12 `sosIncidents`

```js
{
  _id: ObjectId,
  patient: { type: ObjectId, ref: "Patient", required: true },
  clientId: { type: String, unique: true, sparse: true }, // UUID idempotency key
  location: {
    type: { type: String, enum: ["Point"], required: true },
    coordinates: {
      type: [Number], // [longitude, latitude], WGS84
      required: true,
      validate: coordinates => coordinates.length === 2
        && coordinates[0] >= -180 && coordinates[0] <= 180
        && coordinates[1] >= -90 && coordinates[1] <= 90
    }
  },
  status: {
    type: String,
    enum: ["triggered", "doctorNotified", "chwNotified", "ambulanceRequested", "droneRequested", "resolved"],
    default: "triggered",
    required: true
  },
  timeline: [{
    status: { type: String, enum: ["triggered", "doctorNotified", "chwNotified", "ambulanceRequested", "droneRequested", "resolved"], required: true },
    at: { type: Date, required: true },
    actor: { type: ObjectId, ref: "User" },
    note: { type: String, maxlength: 1000 }
  }],
  resolvedBy: { type: ObjectId, ref: "User" },
  resolvedAt: Date
}
```

**Indexes:** `{ patient: 1, createdAt: -1 }`; `{ status: 1, createdAt: -1 }`; `{ location: "2dsphere" }`; `{ clientId: 1 }` unique sparse.

**Rules:** Timeline updates append events rather than overwrite history (maximum 100 events). `clientId` makes retries idempotent. A status is not “dispatched” merely because the application submitted a request.

### 2.13 `healthCentres`

```js
{
  _id: ObjectId,
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ["PHC", "CHC", "districtHospital", "private"], required: true },
  address: { type: String, required: true },
  phone: String,
  services: [String],
  hasAmbulance: { type: Boolean, default: false },
  hasLandingPoint: { type: Boolean, default: false },
  hasDrone: { type: Boolean, default: false },
  is24x7: { type: Boolean, default: false },
  location: {
    type: { type: String, enum: ["Point"], required: true },
    coordinates: { type: [Number], required: true }
  },
  isActive: { type: Boolean, default: true },
  verifiedAt: Date,
  verifiedBy: { type: ObjectId, ref: "User" },
  source: String
}
```

**Indexes:** `{ location: "2dsphere" }`; `{ type: 1, isActive: 1 }`; `{ isActive: 1, hasDrone: 1 }`.

### 2.14 `landingPoints`

```js
{
  _id: ObjectId,
  village: { type: String, required: true, trim: true },
  mandal: { type: String, trim: true },
  district: { type: String, trim: true },
  name: { type: String, required: true, trim: true },
  location: {
    type: { type: String, enum: ["Point"], required: true },
    coordinates: { type: [Number], required: true }
  },
  surfaceType: { type: String, enum: ["open_ground", "field", "other"], required: true },
  obstructionsNotes: { type: String, maxlength: 2000 },
  contactPerson: { type: String, required: true },
  phone: { type: String, required: true },
  submittedBy: { type: ObjectId, ref: "User" },
  submittedBy: { type: ObjectId, ref: "User" },
  photos: [String], // at most 2 JPEG data URLs <= 80 KB each, or legacy HTTPS URLs
  checklist: {
    clearArea: { type: Boolean, default: false },
    minimumAreaConfirmed: { type: Boolean, default: false }, // confirms >= 10x10m
    noOverheadWiresOrTrees: { type: Boolean, default: false },
    awayFromCrowds: { type: Boolean, default: false },
    contactAvailable: { type: Boolean, default: false }
  },
  verifiedBy: { type: ObjectId, ref: "User" },
  verifiedAt: Date,
  reverifyAt: Date,
  isActive: { type: Boolean, default: false },
  noFly: { type: Boolean, default: false },
  noFlyReason: String
}
```

**Indexes:** `{ location: "2dsphere" }`; `{ village: 1, isActive: 1 }`; `{ isActive: 1, noFly: 1, verifiedAt: 1 }`.

New points are inactive. Verification requires every site-safety checklist item; verification sets `verifiedBy`, `verifiedAt`, and `reverifyAt` (183 days). The browser resizes and compresses uploaded photos to JPEG, with a maximum of two photos at 80 KB each; the bounded image data is embedded in the landing-point record. Activating an unverified/incomplete point or a no-fly point is rejected. Marking no-fly deactivates the point. Checklist, location, surface, notes, or photo edits invalidate verification and deactivate the point.

### 2.15 `droneMissions` (mock/integration workflow)

```js
{
  _id: ObjectId,
  sosIncident: { type: ObjectId, ref: "SosIncident" },
  patient: { type: ObjectId, ref: "Patient", required: true },
  originHealthCentre: { type: ObjectId, ref: "HealthCentre", required: true },
  landingPoint: { type: ObjectId, ref: "LandingPoint", required: true },
  payload: [{ type: String, enum: ["medicine", "AED", "glucoseKit", "firstAid", "other"] }],
  status: {
    type: String,
    enum: ["requested", "approved", "dispatched", "enRoute", "arrived", "delivered", "aborted"],
    default: "requested"
  },
  eta: { type: Date, required: true },
  distanceKm: { type: Number, required: true },
  provider: { type: String, enum: ["mock", "http"], required: true },
  providerMissionId: String,
  requestedBy: { type: ObjectId, ref: "User", required: true },
  approvedBy: { type: ObjectId, ref: "User" },
  timeline: [{
    status: String,
    at: Date,
    actor: { type: ObjectId, ref: "User" },
    note: String
  }],
  weatherCheck: { checkedAt: Date, safe: Boolean, provider: String, reason: String }
}
```

**Indexes:** `{ patient: 1, createdAt: -1 }`; `{ sosIncident: 1 }` unique sparse; `{ status: 1, createdAt: -1 }`; `{ landingPoint: 1, status: 1 }`.

**Rules:** A mission request is not a confirmed flight. Require approval and policy checks before invoking any provider. Real aviation operations and delivery are outside the software guarantee and require separate legal, safety, and operational approvals.

The development weather adapter is simulated and only supports the mock drone provider. HTTP drone-provider mode fails closed unless a live weather adapter is configured in the application and returns a named provider result; this repository does not include a live weather-service integration.

### 2.16 `smsLogs` (Phase 2)

```js
{
  _id: ObjectId,
  direction: { type: String, enum: ["inbound", "outbound"], required: true },
  provider: { type: String, required: true },
  providerMessageId: String,
  fromPhoneHash: String, // avoid storing raw sender number unless operationally required
  toPhoneHash: String,
  droneMission: { type: ObjectId, ref: "DroneMission" }, // present for drone-arrival messages
  patient: { type: ObjectId, ref: "Patient" },
  user: { type: ObjectId, ref: "User" },
  messageType: { type: String, enum: ["reading", "sos", "alert", "reminder", "drone_update", "otp", "unknown"] },
  bodyRedacted: String,
  purpose: { type: String, enum: ["drone_arrival"] }, // additional message purposes are Phase 2
  parsedPayload: { type: Map, of: Schema.Types.Mixed }, // strictly allow-listed; no raw secrets
  signatureValid: Boolean,
  status: { type: String, enum: ["received", "accepted", "rejected", "queued", "sent", "delivered", "failed"], required: true },
  failureCode: String,
  receivedAt: Date,
  processedAt: Date
}
```

**Indexes:** `{ provider: 1, providerMessageId: 1 }` unique sparse; `{ patient: 1, createdAt: -1 }`; `{ status: 1, createdAt: -1 }`; `{ fromPhoneHash: 1, createdAt: -1 }`.

Drone-arrival SMS attempts are implemented. The recipient is HMAC-hashed before persistence; only a redacted/template body, provider result, and failure code are retained. Mock delivery is recorded as `simulated`, not as a real SMS send.

### 2.17 `auditLogs`

Append-only security/administrative audit events.

```js
{
  _id: ObjectId,
  actor: { type: ObjectId, ref: "User", required: true },
  actorRole: { type: String, enum: ["patient", "doctor", "chw", "admin"], required: true },
  action: { type: String, enum: ["patient.create", "patient.update", "patient.assign", "patient.deactivate"], required: true },
  resourceType: { type: String, enum: ["Patient"], required: true },
  resourceId: { type: ObjectId, required: true },
  changedFields: [String] // field names only, never values or health data
}
```

**Indexes:** `{ actor: 1, createdAt: -1 }`; `{ resourceType: 1, resourceId: 1, createdAt: -1 }`.

**Rules:** Application users cannot update or delete audit events. Define retention, tamper-resistance, access, and archive policy before production.

### 2.18 `syncLogs` (referenced by project architecture)

```js
{
  _id: ObjectId,
  user: { type: ObjectId, ref: "User", required: true },
  batchId: { type: String, required: true },
  itemType: { type: String, enum: ["healthRecord", "sosIncident"], required: true },
  clientId: { type: String, required: true },
  outcome: { type: String, enum: ["accepted", "duplicate", "rejected"], required: true },
  resourceId: ObjectId,
  errorCode: String,
  receivedAt: { type: Date, required: true, default: Date.now }
}
```

**Indexes:** `{ user: 1, batchId: 1 }`; `{ user: 1, itemType: 1, clientId: 1 }`; optionally TTL by approved operational retention. Avoid storing raw rejected request payloads.

## 3. REST endpoints

### 3.1 Authentication and account

| Method & path | Access | Request body / query | Success response (`data`) |
|---|---|---|---|
| `POST /auth/register` | Public | `{ name, phone, password, language?, village, mandal?, district?, age?, gender?, consent: { accepted:true, policyVersion } }` | `201 { user: { id, name, phone, role:"patient", language }, patient: { id } }`; public signup always creates a patient and does not issue a session. If an active, unlinked CHW-created profile exists for the phone, signup links that profile rather than creating a duplicate. |
| `POST /auth/login` | Public | `{ phone, password }` | `200 { user: { id, name, role, language }, accessToken, accessTokenExpiresIn, refreshTokenExpiresAt }`; refresh token set as HttpOnly cookie. Five failed password attempts lock the account for 15 minutes. |
| `POST /auth/refresh` | Refresh cookie | No body | `200 { user: { id, role }, accessToken }`; rotates cookie and revokes/replaces prior refresh token. |
| `POST /auth/logout` | Authenticated | No body | `200 { signedOut:true }`; revokes current refresh token and clears cookie. |
| `GET /auth/me` | Authenticated | — | `200 { user, profile }`; excludes all credential/token/provider secrets. |
| `PATCH /auth/language` | Authenticated | `{ language: "en" | "te" }` | `200 { user }`; saves the current user’s language preference. SOS SMS templates use the patient profile’s language. |
| `POST /auth/change-password` | Authenticated | `{ currentPassword, newPassword }` | `200 { passwordChanged:true }`; revokes all refresh sessions and clears current cookie. |
| `POST /auth/admin/users` | Admin | `{ name, phone, email?, password, role:"doctor"\|"chw"\|"admin", profile }` (profile required for doctor/CHW) | `201 { user, profile }`; privileged role must not be caller-selected by non-admin. |
| `PATCH /admin/users/:userId/status` | Admin | `{ isActive, reason? }` | `200 { user: { id, isActive } }`; revokes sessions on deactivation. |

### 3.2 Patients and assignments

| Method & path | Access | Request body / query | Success response (`data`) |
|---|---|---|---|
| `GET /patients` | Doctor, CHW, Admin | Query: `page?, limit?, search?/q?, village?, mandal?, district?, condition?, status?, risk?` | `200 { items:[patientSummary], page, limit, total, hasMore }`; caller scope is applied in the database. Search covers account/pending-profile name, phone and village; `risk` is the newest reading status. |
| `POST /patients` | Admin; CHW may register in assigned village | `{ name, phone, age?, gender?, village, mandal?, district?, location?:GeoJSONPoint, conditions?, bloodGroup?, allergies?, emergencyContacts?, consent:{ accepted:true, policyVersion } }` | `201 { patient }`; CHW-created profile may be unlinked from an account. Nearest active health centre is selected by `$near` when location is supplied. Duplicate phone/profile conflicts return `409`. |
| `GET /patients/me` | Patient | — | `200 { patient }`; resolves the authenticated patient's own profile without requiring a client-known profile ID. |
| `GET /patients/:patientId` | Patient scope | — | `200 { patient }`; account/contact, care team, nearest centre, and latest reading are included where present. |
| `PATCH /patients/:patientId` | Patient for approved self-edit fields; assigned care team for role-approved fields; Admin | Allow-listed subset of patient profile fields | `200 { patient }`; assignment fields cannot be changed here. Create/update is audited by changed field names, not health data values. |
| `PATCH /patients/:patientId/assignments` | Admin | `{ doctorId?:ObjectId\|null, chwId?:ObjectId\|null }` | `200 { patient }`; validates active staff profiles and audits changed assignments. |
| `POST /patients/:patientId/deactivate` | Admin | No body | `200 { patient:{ id, status:"inactive" } }`; disables linked account and revokes refresh sessions; audited. |
| `GET /patients/assignables` | Admin | — | `200 { doctors:[...], chws:[...] }`; active doctor/CHW profiles are listed with account name/phone for assignment controls. |

Patient identifiers are not authorization. Admin-only list results containing patient data should be limited to an operational need and audit policy. CHW on-behalf registration requires recorded patient consent and creates a profile without login credentials; the patient can later complete public signup with the same phone to link the account. It must not claim an already-existing account based on phone number alone. Inactive profiles are excluded from doctor/CHW access and default lists; only admins may request `status=inactive`.

### 3.3 Health readings and synchronization

| Method & path | Access | Request body / query | Success response (`data`) |
|---|---|---|---|
| `POST /readings` | Patient self or CHW for a patient in assigned village | `{ patientId?, type, values, recordedAt, clientId:UUID, notes? }`; patient may omit `patientId` | `201 { record, alert?, duplicate:false }` or `200` for an idempotent replay. Actor, source, status, and ruleset/version are server-derived. |
| `POST /readings/bulk` | Patient/CHW; each item independently validated and scope-checked | `{ batchId?:UUID, items:[{ patientId?, type, values, recordedAt, clientId:UUID, notes? }] }` (1–100 items) | `200 { results:[{ clientId, outcome:"accepted"\|"duplicate"\|"rejected", recordId?, status?, alertId?, error? }], serverTime }`; partial success allowed. |
| `GET /readings/:patientId` | Patient scope | Query: `from?, to?, type?, status?, page?, limit?` | `200 { items:[record], page, limit, total, hasMore }`; sorted by `recordedAt` descending then `_id` descending. |
| `GET /readings/:patientId/series` | Patient scope | Query: `type` (`bp`, `sugar`, `heartRate`, `weight`, `spo2`, `temperature`), `range` (`7d`, `30d`, `90d`; defaults to `30d`) | `200 { type, range, from, to, points:[{ at, count, value?:{ average, min, max }, systolic?:{ average, min, max }, diastolic?:{ average, min, max } }], summary:{ totalReadings, classifiedReadings, percentInRange, value?/systolic?/diastolic?:{ average, highest, lowest } } }`; daily buckets use UTC, range includes today, and the percentage uses server-classified readings only (`normal` over `normal`/`warning`/`critical`). |
| `GET /readings/:patientId/:recordId` | Patient scope | — | `200 { record }`. |
| `DELETE /readings/:patientId/:recordId` | Admin only; audited and reason required | `{ reason }` | `204`; deletes the record and linked alert, retaining a reason-only audit event. Production retention policy may replace hard deletion with a correction/void workflow. |
| `POST /sync` | Authenticated patient, doctor, CHW, or admin; each item is separately authorized for its resource | `{ items:[{ clientId:UUID, type:"reading"\|"sos"\|"patient.create"\|"patient.update", clientTimestamp?:ISODate, payload }] }` (1–100 items) | **Implemented.** `200 { results:[{ clientId, type, outcome:"accepted"\|"duplicate"\|"rejected"\|"conflict"\|"retry", recordId?, status?, serverTimestamp, retryable?, data?, error? }] }`. Items are processed independently; a rejected item does not prevent later items from being processed. |

Sync receipts are uniquely keyed by authenticated user and client ID; completed results are replayed as duplicates. Concurrent requests for the same in-flight item return a retryable result. Readings and SOS also retain their model-level client-ID deduplication. Patient updates use the queued server timestamp as an optimistic concurrency check: a newer server profile returns `conflict` (server wins), rather than silently overwriting it. Transient server failures return `retry`; clients should retain and retry those items with exponential backoff. The offline client generates a UUID per queued reading, SOS, or patient operation. Classifier defaults are illustrative only; configure `READING_THRESHOLDS_JSON` and a distinct `READING_RULESET_VERSION` only after clinician/program approval. The override is a partial JSON object keyed by `bp.systolic`, `bp.diastolic`, `sugar.fasting`, `heartRate`, or `spo2`, with `critical`, `warning`, and `normal` bounds (`below`, `atOrAbove`, `min`, `max`) in the units listed above. Unsupported/unconfigured contexts remain `unclassified`; warning/critical readings create a deduplicated care-team alert. This classification is not a diagnosis.

### 3.4 Dashboards and alerts

| Method & path | Access | Request body / query | Success response (`data`) |
|---|---|---|---|
| `GET /dashboard/patient` | Patient | No body or query parameters; profile is resolved from the authenticated user. | `200 { patientId, patientName, latestVitals:[{ type, latest, previous, trend }], todayMedications:{ items, available }, nextAppointment:{ appointment, available }, openAlertsCount, nearestHealthCentre:{ id, name, type, address, phone, distanceKm } \| null }`. **Implemented.** Latest vitals include up to six measurement types; open alerts are counted (the current model does not track read/unread state); medication and appointment schedules are populated from their collections. Medication dose adherence is not implemented. |
| `GET /dashboard/doctor` | Doctor | Query: `page, limit, village?, condition?, status?` (`status`: `critical\|warning\|missed\|normal\|unclassified`) | **Implemented.** `200 { summary:{ totalPatients, criticalNow, missedReadingsToday, appointmentsToday, appointmentsAvailable }, patients:[{ patientId, name, phone, village, conditions, latestReading, riskStatus, riskScore, missedToday }], alerts, page, limit, total, hasMore }`. Results are limited to active patients assigned to the authenticated doctor; risk scores prioritize critical (300), warning (200), missed-today (100), then other (0). Summary counts are unfiltered; filters apply to the patient page. “Missed today” means no reading submitted since midnight Asia/Kolkata and does not imply a prescribed reading schedule. |
| `GET /dashboard/chw` | CHW | Query: `village?, page?, limit?` | `200 { villages, patients:[patientTaskSummary], openAlerts, todaySummary }`. |
| `GET /alerts` | Patient, Doctor, CHW, Admin (scoped to own profile, assigned patients, assigned villages, or all) | Query: `patientId?, status?, severity?, type?, from?, to?, page?, limit?` | **Implemented.** `200 { items:[alert], page, limit, total, hasMore }`. |
| `GET /alerts/:alertId` | Patient, Doctor, CHW, Admin (patient scope enforced) | — | **Implemented.** `200 { alert }`. |
| `PATCH /alerts/:alertId/acknowledge` | Assigned Doctor/CHW or Admin | `{ note? }` | **Implemented.** `200 { alert: { id, status:"acknowledged", acknowledgedBy, acknowledgedAt } }`; stops escalation and writes a reason-free audit event. |
| `PATCH /alerts/:alertId/resolve` | Assigned Doctor or Admin | `{ resolutionNote }` | **Implemented.** `200 { alert: { id, status:"resolved", resolvedBy, resolvedAt } }`; writes an audit event without copying clinical note text into the audit log. |

**Scheduled jobs:** the API process checks open alerts for escalation every minute, detects active patients with no reading in 24 hours hourly, and creates in-app medication reminders at each prescription's local `Asia/Kolkata` timing. Reminder creation is deduplicated per medication/date/time. Dose adherence is not tracked, so a reminder is not treated as proof of a missed dose and does not automatically create a `medication_missed` alert.

### 3.5 Notes and CHW visits

| Method & path | Access | Request body / query | Success response (`data`) |
|---|---|---|---|
| `GET /patients/:patientId/notes` | Patient scope, further restricted by note visibility | Query: `kind?, page?, limit?` | **Implemented.** `200 { items:[note], page, limit, total, hasMore }`. |
| `POST /patients/:patientId/notes` | Assigned Doctor or CHW | `{ kind:"clinical"\|"visit", body, visibility?, relatedRecordId? }` | **Implemented.** `201 { note }`; author/role derived from session. |
| `PATCH /patients/:patientId/notes/:noteId` | Original author or assigned Doctor | `{ body, editReason }` | **Implemented.** `200 { note }`; prior body and edit reason are preserved in note revisions. |
| `GET /patients/:patientId/timeline` | Patient scope | — | **Implemented.** `200 { items:[{ id, type, at, item }] }`; includes readings, care-team notes, alerts, prescriptions, and appointments. |
| `GET /chw/visits` | CHW | Query: `patientId?, village?, from?, to?, page?, limit?` | `200 { items:[visit], page, limit, total, hasMore }`; scope enforced. |
| `POST /chw/visits` | CHW | `{ patientId, visitedAt, notes?, location? }` | `201 { visit }`; patient must be in CHW scope. |
| `GET /chw/summary` | CHW | Query: `from, to` | `200 { patientsCovered, readingsEntered, alertsHandled, visitsCompleted }`. |

The proposed API can persist visit logs in `notes` with `kind:"visit"`; a separate `visits` collection is preferable if visits need independent lifecycle, querying, or retention.

### 3.6 SOS incidents

| Method & path | Access | Request body / query | Success response (`data`) |
|---|---|---|---|
| `POST /sos` | Authenticated Patient (incident is bound to the patient's own profile) | `{ clientId:UUID, location?:GeoJSONPoint }`; if GPS is omitted, the patient's saved location is used; if neither exists, `400 SOS_LOCATION_REQUIRED`. | **Implemented.** `201 { incident, nearestHealthCentres:[{ name, type, address, phone, distanceKm, hasAmbulance, hasDrone }], emergencySms:{ recipients, body, mapLink }, duplicate:false }`; idempotent retry returns `200` and `duplicate:true`. Creates a critical SOS alert and in-app notifications to assigned doctor and CHW. |
| `GET /sos/:incidentId` | Patient, assigned Doctor, assigned-village CHW, Admin | — | **Implemented.** `200 { incident }`; access is patient-scoped. |
| `PATCH /sos/:incidentId/status` | Assigned Doctor/CHW or Admin; resolution is Doctor/Admin only | `{ status, note? }`; statuses restricted to valid forward transitions; resolving requires a note. | **Implemented.** `200 { incident }`; appends timeline actor/time and audit event; resolving closes the linked SOS alert. |

**Delivery and offline behavior:** Server-side recipient notifications are persisted as in-app notifications; `doctorNotified` and `chwNotified` indicate those in-app records were created, not that a person read them. This repository has no configured push provider or server-side SMS gateway, so those are not represented as sent. The client opens the device's SMS composer with the emergency text addressed to the assigned care team and consented emergency contacts; SMS is sent only if the user taps Send. Offline requests are stored in IndexedDB with an idempotency UUID and retried when connectivity returns; a composer opens immediately when possible. The SOS screen also provides a direct `tel:108` action. Offline coordinates are best-effort GPS captured at trigger time; otherwise the server uses the saved profile location during sync. A locally queued SOS is clearly labeled unconfirmed until the API acknowledges it.

Do not accept arbitrary state transitions. Validate allowed transitions server-side; `ambulanceRequested` and `droneRequested` mean a staff member recorded a request, not that a vehicle was dispatched or arrived.

### 3.7 Medications and adherence (prescriptions implemented; adherence Phase 2)

| Method & path | Access | Request body / query | Success response (`data`) |
|---|---|---|---|
| `GET /patients/:patientId/medications` | Patient scope | Query: `active?, from?, to?` | **Implemented.** `200 { items:[medication] }`. |
| `POST /patients/:patientId/medications` | Assigned Doctor | `{ name, dose, frequency, timings, startDate, endDate?, instructions? }` | **Implemented.** `201 { medication }`; prescriber derived from session. |
| `PATCH /patients/:patientId/medications/:medicationId` | Assigned Doctor | `{ dose?, frequency?, timings?, endDate?, instructions?, active?, reason }` | **Implemented.** `200 { medication }`; prior prescription fields and change reason are appended to history. |
| `POST /patients/:patientId/medications/:medicationId/adherence` | Patient; assigned CHW where allowed | `{ scheduledAt, status:"taken"\|"missed", clientId }` | `201 { adherence }`; idempotent by client ID. |

### 3.8 Appointments (API details in section 3.12)

Appointments support patient/CHW booking requests, doctor confirmation and weekly availability, role-scoped schedule lists, rescheduling and cancellation. The complete endpoint contract and slot-reservation behavior are documented in section 3.12.

### 3.9 Notifications

| Method & path | Access | Request body / query | Success response (`data`) |
|---|---|---|---|
| `GET /notifications` | Authenticated user; own notifications | Query: `status?, type?, page?, limit?` | `200 { items:[notification], page, limit, total, hasMore }`. |
| `PATCH /notifications/:notificationId/read` | Owner only | `{}` | `200 { notification: { id, status:"read", readAt } }`. |
| `POST /notifications/read-all` | Authenticated user | `{}` | `200 { updatedCount }`. |
| `PATCH /auth/me/notification-preferences` | Authenticated user | `{ inApp?, push?, sms?, quietHours? }` | `200 { notificationPreferences }`. |

Notification delivery statuses must reflect provider evidence. “Queued” or “sent” must not be presented as “delivered” unless a delivery receipt confirms it.

### 3.10 Health centres

| Method & path | Access | Request body / query | Success response (`data`) |
|---|---|---|---|
| `GET /health-centres/nearest` | Authenticated patient, doctor, CHW, or admin | Query: required `lat`, `lng`; optional `limit` (default 10, max 50), `type` (`PHC`, `CHC`, `districtHospital`, `private`) | `200 { items:[{ _id, name, type, address, phone?, services, location, distanceMeters, distanceKm, hasAmbulance, hasLandingPoint, hasDrone, is24x7 }] }`; computed with `$geoNear`, nearest-first and active centres only. |
| `GET /health-centres/active` | Authenticated patient, doctor, CHW, or admin | — | `200 { items:[{ _id, name, address, type }] }`; active centres available for in-person appointment booking. |
| `GET /health-centres` | Admin | Query: `page?`, `limit?`, `type?`, `status?` (`active`, `inactive`, `all`) | `200 { items, page, limit, total, hasMore }`. |
| `POST /health-centres` | Admin | `{ name, type, address, phone?, services?, hasAmbulance?, hasLandingPoint?, hasDrone?, is24x7?, location:GeoJSONPoint }` | `201 { centre }`; creation audited. |
| `GET /health-centres/:centreId` | Admin | — | `200 { centre }`. |
| `PATCH /health-centres/:centreId` | Admin | Partial editable centre fields | `200 { centre }`; update audited. |
| `DELETE /health-centres/:centreId` | Admin | — | `200 { centre }` with `isActive:false`; soft-deactivation audited to preserve references. |

GeoJSON uses `[longitude, latitude]`; the model validates both coordinate bounds and has a `2dsphere` index. The patient Nearby Centres page caches successful result sets locally for offline display and marks cached results with their save time.

### 3.11 Landing points and drone missions

| Method & path | Access | Request body / query | Success response (`data`) |
|---|---|---|---|
| `GET /drone/landing-points` | Admin; CHW (assigned villages only) | Query: `page?`, `limit?`, `includeInactive?` | `200 { items, assignedVillages?, page, limit, total, hasMore }`; photos are omitted from the list and `photoCount` is returned; CHW results are filtered by assigned village, mandal, and district. |
| `POST /drone/landing-points` | Admin; CHW (assigned villages only) | `{ village, mandal?, district?, name, location, surfaceType, obstructionsNotes?, contactPerson, phone, photos?:[compressedJpegDataUrl], checklist? }` | `201 { landingPoint }`; point is created inactive pending full checklist verification. |
| `GET /drone/landing-points/:landingPointId` | Admin; CHW (assigned village/mandal/district only) | — | `200 { landingPoint }`, including photos; CHW out-of-scope point IDs return `404`. |
| `PATCH /drone/landing-points/:landingPointId/checklist` | CHW who submitted the point and is assigned to its village | `{ checklist }` (all five boolean safety checks) | `200 { landingPoint }`; resets verification and deactivates the point; admin review is required again. |
| `PATCH /drone/landing-points/:landingPointId` | Admin | Partial point fields plus `verified?`, `isActive?`, `noFly?`, `noFlyReason?`, `checklist?` | `200 { landingPoint }`; verifier/time derive from session; unsafe activation returns `409`. |
| `DELETE /drone/landing-points/:landingPointId` | Admin | — | `200 { landingPoint }` with inactive flag. |
| `GET /drone/missions` | Admin; patient (own); assigned doctor; CHW with explicitly scoped patient ID | Query: `patientId?`, `status?`, `page?`, `limit?` | `200 { items:[mission], page, limit, total, hasMore }`. |
| `POST /drone/missions` | Patient/CHW for an accessible SOS incident; doctor/admin for a patient in scope | `{ sosIncident?, patientId?, payload:[medicine\|AED\|glucoseKit\|firstAid\|other] }` | `201 { mission, simulation }`, status `requested` pending approval; repeated SOS mission returns `200 { mission, duplicate:true }`. |
| `GET /drone/missions/:missionId` | Admin, patient owner, assigned doctor, or assigned-village CHW | — | `200 { mission }`. |
| `POST /drone/missions/:missionId/approve` | Assigned doctor or admin | — | `200 { mission, provider, contactSms }`; weather, verified/active/no-fly, and drone-capable origin checks repeat at approval. Provider dispatch happens only after approval. |
| `PATCH /drone/missions/:missionId/status` | Assigned doctor or admin | `{ status:"enRoute"\|"arrived"\|"delivered", note? }` | `200 { mission }`; only forward transitions are permitted and added to the timeline. |
| `POST /drone/missions/:missionId/abort` | Assigned doctor or admin | `{ reason }` | `200 { mission }`; provider abort is requested for dispatched flights before status changes. |

The default `MockDroneProvider` and `MockWeatherProvider` are simulations. Optional `HttpDroneProvider` and `HttpSmsProvider` adapters require explicit environment configuration. Weather is checked at request and approval; unverified, inactive, and no-fly landing points are never selected or dispatched to. SMS delivery status is recorded in `smsLogs`. Real aircraft operations are out of scope until separately approved by DGCA and other applicable legal, aviation, clinical, and safety stakeholders. The admin map uses OpenStreetMap tiles and polls mission status every 15 seconds. CHWs can submit and update candidate sites only within their assigned village/mandal/district; only admins can verify and activate a site. The CHW screen shows verification and six-month re-verification dates.

### 3.12 Appointments

| Method & path | Access | Request body / query | Success response (`data`) |
|---|---|---|---|
| `GET /appointments/doctors` | Authenticated patient/CHW/doctor/admin | — | `{ items:[{ _id, name, specialization, hospital }] }` for active verified doctors. |
| `GET /appointments/availability` | Authenticated user | Query: `doctorId, from, to` (max 31 days) | `{ doctorId, slots:[{ scheduledAt, durationMinutes:30 }] }`; reserved slots are omitted. |
| `GET /appointments/availability/mine` | Doctor | — | `{ availability:[{ dayOfWeek, startTime, endTime, timezone }] }`. |
| `PUT /appointments/availability` | Doctor | `{ availability:[{ dayOfWeek, startTime, endTime, timezone? }] }` | `{ availability }`; replaces that doctor's weekly schedule. Times are `HH:mm` on 30-minute boundaries. |
| `GET /appointments` | Patient (own), doctor (own), CHW (assigned villages), admin | Query: `patientId?`, `doctorId?`, `status?`, `from?`, `to?`, `page?`, `limit?` | `{ items:[appointment], page, limit, total, hasMore }`. |
| `POST /appointments` | Patient (self), CHW (assigned-village patient with assigned doctor), doctor (assigned patient), admin | `{ patientId? (required except patient), doctorId? (required except doctor), scheduledAt, durationMinutes?:30\|60, mode:"video"\|"phone"\|"inPerson", healthCentreId?, reason? }` | `201 { appointment }`; patient/CHW requests start `requested`, doctor/admin bookings start `confirmed`. |
| `PATCH /appointments/:appointmentId/confirm` | Owning doctor or admin | `{}` | `200 { appointment }`; only requested appointments can be confirmed. |
| `PATCH /appointments/:appointmentId/reschedule` | Appointment patient, assigned CHW/doctor, or admin | `{ scheduledAt, durationMinutes?:30\|60 }` | `200 { appointment }`; patient/CHW changes return to `requested` for doctor confirmation. |
| `PATCH /appointments/:appointmentId/cancel` | Appointment patient, assigned CHW/doctor, or admin | `{ reason? }` | `200 { appointment }`; cancelled appointments release their reserved slots. |
| `PATCH /appointments/:appointmentId/status` | Owning doctor or admin | `{ status:"completed"\|"no-show", notes? }` | `200 { appointment }`; terminal statuses cannot be reopened. |
| `POST /patients/:patientId/appointments` | Assigned doctor (legacy patient-scoped route) | `{ scheduledAt, durationMinutes?, mode, healthCentreId?, reason? }` | `201 { appointment }`; uses the same schedule and concurrency validation. |

Creating, confirming, rescheduling, and cancelling appointments creates localized in-app notifications for the patient and doctor. Confirmed appointments also receive in-app and SMS reminders one hour and 24 hours before start time (deduplicated per reminder window). Request notifications are sent immediately; only confirmed appointments receive reminders.

### 3.13 SMS integration

| Method & path | Access | Request body / query | Success response (`data`) |
|---|---|---|---|
| `POST /sms/inbound` | Twilio webhook | `application/x-www-form-urlencoded`: `From`, `To`, `Body`, `MessageSid`; `X-Twilio-Signature` required | TwiML `<Response/>`. Valid commands create an SMS-sourced reading or SOS and receive a localized SMS reply. |

Configure Twilio to call the exact public URL in `SMS_WEBHOOK_URL`; signature verification uses that configured URL and the Twilio auth token. Supported case-insensitive commands are `BP 140 90` (also `BP 140/90`), `SUGAR 180 F` (`F`/`FASTING`, `P`/`POST-MEAL`, or `R`/`RANDOM`), `HR 88`, and `SOS`. Inbound traffic is rate-limited per normalized sender using MongoDB-backed fixed windows; duplicate Twilio `MessageSid` deliveries are idempotent. Senders are matched to active patients by phone number. SMS logs contain keyed phone hashes and redacted message bodies; raw readings are stored only in the health record. A valid but unlinked sender receives a generic localized reply. Configure `SMS_PROVIDER=mock` for simulated development delivery, `twilio` for Twilio, or `http` for a compatible configured HTTP provider. `SMS_LOG_HASH_SECRET` must be a random secret of at least 32 characters in production. `sendOtpSms` exposes localized OTP delivery for authentication flows; this repository does not yet provide an OTP challenge endpoint. There is no provider delivery-status webhook endpoint.

### 3.14 Reports

| Method & path | Access | Request body / query | Success response (`data`) |
|---|---|---|---|
| `GET /reports/patients/:patientId/summary` | Patient scope (patient, assigned doctor/CHW, admin) | Query: `from?, to?` (ISO 8601; defaults to the last 30 days through now) | `200 { patient, period, readings, stats, alerts, medications, notes }`; excludes doctor-only notes. |
| `GET /reports/patients/:patientId/summary.pdf` | Patient scope (patient, assigned doctor/CHW, admin) | Query: `from?, to?, language?` (`en` or `te`; dates default to the last 30 days through now) | PDF download containing profile, vital statistics and charts, alerts, medications, and care-team notes; Telugu text uses the embedded NTR font. Export is audited. |
| `GET /reports/patients/:patientId/readings.csv` | Patient scope (patient, assigned doctor/CHW, admin) | Query: `from?, to?, type?` (ISO 8601, supported reading type) | UTF-8 CSV download with a BOM and formula-safe cells; export is audited. |
| `GET /reports/admin` | Admin | Query: `from?, to?` (ISO 8601) | `200 { period, patientsPerVillage, criticalAlertsPerWeek, chwActivity, sosResponse, droneMissions }`. |
| `GET /reports/admin.csv` | Admin | Query: `from?, to?` (ISO 8601) | CSV download containing village totals, weekly critical alerts, CHW activity, SOS response details, and drone mission statuses; export is audited. |

All report routes reject invalid or reversed date ranges. Patient-level data and exports are checked against current patient scope. PDF/CSV responses use private, no-store caching; exports are streamed/downloaded directly rather than exposing public report URLs. Admin reports aggregate operational data and are available only to administrators.

### 3.15 Audit and health checks

| Method & path | Access | Request body / query | Success response (`data`) |
|---|---|---|---|
| `GET /admin/audit-logs` | Admin with audit permission | Query: `actorId?, action?, resourceType?, patientId?, from, to, page?, limit?` | `200 { items:[auditEvent], page, limit, total, hasMore }`; no raw secrets/full health payloads. |
| `GET /health` | Public or infrastructure policy | — | `200 { status:"ok", timestamp }`; expose no infrastructure secrets, database URI, or detailed dependency error to public callers. |

## 4. Error codes

| Code | Typical HTTP | Meaning |
|---|---:|---|
| `VALIDATION_ERROR` | 400 | Request shape, field, or format is invalid. |
| `UNAUTHENTICATED` | 401 | Missing, expired, or invalid access credentials. |
| `ACCESS_TOKEN_MISSING` | 401 | Access token was not provided. |
| `ACCESS_TOKEN_EXPIRED` | 401 | Access token has expired; client may attempt one cookie-based refresh. |
| `ACCESS_TOKEN_INVALID` | 401 | Access token is invalid, tampered, wrong type, or refers to a missing account. |
| `ACCOUNT_INACTIVE` | 401 | Account is inactive; response must not expose sensitive account state to an unauthenticated actor. |
| `FORBIDDEN` | 403 | Authenticated actor lacks role, assignment, ownership, or action permission. |
| `NOT_FOUND` | 404 | Resource does not exist or is intentionally concealed due to access policy. |
| `CONFLICT` | 409 | State transition, unique key, booking, or idempotency conflict. |
| `INVALID_STATE_TRANSITION` | 409 | Requested alert/SOS/mission status transition is not permitted. |
| `DEPENDENCY_UNAVAILABLE` | 503 | External provider or required service is unavailable; preserve pending state where safe. |
| `RATE_LIMITED` | 429 | Request limit exceeded; include retry guidance where safe. |

## 5. Index, lifecycle, and implementation notes

- Use Mongoose schemas with `strict: "throw"` where compatible, explicit request DTO validation, and allow-listed updates. Never pass `req.body` directly to `findOneAndUpdate`.
- Verify every `ref` exists and is in the caller's authorized scope before creating a dependent document. Use transactions for multi-document operations when MongoDB deployment supports them.
- Use soft deactivation for users, patients, health centres, and landing points where historical records reference them. Define a retention/deletion process for legal requests and audit records.
- Time-series-heavy readings may later benefit from MongoDB time-series collections, but patient scoping, per-record corrections, and idempotency requirements should be evaluated before migration.
- Choose indexes from observed query patterns and validate with `explain()`. Geospatial queries require valid GeoJSON and a `2dsphere` index on each queried location field.
- For stable, high-volume pagination, consider range/cursor pagination on `(recordedAt, _id)` instead of large `skip` values.
- Clinical thresholds and alert severity are not defined by the schema alone. Maintain a versioned approved ruleset and preserve the exact ruleset version used to classify each record.
- Do not store provider credentials, raw access/refresh tokens, or unnecessary raw inbound SMS in these collections.
