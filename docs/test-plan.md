# Manual Test Plan

## Test preparation

- Use a non-production environment with synthetic patient data and accounts for patient, doctor, CHW, and administrator roles.
- Verify that SMS and drone integrations use mock providers and that no real emergency, SMS, or aircraft services are contacted.
- Record build/version, browser/device, role, locale, connectivity conditions, and outcome for each run. Never include real patient data in screenshots or test evidence.

## Role-based workflows

### Patient

- Register with valid details and consent; verify duplicate phone, invalid phone, mismatched passwords, and missing consent errors.
- Sign in/out; verify session restore, expiry, and that role-restricted pages cannot be opened directly.
- Add each supported vital type; verify required/range validation, classification, history, chart summaries, and accessible data-table fallback.
- Review medications, appointments, alerts, reports, and nearby health centres; verify calling, map links, date ranges, and export/share behavior.

### Doctor

- Review risk-sorted patients, critical/warning alerts, missed readings, and appointments; exercise condition/village/status filters.
- Open a patient detail page and verify charts, history, medications, notes, timeline, and follow-up actions.
- Acknowledge and resolve an alert; verify updated status and audit event.
- Schedule/reschedule/cancel appointments; confirm unavailable or already-booked slots are rejected.

### Community health worker

- Verify assigned villages and patient scope; confirm access to other villages is denied.
- Search/scan a patient, enter readings, register a patient in an assigned village, record a GPS home visit, and trigger SOS on behalf of a patient.
- Complete a village visit checklist and verify weekly performance totals and village alerts.
- Add and submit a landing-point verification checklist and photo; verify the six-month reverification reminder.

### Administrator

- Manage accounts, role assignments, patient assignments, thresholds, centres, landing points, and drone missions.
- Review reports for village counts, weekly critical alerts, CHW activity, SOS response time, and simulated drone missions.
- Verify sensitive actions create audit events and that unauthenticated/unauthorized requests are denied.

## Network, offline, and recovery

- Use browser network throttling at slow 3G and high latency; verify loading, retry, and error states without duplicate submissions.
- Go offline before adding a reading, patient form, visit, and SOS. Verify queued state, client identifier, pending count, and no success claim that implies server receipt.
- Reconnect and verify each queued item syncs once; exercise transient failure, exponential retry, partial batch success, and duplicate replay.
- Reload or close/reopen while offline; verify cached screens, pending work, SOS SMS composer fallback, and sync metadata persist.
- Confirm conflict behavior for duplicate client IDs and server timestamp ordering.

## Emergency and drone safety (mock provider only)

- Confirm SOS requires the two-second hold and offers a cancellable countdown; check GPS success, denied/unavailable GPS fallback, duplicate trigger handling, and emergency call link `108`.
- Verify doctor, CHW, and emergency-contact notifications, nearest-centre list, full status timeline, and offline SMS composer.
- Request a simulated drone mission; verify no-fly, inactive/unverified landing-point, approval, weather-hook, abort, ETA, and contact-notification behavior.
- Ensure all labels and screens clearly indicate that real dispatch requires regulatory approval and that the integration is mocked in test.

## Telugu and accessibility

- Switch English/Telugu on login, registration, patient, doctor, CHW, admin, alert, SOS, SMS, and report screens; verify preference persistence and profile update.
- Inspect Telugu text wrapping, Noto Sans Telugu rendering, form errors, vital status, date/number formatting, and notifications at mobile widths.
- Navigate by keyboard and screen reader; verify visible focus, labels, error descriptions, live status announcements, skip link, and no keyboard traps.
- Test 200% zoom, large-text mode, high contrast, color-blind-safe chart distinctions, touch target size, and reduced-motion preference.

## Exit criteria

- No open critical/high defects in authentication, privacy, role isolation, readings, sync, or emergency workflows.
- Every failure is reproducible and recorded with sanitized evidence; defects involving real patient data are not copied into tickets or logs.
