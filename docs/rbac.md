# Role-based access control

The API is the security boundary. Client-side route guards and `usePermissions()`
exist to tailor navigation and controls; they do not grant access or replace
server-side checks.

## Permissions matrix

| Resource/action | Patient | Doctor | CHW | Admin |
|---|---|---|---|---|
| Read patient profile | Own profile only | Patients assigned to the doctor | Patients in assigned villages | All patients |
| Read patient health readings | Own readings only | Readings for assigned patients | Readings for patients in assigned villages | All readings |
| Create a health reading | Own profile only | Denied | Patients in assigned villages | Denied |
| Read a specific reading | Own patient record only | Assigned patient record only | Assigned-village patient record only | All records |
| Delete a health reading | Denied | Denied | Denied | Allowed with reason and audit event |
| Read another patient's data | Denied (`403 FORBIDDEN`) | Denied unless assigned | Denied unless village is assigned | Allowed |
| Change role assignments / manage users | Denied | Denied | Denied | Allowed |

## Server enforcement

- `authorize(...roles)` rejects unauthenticated or disallowed roles with
  `403 FORBIDDEN`.
- `canAccessPatient(user, patientId)` is the reusable patient-scope policy.
  Patient access matches the patient's `user` reference; doctor access matches
  the patient's `assignedDoctor` against the doctor's profile; CHW access
  matches village and any supplied mandal/district constraints against the
  CHW's assigned villages; admin access is unrestricted for valid patient IDs.
- Patient and reading detail/history routes are mounted behind authentication,
  the applicable role check, and `authorizePatient()`. A reading lookup also
  constrains the record query by both record ID and patient ID.
- Reading creation derives the author and source from the authenticated account.
  Batch synchronization applies validation and patient-scope checks separately
  to every item; client-supplied author/source/status fields are rejected.
- Unknown, malformed, or out-of-scope patient IDs do not disclose whether a
  patient exists; they are denied with `403 FORBIDDEN`.
- Any future endpoint that accepts a patient ID or returns patient-associated
  data must apply `authorizePatient()` (or an equivalent scoped database query)
  before returning or modifying that data. For collection queries, filter at
  the database level to the caller's assignment scope rather than fetching all
  patients and filtering in application memory.
- CHWs can create a profile only for an assigned village. The profile remains
  unlinked until its patient completes public registration with the same phone
  number; staff cannot set or recover a patient's password or claim an existing
  account based solely on phone number.
- Patient self-service updates are allow-listed separately from clinician/CHW
  updates. Doctor assignment/CHW assignment and deactivation are admin-only.
- Deactivation sets the patient profile inactive and disables the linked user,
  which causes access-token checks to fail and revokes refresh sessions.

## Client capabilities

`usePermissions()` exposes role-level UI capabilities such as `canViewPatients`,
`canRecordReadings`, `canManageAssignments`, and `canManageUsers`. These are
presentation hints only. The client cannot reliably determine a particular
patient assignment from the persisted user object; every patient-specific
request must be authorized by the API.
