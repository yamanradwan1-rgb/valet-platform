# Dashboard #342 / #344 / #346 — implementation boundary

Owner authorization: supplied implementation directive, 26 October 2026 (Asia/Amman).
Base: `90aa90a89593df95b8fd6e41f7d6c97bb42284a4` (`origin/main`).

The Dashboard shell, navigation, layout, styles, geometry, themes and responsive
rules are frozen. Authorized changes are readiness feedback in the existing zone
form, one contextual lifecycle action, and read-only facts inside Shift Details.

## Domain and authority

- #344 changes presentation only. Persisted Company defaults and Location
  overrides resolve Start and End independently. After a rejected zone write,
  matching server policy/zone snapshots must prove the sole usable active zone,
  strict effective policy, unchanged zone revision and a disable-only change.
  Missing, changing or inconsistent evidence falls back to general guidance.
  No readiness, MFA, policy, CAS or attendance-rule changes.
- #346 changes only Location.accepting_intake and its lifecycle version. It uses
  the same Company Admin, exact tenant/Location, active membership/session,
  entitlement and five-minute MFA boundary as Stop Intake (DEC-078/080/094).
  Existing lifecycle locking serializes Stop, Resume and Deactivate. The SQL
  command rechecks authority/status/CAS and appends LOCATION_INTAKE_RESUMED in
  the same transaction. Repeated open state is a no-op; stale closed state
  conflicts. Active Shifts are deliberately not drain blockers for Resume.
  One forward migration adds the narrow function and protects the audit event;
  runtime gains EXECUTE only, never general Location UPDATE or audit helper access.
- #342 uses existing financial authority, not the permission to list Shifts:
  DEC-051 grants Location Managers supported Location financial authority,
  DEC-052 establishes immutable Shift close reconciliation evidence, DEC-060
  authorizes financial reads of these persisted snapshots, and DEC-080 grants
  MFA-backed Company Admin reporting. Exact-Location financial authorization is
  checked server-side for details only. No new financial role, operational cash
  mutation permission, or MFA rule is introduced. DEC-081's original T05-E list
  projection remains identity/status/time only. Detail adds an optional projection requested with
  `?includeCashReconciliation=true`; default detail responses remain unchanged; old clients and list payloads do not gain cash fields.
  No cash recomputation, edits, audit reconstruction, settlement or POS behavior.

Affected entities: Location, Shift, OrganizationMembership and AuditEvent.
No ValetSession, Task, Dispatch, custody, key, Payment or CashEntry transitions.
Presence configuration retains Company-default / Location-override precedence.
These are Owner-authorized MVP management changes; no Native/Customer work.
No new indexes or row constraints are needed. #346 adds only a function and an
extension of the existing lifecycle audit trigger, with explicit runtime grants.

## Structure

Extract lifecycle authorization from the near-300-line service into a focused
module. Keep Resume interaction and cash presentation in focused components.
Reuse existing buttons, FocusDialog, sensitive mutation/MFA flow and fact styles.
All authored files must remain within the existing 300-line policy.

## Verification and UI inventory

See RESULTS.md for executed checks and limitations. Only synthetic local data is
used; no production connection, deployment, PR, merge or issue closure is allowed.
