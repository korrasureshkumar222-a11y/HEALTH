# Low-Fidelity Wireframes and UI Component Guide

## Chronic Disease Remote Monitoring

These wireframes define a mobile-first starting point for the React PWA. They are layout and interaction specifications, not final visual designs. Desktop layouts should expand the same content hierarchy rather than introducing essential mobile-only omissions.

### Design principles

- Target a 360 CSS-pixel mobile viewport and low-bandwidth Android devices.
- Use large, full-width primary actions and minimum 44×44 CSS-pixel touch targets; use 48px where practical.
- Pair icons with visible text on primary navigation and actions. Icons never carry meaning alone.
- Keep a persistent English / తెలుగు language control in the authenticated header.
- Make online/offline, last sync, pending actions, stale data, and errors visible.
- Never communicate vital status through color alone: include text labels and optional icons.
- Ask for confirmation before SOS or destructive administrative actions.
- Use plain language and clinician-reviewed translations for clinical and emergency messaging.
- Do not imply that an SMS, ambulance request, or drone mission succeeded until the result is confirmed.

## 1. Global shell and navigation

### Authenticated mobile shell

```text
+----------------------------------+
| Logo / Page title     EN | తెలుగు|
| [Offline]  3 pending  Sync status|
+----------------------------------+
|                                  |
|            Page content          |
|                                  |
+----------------------------------+
| Home | History | Help | Profile  |
| icon+text, 48px minimum targets  |
+----------------------------------+
```

- Patient navigation: Home, History, Help/SOS, Profile. Add Reading is a prominent home action.
- Doctor navigation: Dashboard, Patients, Alerts, Profile.
- CHW navigation: Village, Visits, Alerts, Profile.
- Admin navigation: Overview, Users, Operations, Reports, Profile.
- Use a responsive side navigation or top-level tabs on larger screens; retain text labels.
- Global sync indicator shows online/offline, pending count, last successful sync, and an actionable retry control. Do not show “synced” for queued/unconfirmed work.

## 2. Screen wireframes

### 2.1 Login / Register

**Purpose:** Authenticate a returning user or register a patient. Public registration must not offer privileged roles.

```text
+----------------------------------+
| Logo                      EN | తెలుగు|
|                                  |
|       Sign in / Create account   |
| [Phone number                 ]  |
| [Password                     ]  |
| [Show password]                 |
| [        Sign in              ]  |
| Forgot password?                |
|                                  |
| New here? [Register as patient] |
| Privacy & consent information   |
+----------------------------------+
```

- **Elements:** Phone and password inputs, show/hide password, validation text, submit/loading state, patient-only registration link, language toggle, privacy/consent notice, accessible error summary.
- **Navigation:** Successful sign-in routes by role to Patient Home, Doctor Dashboard, CHW Home, or Admin. Registration opens patient form then patient home. Forgot-password flow is shown only when implemented.
- **States:**

| State | Presentation |
|---|---|
| Loading | Keep fields visible; disable duplicate submit; show “Signing in…” and a progress indicator. |
| Empty | Initial form with labels, examples, and no prefilled credentials. |
| Error | Inline field errors for validation; generic authentication error for invalid credentials; provide retry without exposing account existence. |
| Offline | Explain that sign-in requires a connection unless a valid existing session is supported; do not imply credentials were accepted. |

### 2.2 Patient Home

**Purpose:** Give the patient a quick overview of their readings and next steps, with a highly visible SOS entry point.

```text
+----------------------------------+
| Home                    EN | తెలుగు|
| Online / Offline · sync status   |
|                                  |
| Hello, Lakshmi                   |
| Last updated: Today, 9:10 AM     |
| [ + Add a reading             ] |
|                                  |
| Latest readings                  |
| [BP  128/82 mmHg   Normal      ] |
| [Sugar  --         No reading  ] |
| [Heart 78 bpm      Normal      ] |
| [SpO2  97%         Normal      ] |
|                                  |
| [      SOS — Get help          ] |
|                                  |
| Next appointment                 |
| Dr. Rao · Date/time · [Details]  |
+----------------------------------+
| Home | History | Help | Profile  |
+----------------------------------+
```

- **Elements:** Greeting, last update/staleness label, add-reading action, latest vital cards with units/time/status, prominent SOS action, next appointment, unread alerts, nearest health-centre summary when available, sync state.
- **Navigation:** Add Reading, Charts/History, Medications, Appointments, Nearby Health Centres, SOS Status, Profile.
- **States:**

| State | Presentation |
|---|---|
| Loading | Skeleton cards with stable dimensions; keep SOS available after initial shell renders. |
| Empty | Explain that no readings exist yet; show “Add your first reading” and setup guidance. |
| Error | Preserve cached data with its timestamp; show retry and avoid showing cached values as current. |
| Offline | Show offline banner, cached-data time, and queued count. Add-reading and SOS actions remain available if locally supported; identify SOS as not server-confirmed. |

### 2.3 Add Reading

**Purpose:** Enter one measurement with clear units, context, and recorded time.

```text
+----------------------------------+
| < Back     Add reading  EN | తెలుగు|
| [Blood pressure] [Sugar] [More]  |
|                                  |
| Systolic (mmHg) [             ] |
| Diastolic (mmHg)[             ] |
| Date and time    [Now          ] |
| Note (optional)  [             ] |
|                                  |
| Status preview: Not classified  |
| [      Save reading           ] |
| Offline? Saved locally / Pending |
+----------------------------------+
```

- **Elements:** Reading-type selector for BP, sugar, heart rate, weight, SpO2 (and temperature if enabled); type-specific numeric inputs; unit labels; glucose context where applicable; recorded-at field; optional note; non-color status preview; submit action and sync result.
- **Navigation:** Back to Patient Home or CHW Home; successful save opens confirmation and optionally Reading History.
- **States:**

| State | Presentation |
|---|---|
| Loading | Disable submit during save; retain entered values and show progress. |
| Empty | Show selected type and clear input labels/hints; no default clinical value prefilled. |
| Error | Identify invalid/missing fields and retain form values; distinguish validation failure from server failure. |
| Offline | Save only after local validation; show “Saved on this device—not sent yet,” pending state, and sync retry path. |

### 2.4 Charts / History

**Purpose:** Review readings over time and distinguish missing, delayed, and current measurements.

```text
+----------------------------------+
| < Back    History     EN | తెలుగు |
| [BP] [Sugar] [Heart] [SpO2]      |
| [7 days] [30 days] [90 days]     |
|                                  |
| Reading trend chart              |
| (labelled axes + range legend)   |
|                                  |
| Average / High / Low             |
|                                  |
| Recent records                   |
| Date/time | Value | Status       |
| ...                              |
| [Table view]                     |
+----------------------------------+
```

- **Elements:** Type and date-range selectors, chart with labeled axes/units, text labels for status, summary statistics, accessible table alternative, record source/time, pagination.
- **Navigation:** Back to role home; select a record for detail when authorized; add-reading shortcut for patient/CHW.
- **States:**

| State | Presentation |
|---|---|
| Loading | Chart/table skeleton and selected filters retained. |
| Empty | Explain no data for selected range; offer a wider range or Add Reading if permitted. |
| Error | Keep filters; show retry and table fallback only if data is available locally. |
| Offline | Display cached history with “Last synced” timestamp; clearly mark that newer readings may not appear. |

### 2.5 Medications (Phase 2)

**Purpose:** Let patients review current prescriptions and optionally record adherence without changing prescribed instructions.

```text
+----------------------------------+
| < Back   Medications  EN | తెలుగు |
| Today · Date                      |
|                                  |
| Medicine name                    |
| Dose · instructions               |
| [ Mark as taken ]  [Skip / Help]  |
| Scheduled time · status           |
|                                  |
| Past doses / prescription details |
+----------------------------------+
```

- **Elements:** Active prescription cards, name/dose/frequency/timing, clinician instructions, adherence action and timestamp, prescribing clinician, history, safety note to contact clinician rather than alter a dose.
- **Navigation:** Patient Home, appointment details, contact/help information. Doctors enter this view via Patient Detail.
- **States:**

| State | Presentation |
|---|---|
| Loading | Skeleton medication cards; actions disabled until prescription data loads. |
| Empty | “No active medications listed”; advise consulting the care team before starting/stopping medication. |
| Error | Show retry and preserve any cached prescription with last-updated time. |
| Offline | Allow an adherence action to queue with a visible pending state; do not alter prescription details offline. |

### 2.6 Appointments (Phase 2)

**Purpose:** View upcoming/past appointments and request or manage a booking where enabled.

```text
+----------------------------------+
| < Back  Appointments  EN | తెలుగు |
| [Upcoming] [Past]                |
|                                  |
| Dr. Rao · In person              |
| Date / time · Health centre      |
| [Details] [Call clinic]          |
|                                  |
| [Request appointment]            |
+----------------------------------+
```

- **Elements:** Upcoming/past filters, appointment card with clinician, local date/time, mode and location, status, reminder details, request/reschedule/cancel actions according to role and state.
- **Navigation:** Patient Home, Nearby Health Centres for in-person appointments, doctor schedule and patient detail for staff.
- **States:**

| State | Presentation |
|---|---|
| Loading | Appointment list skeleton and disabled booking action until availability is confirmed. |
| Empty | Explain no appointments and offer booking if the workflow is enabled. |
| Error | Show retry; do not show an unconfirmed booking as confirmed. |
| Offline | Show cached appointments with last sync; new requests remain clearly pending and require server confirmation. |

### 2.7 Nearby Health Centres

**Purpose:** Find contact information for nearby health centres and available services.

```text
+----------------------------------+
| Nearby centres       EN | తెలుగు |
| Find care near your location     |
| Type: [All centres          v]   |
|                                  |
| PHC Name · 2.4 km                |
| PHC · Address · 24 hours         |
| Services                         |
| [Call] [Open map]                |
|                                  |
| CHC Name · 8.1 km                |
| CHC · Address                    |
| [Call] [Open map]                |
+----------------------------------+
```

- **Elements:** List-first results, centre-type filter, distance, centre type, address, phone/call, services, 24-hour indicator, and saved-results timestamp while offline.
- **Navigation:** Patient navigation bar or Patient Home. `geo:` links open the device's map application; preserve the accessible list as the in-app alternative.
- **States:**

| State | Presentation |
|---|---|
| Loading | Show a loading panel while requesting location and nearby results. |
| Empty | Explain that no nearby centres were found. |
| Error | Explain that location permission or the lookup failed; offer a location retry. |
| Offline | Show cached results for the approximate location and selected type with the save time; otherwise explain that location/network is required. |

### 2.8 Doctor Dashboard

**Purpose:** Help doctors prioritize follow-up for assigned patients, with current alerts and transparent stale-data status.

```text
+----------------------------------+
| Dashboard               EN | తెలుగు|
| Critical 3 | Warnings 8 | Due 12 |
| [Village v] [Condition v] [Risk] |
|                                  |
| Alerts                           |
| Critical · Patient A · 10:05     |
| [Review] [Acknowledge]           |
|                                  |
| Assigned patients · Risk order  |
| Patient B · Critical · 10:05     |
| Patient C · Warning · Yesterday  |
| Patient D · No recent reading    |
+----------------------------------+
| Dashboard | Patients | Alerts    |
+----------------------------------+
```

- **Elements:** Role header, counts, village/condition/status filters, alert feed, risk-ordered patient rows, last-reading time, latest status labels, call/detail shortcuts, pagination/refresh.
- **Navigation:** Patient Detail, Alerts list, appointment/scheduling flow, dashboard. Only currently assigned patients appear.
- **States:**

| State | Presentation |
|---|---|
| Loading | Summary and list skeletons; avoid displaying fabricated zero counts. |
| Empty | Explain no assigned patients/alerts for the selected filters; offer clear-filter control. |
| Error | Keep last successful data with timestamp and stale warning; provide retry. |
| Offline | Show cached queue as stale, disable actions requiring server confirmation, and never imply live alerts are current. |

### 2.9 Patient Detail (Doctor)

**Purpose:** Give an assigned doctor a focused view of one patient's monitoring history and follow-up context.

```text
+----------------------------------+
| < Patients  Patient detail EN | తెలుగు|
| Name · Age · Village · assigned  |
| Last reading: time/source        |
| [Call] [Add note] [Appointment]  |
|                                  |
| Open alerts                      |
| Latest readings / mini trends    |
| [View history]                   |
| Medications (Phase 2)            |
| Notes · visits · SOS timeline    |
+----------------------------------+
```

- **Elements:** Minimum necessary profile, care-team assignment, latest readings/source/time, alerts and acknowledgement state, chart links, notes/visit history, medication section when enabled, appointment action.
- **Navigation:** Doctor Dashboard/Patients, full reading history, alert detail, note editor, appointment workflow, SOS Status.
- **States:**

| State | Presentation |
|---|---|
| Loading | Profile skeleton; do not expose partial unrelated data. |
| Empty | Explain missing profile/readings/notes independently; allow authorized follow-up actions. |
| Error | Show not-found/permission errors without revealing whether an inaccessible patient exists; retry for service errors. |
| Offline | Show cached information only with capture time and stale badge; disable clinical updates that cannot be safely confirmed. |

### 2.10 CHW Home

**Purpose:** Support village-level work, rapid on-behalf-of reading entry, visits, and synchronization in intermittent connectivity.

```text
+----------------------------------+
| Village work            EN | తెలుగు|
| [OFFLINE]  4 pending  [Sync now] |
| Last sync: Today 8:40 AM         |
| [Village v] [Search patient   ]  |
|                                  |
| Today's follow-up                |
| Patient A · reading due          |
| [Add reading] [Record visit]     |
| Patient B · open alert           |
| [View alert] [Start SOS]         |
+----------------------------------+
| Village | Visits | Alerts | Me   |
+----------------------------------+
```

- **Elements:** Offline badge, pending count, last-sync time, manual sync control, assigned-village picker, scoped patient search, due tasks, quick-add reading, visit action, village alerts, initiate SOS on behalf of in-scope patient.
- **Navigation:** Reading entry, visit form, patient detail (scope-limited), alerts, SOS Status, sync queue.
- **States:**

| State | Presentation |
|---|---|
| Loading | Keep offline/sync status shell visible while patient list loads. |
| Empty | Explain no assigned patients/tasks and provide an admin/contact route for assignment issues. |
| Error | Show last successful list if cached, error reason, retry, and avoid silently broadening scope. |
| Offline | Show assigned cached patients and pending actions; mark list freshness; queue supported entries; show per-item sync outcome and retry. |

### 2.11 SOS Status

**Purpose:** Confirm what the app has recorded and show a truthful timeline of confirmed response steps.

```text
+----------------------------------+
| < Back     SOS status EN | తెలుగు |
| Request: Submitted / Pending     |
| Location: GPS / Saved / Unknown  |
|                                  |
| ● SOS created          10:05     |
| ● Alert sent*          10:05     |
| ○ Doctor notified      Pending   |
| ○ CHW notified         Pending   |
| ○ Ambulance requested  Not set   |
| ○ Drone mission        Not set   |
|                                  |
| [Call 108] [Call contact]        |
| *Only when delivery confirmed    |
+----------------------------------+
```

- **Elements:** Incident state, incident time and ID, location source, append-only status timeline, timestamp and source for each confirmed event, call 108 action, emergency-contact action where consented, cancel/resolve state when permitted.
- **Navigation:** Return to Patient Home/CHW Home; open incident detail; one-tap call leaves app using device dialer.
- **States:**

| State | Presentation |
|---|---|
| Loading | Show “Checking request status”; preserve locally queued state. |
| Empty | Explain that no SOS incident exists; offer return to home and SOS action. |
| Error | Show last confirmed status and timestamp; say status could not be refreshed. |
| Offline | Prominent “Not sent to care team yet” for locally queued requests; show SMS composer fallback and call 108. Never show “alert sent” without confirmation. |

### 2.12 Admin

**Purpose:** Provide administrative controls for users, assignments, approved thresholds, health centres, landing points, and drone-mission records.

```text
+----------------------------------+
| Admin                   EN | తెలుగు|
| [Users] [Thresholds]             |
| [Health centres] [Landing points]|
| [Drone missions]                 |
|                                  |
| Selected section                 |
| Search / filters                 |
| Table rows with status           |
| [Add / Edit] [View audit]        |
|                                  |
| Save requires confirmation       |
+----------------------------------+
```

- **Elements:** Section navigation, search, filters, paginated tables/cards, create/edit forms, active/verified status, threshold version and approval metadata, audit trail, confirmation modals, explicit warning for operational drone statuses.
- **Navigation:** Users and assignments, threshold configuration, health-centre management, landing-point verification, drone mission list/detail, audit logs, reports.
- **States:**

| State | Presentation |
|---|---|
| Loading | Section-specific skeleton; disable mutations until permissions and record data load. |
| Empty | Explain no records; show create action only to authorized roles. |
| Error | Preserve form input; show field-level validation or service error; never report a failed save as success. |
| Offline | Read-only cached data only if appropriate; disable administrative mutations and explain they require server confirmation. |

**Safety/permissions:** Hide unauthorized sections; enforce permissions in the API regardless of UI. Threshold changes require clinician-approved configuration and audit. Landing points require verification before active use. Drone mission status must be clearly marked simulated unless a separately approved integration confirms otherwise.

### 2.13 Reports

**Purpose:** Generate or review authorized patient summaries, reading exports, and administrative aggregate reports.

```text
+----------------------------------+
| < Back      Reports    EN | తెలుగు|
| Report type [Patient summary v]  |
| Patient / scope [Select       ]  |
| Date range [From] — [To]         |
| Format [PDF] [CSV]               |
| [Preview report]                 |
|                                  |
| Scope and generated-at details   |
| [Download] [Share]               |
+----------------------------------+
```

- **Elements:** Report type and date range, patient selector constrained by role, preview/summary, output format, generated time, data scope, download action, privacy warning.
- **Navigation:** Patient Detail for patient-specific reports; Admin for aggregate reports; return to originating page.
- **States:**

| State | Presentation |
|---|---|
| Loading | Progress indicator and selected parameters; prevent duplicate generation. |
| Empty | Explain there is no data for the selected range; allow range adjustment. |
| Error | Preserve selection; show retry and avoid issuing invalid/expired links as successful downloads. |
| Offline | Explain reports require server data; offer previously downloaded file only if safely available and clearly timestamped. |

## 3. Shared component inventory

| Component | Responsibility |
|---|---|
| `AppShell` | Role-aware navigation, responsive layout, safe route boundaries. |
| `AppHeader` | Page title, language toggle, account menu, connection state. |
| `LanguageToggle` | English/Telugu choice with accessible selected-state announcement. |
| `ConnectivityBanner` | Online/offline status, stale-data note, connection-independent guidance. |
| `SyncStatus` | Pending count, last successful sync, manual sync, per-item outcomes. |
| `PrimaryButton` | Consistent large touch target, loading/disabled state, text label. |
| `StatusBadge` | Text plus icon/shape; never color only. |
| `VitalCard` | Reading value, unit, recorded time/source, status, stale state. |
| `ReadingForm` | Type-specific validated form, units/context, local/server save result. |
| `ReadingHistoryTable` | Accessible table/list alternative to charts. |
| `TrendChart` | Responsive chart with labeled axes, range legend, data table fallback. |
| `AlertCard` | Type/severity, patient/time, current status, authorized actions. |
| `PatientSummaryCard` | Scope-limited patient identity and latest data. |
| `Timeline` | Append-only event sequence with event source and timestamp. |
| `EmptyState` | Clear explanation and relevant next action. |
| `ErrorState` | Safe error, retry where appropriate, preserved user input. |
| `LoadingSkeleton` | Stable layout placeholder with accessible loading announcement. |
| `ConfirmDialog` | Confirm sensitive actions, especially SOS and administrative changes. |
| `FormField` | Label, hint, validation message, input association and focus state. |
| `AccessibleTable` | Semantic column headers and responsive row presentation. |

## 4. Proposed Tailwind color palette

Use neutral backgrounds and dark text by default. Semantic status colors below are selected so the **dark foreground text on the pale background** and **white text on the dark fill** exceed WCAG AA 4.5:1 for normal text. Verify contrast after applying opacity, borders, hover states, and actual font sizes in the shipped UI.

| Token | Hex | Suggested use |
|---|---|---|
| `canvas` | `#F8FAFC` | App background |
| `surface` | `#FFFFFF` | Cards and forms |
| `ink` | `#0F172A` | Primary body text |
| `muted` | `#475569` | Secondary text (on white/light surfaces) |
| `border` | `#CBD5E1` | Dividers and control borders |
| `brand` | `#1D4ED8` | Primary navigation/action fill; use white text |
| `brand-dark` | `#1E3A8A` | Focus/pressed or darker brand fill; use white text |
| `focus` | `#1D4ED8` | Visible focus ring, with offset against surface |
| `success` | `#166534` | Green action/status fill; use white text |
| `success-bg` | `#DCFCE7` | Success background; use `#14532D` text |
| `success-ink` | `#14532D` | Success foreground on pale green |
| `warning` | `#92400E` | Amber action/status fill; use white text |
| `warning-bg` | `#FEF3C7` | Warning background; use `#78350F` text |
| `warning-ink` | `#78350F` | Warning foreground on pale amber |
| `critical` | `#B91C1C` | Red action/status fill; use white text |
| `critical-bg` | `#FEE2E2` | Critical background; use `#7F1D1D` text |
| `critical-ink` | `#7F1D1D` | Critical foreground on pale red |
| `info-bg` | `#DBEAFE` | Informational background; use `#1E3A8A` text |
| `info-ink` | `#1E3A8A` | Informational foreground on pale blue |

### 4.1 Tailwind configuration sketch

```js
// tailwind.config.js
export default {
  theme: {
    extend: {
      colors: {
        canvas: "#F8FAFC",
        surface: "#FFFFFF",
        ink: "#0F172A",
        muted: "#475569",
        border: "#CBD5E1",
        brand: "#1D4ED8",
        "brand-dark": "#1E3A8A",
        focus: "#1D4ED8",
        success: "#166534",
        "success-bg": "#DCFCE7",
        "success-ink": "#14532D",
        warning: "#92400E",
        "warning-bg": "#FEF3C7",
        "warning-ink": "#78350F",
        critical: "#B91C1C",
        "critical-bg": "#FEE2E2",
        "critical-ink": "#7F1D1D",
        "info-bg": "#DBEAFE",
        "info-ink": "#1E3A8A"
      }
    }
  }
};
```

### 4.2 Status treatment

- **Normal:** “Normal” text + check/neutral icon, green foreground/background. Do not imply that normal classification guarantees health.
- **Warning:** “Review” or clinician-approved warning label + warning icon, amber foreground/background.
- **Critical:** Clinician-approved urgent label + alert icon and clear next-step text. Do not make clinical advice beyond approved messaging.
- **Pending/offline:** “Pending sync” or “Not sent yet” with a cloud/offline icon and explanatory text. Do not use green success styling.
- **Focus:** Provide a visible 2px focus indicator with offset. Never remove keyboard focus styling.

## 5. Responsive and interaction requirements

- At narrow widths, stack cards and form fields; do not require horizontal scrolling for primary workflows.
- On larger screens, use a centered content column for patient flows and split panes for staff dashboard/detail views.
- Use a sticky bottom action only when it does not obscure content or focus; respect safe areas and keyboard appearance.
- Announce async save, sync, and error results to assistive technology using polite live regions; urgent changes must not rely only on toast messages.
- Preserve entered data after recoverable network errors. Clearly distinguish local save, server acceptance, notification delivery, and human acknowledgement.
- Confirm before initiating SOS; provide a quick cancel path before submission but do not obscure the confirmed action.
- Make offline-unsupported controls disabled with an explanatory reason rather than allowing a silent failure.

## 6. Review checklist

- [ ] All 13 requested screens include purpose, elements, navigation, and loading/empty/error/offline behavior.
- [ ] Primary actions and icon controls have visible text labels and touch targets of at least 44×44 CSS pixels.
- [ ] Telugu strings fit without clipping at mobile widths and have been reviewed by a fluent speaker.
- [ ] Status, chart data, and actions are understandable without color.
- [ ] Contrast is verified in rendered UI for text, controls, focus indicators, and disabled states.
- [ ] SOS and emergency-related text distinguishes local queue, server receipt, notification delivery, and response confirmation.
- [ ] Access control and patient scope are enforced server-side, not merely by hiding interface elements.
