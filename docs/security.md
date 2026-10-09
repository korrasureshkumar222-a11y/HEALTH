# Security and Health-Data Privacy Checklist

This checklist describes application controls and production work still required. It is
an engineering aid, not a security certification or legal opinion. Have the deployment,
clinical, privacy, and legal owners approve the operational controls and retention
periods before storing real health data.

### Dependency findings observed during this pass

The server dependency audit reported 19 moderate findings in the Jest development-tool
dependency chain (`sprintf-js`); the client audit reported two moderate React Router
advisories for version 6.30.6 (including a redirect issue). The SSR hydration advisory
is not applicable to the current client-rendered SPA, but the redirect advisory still
needs review. The high-severity nodemon/chokidar path was removed by switching the
development script to Node's built-in watch mode. These moderate findings remain
visible in `npm audit`; the scripts intentionally fail only for high-severity findings.
Review them before production and validate any major router/test-toolchain upgrade.

## OWASP Top 10 (2021) review

| Area | Application controls | Deployment / verification checklist |
| --- | --- | --- |
| A01 Broken Access Control | Authenticated routes use role authorization; patient and CHW scopes are checked in services; sensitive views and changes are audited. | Test every role against every patient-scoped route, including object-ID substitution. Review staff assignments on a schedule. |
| A02 Cryptographic Failures | Passwords use bcrypt with a minimum cost of 12; access/refresh tokens are signed separately; refresh tokens rotate; emergency contacts use AES-256-GCM. | Provide independent high-entropy JWT secrets and a base64-encoded 32-byte `PII_ENCRYPTION_KEY` from a secret manager. Back up and test key recovery/rotation. Require TLS at the public edge and database encryption at rest. |
| A03 Injection | Mongoose query input sanitization, HPP, request size limits, strict Zod route schemas, and HTML sanitization are enabled. The signed inbound-SMS body is deliberately not rewritten before provider-signature validation. | Keep validators strict and test malformed, duplicate, and operator-shaped inputs. Do not interpolate user content into queries or shell commands. |
| A04 Insecure Design | SOS, drone approval, and role-specific workflows separate request from approval; drone integrations are mockable. | Complete threat models for emergency escalation, offline queues, account recovery, exports, and third-party integrations before launch. Real-world drone operations are not authorized by this software. |
| A05 Security Misconfiguration | Helmet CSP, exact-origin CORS, HTTPS redirect, disabled `X-Powered-By`, and configurable proxy trust are set. | Configure `TRUST_PROXY` to the exact trusted proxy-hop count and set `COOKIE_SECURE=true` in production. Confirm the first `CORS_ORIGIN` is the canonical HTTPS API origin used by redirects. Review CSP against deployed assets; do not add broad wildcards to make resources load. |
| A06 Vulnerable and Outdated Components | `npm run security:audit` in `server/` and `client/` runs the npm audit gate for high-severity findings. | Run both audits in CI for every lockfile change, review advisories and transitive paths, and update dependencies deliberately. An audit result is not a substitute for code review. |
| A07 Identification and Authentication Failures | Login and registration have separate rate limits; repeated failures lock accounts; passwords require at least 12 characters, no more than 72 UTF-8 bytes, and ASCII letters plus digits; refresh rotation reuse revokes sessions. | Add MFA for privileged staff, monitor lockout and reuse events, set rate limits for expected traffic, and test recovery and session revocation procedures. |
| A08 Software and Data Integrity Failures | Request payloads are validated; webhook signatures are verified; audit records capture sensitive actions. | Pin and review dependencies, protect CI credentials, require reviewed releases, and test signed webhook replay/tampering handling. |
| A09 Security Logging and Monitoring Failures | Login, logout, password change, token reuse, role changes, sensitive data views, and exports produce audit events. Unknown login identifiers are stored as keyed HMACs, not plaintext. | Send security logs to access-controlled, tamper-resistant monitoring; alert on repeated failures, token reuse, unusual exports, and privilege changes. Never log passwords, tokens, raw emergency contacts, or SMS message bodies unnecessarily. |
| A10 Server-Side Request Forgery | No user-provided URL is intended to be fetched by the API. | Keep outbound provider URLs administrator-controlled and allowlisted. Apply network egress restrictions and validate URLs again if new integrations are added. |

## Health-data privacy checklist

- [ ] Give patients a clear, localized notice explaining what health and location data is
  collected, the purposes, recipients, retention, contact channel, and any optional use.
- [ ] Record affirmative, versioned consent before onboarding; support withdrawal and
  document the operational process for access, correction, deletion, and grievances.
- [ ] Collect only clinically and operationally necessary fields. Restrict location,
  emergency contact, readings, notes, and export access by role and patient assignment.
- [ ] Obtain appropriate authorization before sharing health data with clinicians,
  CHWs, SMS providers, hosting providers, or emergency contacts; review processor
  contracts and cross-border data flows.
- [ ] Encrypt transport and storage; keep JWT, PII, SMS-provider, and drone-provider
  secrets in a managed secret store. Restrict access, rotate keys, and rehearse recovery.
- [ ] Use synthetic or de-identified data in development and tests. Restrict production
  support access and record any exceptional access with a reason.
- [ ] Define incident triage, containment, evidence preservation, affected-person
  communications, and applicable regulator-notification procedures before launch.
- [ ] Review India DPDP Act applicability, rules, commencement dates, lawful basis,
  notice/consent language, data-principal rights, children's data, processor duties,
  breach handling, and grievance contacts with qualified counsel. This checklist does
  not assert compliance or interpret legal requirements.

## Retention and deletion

No statutory clinical-record retention duration is assumed here. Before production,
clinical leadership and counsel must approve a configurable schedule for:

| Data | Required decision |
| --- | --- |
| Health readings, notes, appointments, and SOS incidents | Clinical record retention, legal holds, withdrawal/deletion handling, and archival access |
| SMS logs and OTP/security events | Minimum troubleshooting/security window, masking, and deletion schedule |
| Audit logs | Investigation and accountability window, restricted access, and tamper-evident archival |
| Refresh tokens | Expired tokens are pruned daily; revoked tokens are retained until expiry for replay detection |
| Backups and offline/device caches | Expiry, purge propagation, lost-device response, and restore-time deletion behavior |

The daily refresh-token cleanup is implemented as a scheduled job. Other data cleanup,
backup expiry, offline-device purge, and archival jobs must not be treated as complete
until configured and verified in the deployment environment.

## Key setup and data migration

Generate a unique 32-byte AES key and store its base64 value only in the deployment
secret manager (or a local, untracked `.env` for development):

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Set `PII_ENCRYPTION_KEY` to that value. Production startup refuses to run without it.
Development can derive a fallback key from the access-token secret, but that fallback
must never be used for production. Back up the key separately from database backups:
loss of the key makes encrypted emergency contacts unreadable.

For an existing database, deploy the key first and run the explicit migration:

```powershell
cd server
npm run encrypt:patient-pii
```

The migration is idempotent and encrypts existing plaintext emergency contacts. Verify
the migration count and a controlled decrypt/read before serving production traffic.
Changing the encryption key requires a planned re-encryption migration; do not simply
replace the key.

## Release verification

- [ ] Run `npm test` and `npm run lint` in `server/`, client tests/build, and translation
  validation in CI.
- [ ] Run `npm run security:audit` in both `server/` and `client/`; triage any failure before release.
- [ ] Verify production uses HTTPS, the intended CORS allowlist, secure cookies, trusted
  proxy hops, secret-manager values, and a non-mock SMS provider configuration.
- [ ] Exercise RBAC denials, request validation, rate limits, sanitization, webhook
  signatures, encrypted-field reads, audit events, token reuse, and data exports.
- [ ] Confirm clinical thresholds, alert/escalation contacts, consent text, retention,
  incident response, and privacy notice with their accountable owners.
