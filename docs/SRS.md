# Software Requirements Specification

## Chronic Disease Remote Monitoring

| Document field | Value |
|---|---|
| Version | 1.0 |
| Status | Project requirements baseline |
| Intended audience | Product, design, engineering, testing, clinical reviewers, and deployment stakeholders |
| Product context | MERN-based, mobile-first remote monitoring PWA for rural India |

## 1. Purpose and scope

This specification defines requirements for a remote-monitoring application that helps people with diabetes, hypertension, and cardiac conditions record health readings at home or in their village, share those readings with their care team, and surface potential concerns early. The product supports patients, doctors, community health workers (CHWs), and administrators, including users with limited connectivity and users who prefer Telugu.

The application is a communication and monitoring aid. It does not diagnose conditions, replace professional judgment, guarantee delivery of emergency services, or independently recommend treatment. Clinical thresholds, messages, and escalation workflows must be reviewed and approved by qualified clinicians before any real-world use.

### 1.1 Goals

- Make home- and CHW-entered readings available to the patient's authorized care team.
- Identify readings that cross configured rules and make resulting alerts actionable.
- Support basic monitoring workflows on low-bandwidth and intermittently connected devices.
- Give each role access only to the patient information needed for its responsibilities.
- Make essential workflows available in English and Telugu with mobile-first, accessible interaction patterns.
- Provide a clear route to request help, without representing the software as an emergency-response guarantee.

### 1.2 Out of scope

- Diagnosis, autonomous treatment recommendations, medication changes, or a replacement for clinician review.
- Medical-device certification or claims that user-entered or consumer-device measurements are clinically validated.
- Actual aircraft/drone operation, flight authorization, dispatch guarantees, or autonomous selection of a safe flight path.
- Guaranteed SMS, push, cellular, GPS, ambulance, or health-centre availability.
- A video-consultation service or payment/insurance processing unless approved in a later product scope.

## 2. Product context

### 2.1 User classes

| Role | Primary responsibilities | Default access boundary |
|---|---|---|
| Patient | Maintain their profile, record and review their readings, view care information, and request help. | Own profile and records only. |
| Doctor | Review assigned patients, readings, alerts, trends, and care notes; manage care workflow. | Patients assigned to that doctor. |
| CHW | Support patients in assigned villages, enter readings on their behalf, record visits, and assist with alerts or SOS. | Patients in assigned villages. |
| Admin | Manage accounts, assignments, approved clinical configuration, health-centre and operational reference data, and audit review. | Administrative functions; access to clinical data must be limited to authorized operational needs and audited. |

### 2.2 Operating environment

- Client: React/Vite progressive web application, mobile-first and usable at a target viewport of 360 CSS pixels.
- Server: Node.js and Express API.
- Persistence: MongoDB; client-side offline queue/cache uses IndexedDB (Dexie).
- Authentication: JWT access token and rotated refresh-token flow; transport over HTTPS in deployed environments.
- Connectivity: intermittent and low-bandwidth mobile data, including 2G-class connections; some workflows can be queued locally.
- Languages: English and Telugu. Dates, numbers, user-facing status labels, and notification/SMS templates should be localized.
- External services may include an SMS gateway, web push provider, mapping/geocoding data, and a mockable drone-provider adapter.

### 2.3 Key entities

The system is expected to manage users and role profiles; patients; health records; alerts; medications and adherence; appointments; notifications; clinical notes; SOS incidents; health centres; village landing points; drone missions; SMS logs; audit logs; and synchronization logs. Entity-level validation, retention, and access controls are required even where a later phase introduces the corresponding user interface.

### 2.4 Assumptions and dependencies

1. A patient account is associated with a unique phone number; email is optional. Public self-registration creates patient accounts only. Privileged accounts are provisioned by an administrator.
2. A doctor or CHW must be assigned to a patient before accessing that patient's protected records, subject to an authorized administrative workflow.
3. The default clinical thresholds below are illustrative project/demo values only. Before use with patients, clinicians must approve the thresholds, units, context, severity mapping, and escalation behavior.
4. Users may enter incorrect, incomplete, delayed, or duplicated readings. The UI must show the recorded time, source, and classification and must not imply that data has been clinically verified.
5. Offline features depend on browser storage and device capabilities. Local data may be unavailable after storage is cleared or on unsupported devices.
6. External SMS, push, map, GPS, and drone services have separate availability, cost, consent, privacy, and regulatory dependencies.
7. The product must obtain valid consent and meet applicable privacy, health-data, and Indian legal obligations before production use.

## 3. Personas

### 3.1 Patient: Lakshmi

- **Profile:** Adult living in a rural Andhra Pradesh village with hypertension and diabetes; uses an entry-level Android phone and may have intermittent mobile data.
- **Needs:** Record readings quickly, understand status in Telugu, see trends and the next appointment, and request help without navigating complex menus.
- **Constraints:** Limited bandwidth, limited digital literacy, shared-device/privacy concerns, and possible gaps in measurement technique.
- **Success:** Can save a reading offline, later confirm it synchronized, understand that an alert is not a diagnosis, and find the appropriate contact/help route.

### 3.2 Doctor: Dr. Rao

- **Profile:** Clinician managing a panel of chronic-care patients across a clinic and surrounding villages.
- **Needs:** Quickly identify assigned patients with concerning or overdue readings, review trends and context, acknowledge alerts, document follow-up, and plan appointments.
- **Constraints:** High patient volume, alert fatigue, incomplete or delayed data, and the need to retain clinical judgment.
- **Success:** Can prioritize the work queue, distinguish current from stale data, and document decisions without unauthorized access to other doctors' patients.

### 3.3 Community Health Worker: Sita

- **Profile:** CHW visiting several assigned villages, often using a shared or low-cost mobile device.
- **Needs:** Find assigned patients, enter readings on their behalf, record home visits, see village alerts, and continue work when offline.
- **Constraints:** Limited connectivity, travel and time pressure, shared-device security, and the need to clearly identify readings entered on behalf of a patient.
- **Success:** Can complete a visit and queue its data offline, with attribution and synchronization status visible.

### 3.4 Administrator: Arun

- **Profile:** Authorized program operator responsible for user provisioning, assignments, clinical configuration governance, and operational reference data.
- **Needs:** Manage accounts and assignments, configure only approved thresholds, maintain health-centre data, and inspect audit and operational status.
- **Constraints:** Must not change clinical rules without approval; broad access creates privacy and security risk.
- **Success:** Can perform authorized administration with least privilege, change history, and traceable audit records.

## 4. User stories and acceptance criteria

Stories are grouped by role and use `Given / When / Then` acceptance criteria. “Online” means the client can reach the application API; “offline” means that it cannot. Items identified as Phase 2 are not MVP release gates.

### 4.1 Authentication, profile, and language

**US-01 — Patient registration and sign-in (MVP).** As a patient, I want to register and sign in using my phone number and password so I can access my own care information.

- Given a valid phone number and password, when I register publicly, then a patient account is created and no privileged role can be self-selected.
- Given valid credentials, when I sign in, then I am authenticated and routed to the patient experience.
- Given invalid credentials or an inactive account, when I sign in, then access is denied with a clear, non-sensitive error.
- Given repeated failed sign-in attempts, when the configured limit is reached, then sign-in is temporarily locked and the event is recorded.

**US-02 — Privileged account management (MVP).** As an administrator, I want to provision and deactivate doctor and CHW accounts so only authorized staff can use privileged workflows.

- Given an administrator with permission, when they create or deactivate a staff account, then the role and state change are validated, persisted, and audited.
- Given a non-admin user, when they attempt a privileged account operation, then the API rejects it.

**US-03 — Patient profile and assignments (MVP).** As an authorized patient or staff member, I want to maintain the minimum patient profile and care-team assignment needed for monitoring.

- Given an authorized edit, when profile fields are saved, then required fields are validated and the authorized user is recorded.
- Given an unauthorized user or a user outside the patient's access boundary, when they read or change the profile, then the operation is denied.
- Given an administrator assignment change, when it is saved, then subsequent access follows the new assignment and the change is audited.

**US-04 — Language choice (MVP).** As a user, I want to choose English or Telugu so that navigation and essential workflows are understandable to me.

- Given either supported language is selected, when the user navigates or returns to the app, then the selection persists on the device and, when signed in, is associated with the user profile.
- Given a supported language, when a translated string is unavailable, then the UI uses a defined fallback rather than displaying a missing-key token.

### 4.2 Readings and monitoring

**US-05 — Record a health reading (MVP).** As a patient, I want to enter a vital reading and its context so my care team can review it.

- Given a supported reading type and valid values/units, when I save online, then the record includes patient, recorded time, author/source, and computed status.
- Given invalid or incomplete values, when I submit, then field-level validation explains what must be corrected and no invalid record is saved.
- Given a warning or critical classification, when the reading is accepted, then the system creates or updates an alert according to the configured rule.
- Given a previously submitted offline record with the same client identifier, when it is retried, then the server does not create a duplicate.

**US-06 — Record a reading offline (MVP).** As a patient or CHW, I want to save a reading without connectivity and synchronize it later.

- Given the API is unavailable, when I save a valid reading, then it is stored in the local pending queue with a unique client ID and a visible pending state.
- Given connectivity returns, when synchronization runs, then each queued item receives an individual success/failure result and successful items are not resubmitted as new records.
- Given an item cannot be synchronized, when the sync attempt ends, then it remains visibly pending/failed with a retry path; it is not silently discarded.

**US-07 — Review reading history and trends (MVP).** As a patient or authorized clinician, I want to view dated readings and trends to support care conversations.

- Given an authorized patient and available records, when I choose a reading type and date range, then matching records are displayed with units, source, time, and status.
- Given no matching records, when results load, then a clear empty state is shown.
- Given stale or delayed records, when they are shown, then their recorded time is visible and they are not represented as current.

**US-08 — Review assigned-patient risk queue (MVP).** As a doctor, I want an assigned-patient list ordered by concerning readings and overdue monitoring.

- Given assigned patients with records or overdue status, when the dashboard loads, then current critical/warning indicators and last-reading times are visible and the list prioritizes higher risk.
- Given a patient not assigned to the doctor, when the doctor requests their record, then access is denied even if the patient identifier is known.
- Given missing readings, when the dashboard displays an overdue indicator, then it is labeled as missing data and not as a clinical diagnosis.

### 4.3 Alerts and care team

**US-09 — Review and acknowledge an alert (MVP).** As a doctor or authorized CHW, I want to review and acknowledge an alert so the care team can coordinate a response.

- Given a warning/critical reading that meets configured rules, when processing completes, then an alert includes its source record, severity, patient, and creation time.
- Given an authorized recipient, when they acknowledge an open alert, then acknowledgement actor/time are recorded and the updated state is visible to authorized users.
- Given an unauthorized user, when they list or update an alert, then the request is denied.
- Given duplicate triggering events within the configured deduplication policy, when the event is processed, then the system follows that policy and does not create an uncontrolled duplicate alert stream.

**US-10 — Add a care note (MVP).** As a doctor, I want to document follow-up notes against an assigned patient.

- Given an assigned patient, when I save a note, then author, patient, creation time, and visibility are stored and shown to authorized users.
- Given a user without the required access, when they request the note, then no note content is disclosed.

### 4.4 CHW workflows

**US-11 — Enter a reading during a visit (MVP).** As a CHW, I want to record a patient's reading and attribute it to myself.

- Given the patient is in my assigned village, when I submit a reading on their behalf, then the record identifies the CHW as author and the CHW-entry source.
- Given the patient is outside my permitted villages, when I attempt to access or enter a reading, then the operation is denied.
- Given the device is offline, when I save the reading, then it is queued and its patient/author association is preserved for synchronization.

**US-12 — Record a home visit (MVP).** As a CHW, I want to log a visit with date and notes so follow-up work is traceable.

- Given an assigned patient, when I save a visit, then the record includes patient, CHW, time, and notes; location is included only when available and permitted.
- Given location permission is denied or unavailable, when I save a visit, then the visit can still be recorded without fabricating coordinates.

**US-13 — Review village work and alerts (MVP).** As a CHW, I want to see assigned-village patients and their open follow-up items.

- Given my assigned villages, when I open the CHW home, then only permitted patients and relevant alerts are shown.
- Given an alert belongs to a patient outside my scope, when I query it, then it is not returned.

### 4.5 SOS and emergency support

**US-14 — Request help (MVP).** As a patient, I want to initiate an SOS and see its submission status.

- Given the patient confirms SOS, when online, then an incident is created with available GPS coordinates or the saved patient location, and authorized care-team recipients are notified through configured in-app channels.
- Given location is unavailable, when SOS is submitted, then the incident indicates that location is unavailable or uses the saved location with its source made clear.
- Given the client is offline, when SOS is initiated, then the app queues the incident locally, clearly warns that server notification has not been confirmed, and offers to open the device SMS composer with prefilled details when supported.
- Given an incident is created, when the patient views status, then the application shows the last confirmed incident state and available help options, including calling India's emergency number 108 where applicable.
- Given a repeated submission, when the same offline item is retried, then the system uses an idempotency identifier to avoid duplicate incidents.

**US-15 — Manage SOS follow-up (MVP).** As an assigned doctor or CHW, I want to see an SOS and record follow-up state.

- Given a new incident for an assigned patient, when it is delivered to the service, then the authorized care team can view its time, available location, and timeline.
- Given an authorized responder updates the incident, when the update is saved, then actor, time, and state are appended to the timeline.
- The UI must not state that an ambulance or other responder has been dispatched unless that status is confirmed by an authorized integration or person.

### 4.6 Administration and reporting

**US-16 — Configure approved thresholds (MVP).** As an administrator, I want to manage clinician-approved thresholds and their effective version.

- Given an authorized admin and approved threshold set, when configuration changes, then units, boundaries, effective time, and version are validated and audited.
- Given an unapproved or malformed configuration, when it is submitted, then the change is rejected and the previous active configuration remains in force.
- Given a record already classified under an earlier configuration, when a new configuration is activated, then historical status is not silently rewritten.

**US-17 — Maintain operational reference data (Phase 2).** As an administrator, I want to maintain health-centre and village landing-point information.

- Given valid reference data and admin authorization, when an item is created or updated, then location and verification state are validated and the change is audited.
- Given a point is inactive or unverified, when operational results are presented, then it is not represented as a currently verified option.

**US-18 — Export a patient summary (Phase 2).** As an authorized clinician, I want to export a date-bounded patient summary for care coordination.

- Given an authorized clinician and valid date range, when a report is generated, then it includes only the requested patient's permitted data and identifies the generation time and range.
- Given a user without export permission, when they request the report, then access is denied and the attempt is audited.

### 4.7 Phase-2 integrations

**US-19 — Exchange messages by SMS (Phase 2).** As a patient without reliable app connectivity, I want supported SMS messages to submit readings and receive responses.

- Given a verified provider webhook and a recognized sender/command, when the message is accepted, then input is validated, attribution and provider metadata are retained, and a localized acknowledgement is attempted.
- Given an unknown sender, malformed command, rate-limited number, or invalid signature, when a message arrives, then it is rejected or safely handled, logged, and does not create a reading.

**US-20 — Review appointment and medication reminders (Phase 2).** As a patient, I want to view appointments and prescribed medications and receive configured reminders.

- Given a clinician creates or updates an appointment/medication, when it is saved, then the patient can view the authorized details and the change is attributed.
- Given reminder delivery is enabled, when a reminder is due, then the system records the attempt and delivery outcome where the provider exposes it; delivery is not claimed when unconfirmed.

**US-21 — Request a mockable drone mission (Phase 2).** As an authorized doctor or administrator, I want to request a simulated supply mission to a verified landing point.

- Given an eligible incident, a verified active point, and required approval, when a mission is requested, then the mock/provider adapter returns a trackable mission state and records approvals and events.
- Given no approved landing point, no required approval, a safety/availability block, or provider failure, when a mission is requested, then no dispatch success is reported and the failure is visible.
- The feature must display that real flight and delivery are not guaranteed and require all applicable DGCA approvals, certified operators, safety review, and an independent operational process.

## 5. Functional requirements

Requirements marked **MVP** are release-scope requirements. **Phase 2** items are planned extensions, not implied MVP commitments.

### 5.1 Identity, authorization, and privacy

- **FR-01 (MVP):** The system shall authenticate users with a phone number and password; public registration shall create patient accounts only.
- **FR-02 (MVP):** The system shall support patient, doctor, CHW, and admin roles and enforce role permissions on the server for every protected operation.
- **FR-03 (MVP):** The system shall restrict patients to their own records, doctors to assigned patients, and CHWs to patients in assigned villages. Admin access shall be permissioned and auditable.
- **FR-04 (MVP):** The system shall support account activation/deactivation, staff provisioning by authorized administrators, and assignment updates.
- **FR-05 (MVP):** The system shall protect credentials and tokens using established password hashing and secure token handling; secrets shall be configuration-managed, not hardcoded.
- **FR-06 (MVP):** The system shall validate requests at API boundaries, return consistent non-sensitive errors, and record security-relevant events without logging passwords, tokens, or unnecessary health data.
- **FR-07 (MVP):** The system shall maintain audit events for authentication outcomes, sensitive record access/changes, role and assignment changes, threshold changes, exports, and administrative actions.
- **FR-08 (MVP):** The system shall provide a patient consent and privacy notice workflow before collecting health data; the required wording and legal basis require program/legal review.

### 5.2 Patient and care-team data

- **FR-09 (MVP):** The system shall store patient demographics and care data needed for monitoring, including village/mandal/district, conditions, allergies, emergency contacts, optional location, assigned doctor, and assigned CHW. An authorized CHW may register an unlinked patient profile only in an assigned village and with recorded consent; the patient links an account through self-registration using the same phone number.
- **FR-10 (MVP):** The system shall identify the creator/source and recorded time of every patient-entered or staff-entered health record.
- **FR-11 (MVP):** The system shall allow authorized clinicians to record patient-specific notes with defined visibility and ownership rules.
- **FR-12 (Phase 2):** The system shall support medication prescriptions, adherence logs, appointment scheduling, status changes, and reminders with role-appropriate permissions.

### 5.3 Readings, classification, and alerts

- **FR-13 (MVP):** The system shall accept blood pressure, glucose, heart rate, weight, and SpO2 records; the data model may also support temperature. It shall validate type-specific values, units, and glucose context (fasting, post-meal, or random where applicable).
- **FR-14 (MVP):** A record shall include the patient, values, units/context, recorded time, creation time, source (self, CHW, SMS, or device when enabled), author, optional notes, client-generated idempotency ID, and classification.
- **FR-15 (MVP):** The system shall classify supported readings using a configurable, versioned ruleset and preserve the ruleset/version used for classification. Unsupported or unapproved measurement/context combinations shall remain unclassified, and the system shall not present classification as a diagnosis.
- **FR-16 (MVP):** The illustrative demo defaults below may be used only for development/testing until validated; the deployed active values must be clinician-approved. Classification boundaries and handling of values not covered by the table require clinical sign-off.
- The server reads optional `READING_THRESHOLDS_JSON` overrides and a `READING_RULESET_VERSION`; both are recorded/validated for every classified reading. Defaults are illustrative, not treatment advice or a diagnosis.

| Metric | Illustrative normal | Illustrative warning | Illustrative critical |
|---|---|---|---|
| Systolic BP (mmHg) | 90–129 | 130–179 | ≥180 or <80 |
| Diastolic BP (mmHg) | 60–84 | 85–119 | ≥120 or <50 |
| Fasting glucose (mg/dL) | 70–125 | 126–249 | ≥250 or <54 |
| Heart rate (bpm) | 60–100 | 101–129 or 50–59 | ≥130 or <45 |
| SpO2 (%) | ≥95 | 91–94 | ≤90 |

- **FR-17 (MVP):** The system shall create or update an alert for a reading that meets an enabled warning/critical rule. Alert creation, deduplication, acknowledgement, and resolution shall be attributable and timestamped.
- **FR-18 (MVP):** The system shall show patients their own reading history and authorized staff the histories of patients in their scope, with type/date filters and visible units, source, timestamps, status, and empty/error states.
- **FR-19 (MVP):** The doctor dashboard shall present assigned patients with latest reading status, last-reading time, open alerts, and overdue/missing-reading indicators; prioritization rules shall be transparent and configurable.
- **FR-20 (Phase 2):** The system shall support scheduled missed-reading and medication-adherence checks and configurable alert escalation after clinician/program approval.

### 5.4 Offline operation and synchronization

- **FR-21 (MVP):** The client shall cache the app shell and the minimum user-authorized data needed for supported offline workflows; cached sensitive data shall be minimized and cleared on logout where practical.
- **FR-22 (MVP):** The client shall queue readings and SOS requests in IndexedDB with unique client IDs and explicit pending/synced/failed states.
- **FR-23 (MVP):** The synchronization API shall accept idempotent batches, validate each item independently, return per-item outcomes, and support partial failure without losing unrelated successful items.
- **FR-24 (MVP):** Synchronization shall be attempted on app start and reconnection, with a visible manual retry path and bounded retry/backoff behavior.
- **FR-25 (MVP):** The UI shall indicate online/offline state, pending item count, last successful sync time, and any failed item requiring user action.
- **FR-26 (MVP):** The server shall treat its accepted, validated record as canonical; conflict/deduplication behavior shall be deterministic and preserve both recorded time and server receipt time.

### 5.5 SOS, notifications, and emergency support

- **FR-27 (MVP):** A patient shall be able to initiate SOS with an explicit confirmation step; a CHW shall be able to initiate an SOS only for a patient within the CHW's authorization.
- **FR-28 (MVP):** An SOS incident shall capture the initiating user, patient, event time, available location and location source, status, and append-only event timeline.
- **FR-29 (MVP):** The system shall make an SOS available to authorized care-team users and provide an offline queue plus SMS-composer fallback where supported. The client shall explicitly distinguish queued from server-confirmed submission.
- **FR-30 (MVP):** The system shall provide in-app notification/alert status for the core workflows and shall not claim external delivery or responder dispatch without confirmation.
- **FR-31 (Phase 2):** The system may send localized outbound SMS and web push through provider adapters, with delivery-attempt logging, provider error handling, consent/preferences where applicable, and rate limiting.
- **FR-32 (Phase 2):** The system may receive SMS readings through a verified provider webhook after sender identification, signature validation, parsing, validation, and rate limiting.
- **FR-33 (Phase 2):** The system may find nearby health centres from verified geospatial records and return distance and contact details, with clear stale/offline-cache labeling.
- **FR-34 (Phase 2):** Drone-mission functionality shall be a mockable software integration requiring explicit approval and verified operational data; real dispatch is outside the application's guarantees and the project scope.

### 5.6 CHW and administration

- **FR-35 (MVP):** CHWs shall be able to view only assigned-village patients, enter readings on their behalf, view in-scope alerts, and record visits with optional location.
- **FR-36 (MVP):** Administrators shall be able to manage users, assignments, and approved threshold configuration, with validation, versioning, and audit history.
- **FR-37 (Phase 2):** Administrators/authorized CHWs may manage and verify health-centre and landing-point reference data, including status, contact, location, and verification metadata.
- **FR-38 (Phase 2):** The system may generate date-bounded patient PDF summaries and CSV reading exports, subject to role restrictions, audit logging, and privacy review.
- **FR-39 (Phase 2):** The system may provide CHW performance summaries using defined, privacy-reviewed operational metrics.

### 5.7 Localization and accessibility

- **FR-40 (MVP):** All essential navigation, forms, validation, reading labels/statuses, offline/sync messages, and SOS messaging shall be available in English and Telugu.
- **FR-41 (MVP):** The client shall use Telugu-capable fonts, localized date/number formatting, readable labels/icons, keyboard/focus support, and an accessible status representation that does not rely on color alone.
- **FR-42 (MVP):** Translation fallback and language persistence shall be deterministic across navigation and supported offline screens.
- **FR-43 (Phase 2):** Optional voice hints, fuller report localization, and expanded translations may be added after usability and clinical review.

## 6. Non-functional requirements

Targets apply to a representative low-cost Android device and production-like deployment. Measurements must be validated during testing; targets are not guarantees across all networks/devices.

### 6.1 Performance and availability

- **NFR-01:** For a 360px mobile viewport on a defined 2G-class test profile, the cached app shell and essential patient home UI shall become usable within 3 seconds after first successful cache population. First-visit performance shall be measured and reported separately.
- **NFR-02:** For a healthy API and representative load, 95% of ordinary read/write API requests shall complete within 2 seconds, excluding external-provider latency; performance tests shall document dataset, device, and network profile.
- **NFR-03:** Critical user workflows shall remain usable without a live connection where explicitly specified. The UI shall never present unconfirmed local actions as server-accepted.
- **NFR-04:** Production service availability and recovery objectives shall be agreed before deployment; provider dependencies and planned maintenance shall be documented.

### 6.2 Security and privacy

- **NFR-05:** All deployed client/server traffic shall use HTTPS; authentication endpoints and sensitive operations shall use appropriate rate limits.
- **NFR-06:** Passwords shall be stored using an approved adaptive password hash. Access tokens shall be short-lived; refresh tokens shall be protected, rotated, revocable, and handled in secure, HttpOnly, appropriately SameSite cookies where the client architecture supports them.
- **NFR-07:** Authorization shall be enforced server-side on every request, including exports, nested resources, synchronization batches, and SOS/alert actions. Client-side route guards are not an authorization boundary.
- **NFR-08:** The system shall minimize collection, transmission, retention, and local caching of personally identifiable and health information. Sensitive data shall not appear in URLs, analytics, routine logs, or error messages.
- **NFR-09:** Security-sensitive configuration shall use deployment secrets; inputs shall be validated; web security headers, restrictive CORS, request size limits, and safe error handling shall be applied.
- **NFR-10:** Production deployment shall define backup, restore, retention, breach response, consent/withdrawal, and account recovery processes with legal/privacy review, including applicable Indian DPDP Act requirements.
- **NFR-11:** Offline data shall be protected against casual exposure on shared devices, cleared or invalidated appropriately on logout/account change, and disclosed in the privacy notice. Device-level compromise cannot be fully prevented by the web application.

### 6.3 Reliability and data integrity

- **NFR-12:** Reading and SOS synchronization shall be idempotent and expose per-item outcomes; transient failures shall not silently lose or duplicate accepted data.
- **NFR-13:** The system shall retain both user-recorded time and server receipt/creation time and indicate the data source and synchronization delay.
- **NFR-14:** Database backups and a tested restoration procedure shall be in place before production use.
- **NFR-15:** External provider outages shall be surfaced as failed/pending outcomes; they shall not be converted to success-shaped responses.

### 6.4 Usability, accessibility, and localization

- **NFR-16:** Essential mobile actions shall support large touch targets, concise labels, readable text, and a layout usable at 360px width.
- **NFR-17:** Status shall be conveyed using text/icon and not color alone. Charts shall provide an accessible data-table alternative.
- **NFR-18:** Essential workflows shall support English and Telugu strings and Telugu-capable rendering; critical translations and clinical messages require qualified review.
- **NFR-19:** Forms shall have programmatic labels, understandable validation, focus visibility, and keyboard accessibility. Accessibility testing shall target WCAG 2.1 AA for essential flows.
- **NFR-20:** Error, loading, empty, offline, pending-sync, and permission-denied states shall be explicit and usable.

### 6.5 Maintainability and testability

- **NFR-21:** API errors and success responses shall follow a consistent documented shape; validation, authorization, business logic, and provider integration shall be separable and testable.
- **NFR-22:** Automated tests shall cover critical classification boundaries, authorization/ownership, idempotent sync, alert behavior, and SOS submission/fallback behavior. The project guide's target is at least 80% coverage of critical modules; coverage shall not substitute for behavioral tests.
- **NFR-23:** Build/test automation shall run linting and relevant tests before release; production changes shall be deployable and rollback procedures documented.
- **NFR-24:** Thresholds, alert rules, language templates, and provider behavior shall be versioned/configurable without embedding secrets or silently changing historical records.

## 7. MVP vs. Phase-2 scope

### 7.1 MVP — first usable release

1. Phone/password patient authentication, admin-provisioned staff accounts, role-based access, patient profile, and doctor/CHW assignments.
2. English/Telugu language choice and translations for essential workflows.
3. Patient reading entry for BP, glucose, heart rate, weight, and SpO2; CHW entry on behalf of in-scope patients; provenance and recorded-time display.
4. Server-side configurable, clinician-approved classification; warning/critical alert creation, acknowledgement, and basic in-app alert feed.
5. Patient home/history and doctor risk-prioritized assigned-patient dashboard with missing/stale data clearly distinguished.
6. Offline app shell, locally queued reading and SOS submissions, idempotent synchronization, per-item status, retry controls, and clear online/sync indicators.
7. Patient SOS confirmation, server-side incident record when online, authorized care-team visibility, event timeline, and offline local queue plus device SMS-composer fallback. No guarantee of delivery or dispatch.
8. CHW village-scoped patient list, home-visit notes, in-scope alerts, and offline-capable reading entry.
9. Admin user/assignment management, versioned threshold configuration, and audit records for sensitive actions.
10. Baseline validation, secure transport/deployment configuration, error handling, critical automated tests, and privacy/consent notice.

### 7.2 Phase 2 — integrations and expanded workflows

1. SMS-provider integration for outbound notifications and inbound reading/SOS commands with signatures, rate limits, localized templates, and logs.
2. Web push and richer notification preferences, escalation schedules, reminders, and missed-reading/medication jobs.
3. Appointment scheduling, doctor availability, medications, adherence logs, and reminder workflows.
4. Nearby health-centre geospatial lookup and offline cached results.
5. PDF/CSV exports and administrative reports, with access controls and audit.
6. CHW visit planner, registration flow, and operational performance summary.
7. Landing-point management and map/status tools.
8. Mockable drone-mission request and tracking integration with approval and safety hooks. Actual aircraft operation, regulatory approval, weather/no-fly decisions, and delivery remain external and out of scope.
9. Expanded charts, report localization, optional voice assistance, and additional accessibility/usability enhancements.
10. Production integrations, monitoring, backup/restore, incident response, and deployment hardening as approved by the operating organization.

### 7.3 MVP exit criteria

- All MVP roles and protected workflows have automated authorization tests, including cross-patient denial cases.
- Clinically responsible reviewers approve the active thresholds, units, alert text, and escalation decisions before any live patient use.
- Online and offline reading/SOS flows pass integration tests for duplicate retries, partial failures, delayed synchronization, and missing location.
- English and Telugu essential-flow review is complete; no critical untranslated or misleading alert/SOS message remains.
- Privacy, consent, data retention, deployment security, monitoring, backup/restore, and operational escalation procedures are reviewed before production.

## 8. Risks and mitigations

| ID | Risk | Likelihood / impact | Mitigation and owner |
|---|---|---|---|
| R-01 | Illustrative or inappropriate thresholds lead to false reassurance, unnecessary escalation, or delayed care. | High / Critical | Clinical owner approves metric definitions, units, boundaries, and messages; version configuration; test all boundaries; label the product as non-diagnostic; never activate demo defaults for live care without sign-off. |
| R-02 | A user assumes an offline SOS or queued reading has reached a clinician. | High / Critical | Distinguish queued, submitted, acknowledged, and externally delivered states; show explicit confirmation/failure; offer the phone/SMS fallback and emergency number; conduct usability testing. |
| R-03 | Network, SMS, push, GPS, or provider failure delays an alert. | High / High | Treat channels as best-effort; expose provider outcomes; retry safely; provide alternate contact steps and operating procedures; do not represent an attempted notification as delivered. |
| R-04 | Unauthorized exposure of sensitive health or contact data, especially on shared devices or through weak role checks. | Medium / Critical | Enforce server-side least-privilege checks at every endpoint; minimize offline cache; clear account data on logout; protect tokens; audit access; penetration/security test; apply privacy review. |
| R-05 | Incorrect patient/CHW attribution, duplicate sync, or conflicting offline updates corrupts clinical history. | Medium / High | Use stable client IDs, idempotency, provenance, server receipt timestamps, per-item results, audit history, and conflict tests; keep correction workflows traceable. |
| R-06 | Poor measurement technique or incorrect user-entered values create misleading status. | High / High | Provide simple measurement guidance and units; validate plausible ranges without silently changing values; identify source and author; allow clinician review/correction with audit trail. |
| R-07 | Alert fatigue causes important events to be overlooked. | Medium / High | Clinician-approved deduplication and escalation; visible severity and trend/context; tune using monitored pilot feedback; measure acknowledgement time and false-alert rates. |
| R-08 | Telugu translation or localization changes clinical meaning or emergency instructions. | Medium / High | Use qualified human review for clinical/safety text; maintain controlled glossary; test rendered Telugu on target devices; fail safely to an approved fallback. |
| R-09 | GPS is missing, inaccurate, stale, or exposes a patient's location unnecessarily. | Medium / High | Make location optional and consent-aware; identify current vs saved location and capture time; minimize precision/retention; provide manual contact/location alternatives. |
| R-10 | SMS messages expose health details on shared phones or are spoofed/replayed. | Medium / High | Limit content to necessary information; verify provider signatures; rate-limit; validate sender and command; avoid secrets/PHI in logs; document consent and opt-out. |
| R-11 | Drone workflow creates an unsafe expectation or is mistaken for an actual approved dispatch. | Medium / Critical | Keep mock/provider boundary explicit; require authorized approval and verified point; add safety/no-fly/weather hooks; no real dispatch in MVP; require DGCA/regulatory, operator, and clinical approval before any live integration. |
| R-12 | Incomplete privacy/legal review or unclear consent/retention creates non-compliance. | Medium / Critical | Engage legal/privacy stakeholders before pilot; document purpose, consent, rights, retention/deletion, data processors, and breach response under applicable requirements including India's DPDP Act. |
| R-13 | Device loss, browser storage eviction, or shared-device access exposes or removes queued data. | Medium / High | Minimize local sensitive data, explain offline limitations, protect sessions, clear data on logout, provide sync status and recovery guidance; do not promise indefinite local retention. |
| R-14 | Poor connectivity and low-cost devices make core workflows too slow or inaccessible. | High / Medium | Test on representative devices and 2G-class profiles; cache essential shell; minimize payloads; use simple mobile UI; monitor measured targets and improve bottlenecks. |
| R-15 | Health-centre, contact, or landing-point reference data is outdated. | Medium / High | Assign data owners, record verification/effective dates, provide an expiry/review process, show stale status, and avoid treating a listed centre as available until confirmed. |
| R-16 | Service outage, inadequate backup, or failed restore loses health and audit data. | Low-Medium / Critical | Define recovery objectives, automate backups, test restoration, monitor database/service health, and document incident and rollback procedures before production. |

## 9. Data classification and audit expectations

- **Sensitive health data:** readings, diagnoses/conditions, allergies, medications, clinical notes, alerts, and SOS records.
- **Sensitive personal data:** phone, emergency contacts, precise location, identity, and account credentials/tokens.
- **Operational data:** assignments, delivery attempts, synchronization outcomes, access/audit events, health-centre and landing-point verification.
- Access to sensitive data shall be role- and patient-scoped, encrypted in transit, minimized in logs and offline caches, and retained only according to an approved policy.
- Audit events should include actor, action, target, timestamp, outcome, and relevant request correlation ID; they must not include password/token values or unnecessary full clinical payloads.
- Exported reports are sensitive copies and require explicit authorization, audit, and a documented retention/disposal policy.

## 10. Verification approach

1. **Unit tests:** vital validation/classifier boundary tests; alert deduplication; translation fallback; SMS parser when implemented; permission helpers.
2. **API integration tests:** authentication, role and ownership boundaries, patient assignment changes, reading create/list, alerts, notes, SOS, and sync idempotency/partial failure.
3. **Client tests:** language persistence, accessible forms, online/offline states, queued item visibility, retry behavior, and role-specific navigation.
4. **End-to-end tests:** patient register/login → record reading → alert visible to assigned doctor; CHW offline entry → reconnect → single synchronized record; offline SOS clearly remains unconfirmed and offers fallback.
5. **Security tests:** unauthorized cross-patient reads/writes, privilege escalation, token handling, rate limits, input validation, audit coverage, and sensitive-data leakage.
6. **Usability/accessibility tests:** Telugu and English workflows on small screens, low literacy/readability review, keyboard/focus and screen-reader checks, and non-color status cues.
7. **Operational tests:** representative low-bandwidth performance, provider outage behavior, backup restoration, logging/monitoring, and documented escalation runbooks.

## 11. Open decisions before production

- Clinician-approved thresholds, measurement protocol, alert recipients, response times, and escalation responsibilities.
- Consent wording, data controller/processor responsibilities, retention/deletion schedule, user rights, and legal/privacy assessment.
- Hosting region, availability and recovery targets, backup retention, incident response, and production access policy.
- SMS/push provider, consent/opt-out behavior, delivery and cost expectations, and approved message content.
- Which geospatial/health-centre dataset is authoritative and how availability is verified.
- Whether any drone integration will be pursued; if so, regulatory approvals, certified operators, safety governance, liability, and confirmed delivery-state source.
- Whether medication, appointment, report-export, and CHW performance features are approved for Phase 2 and who owns their clinical/operational governance.
