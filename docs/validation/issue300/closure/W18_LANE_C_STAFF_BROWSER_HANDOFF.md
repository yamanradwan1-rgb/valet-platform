# Issue300 R2 Lane C — four real Staff identities / signed browser handoff

**Status: SOURCE-ONLY PREPARED; LIVE AUTH/MFA, SIGNED HTTP AND 34 BROWSER CASES NOT RUN.**
This branch begins at exact `0dc7d55e7b34cc598dddbce00a64babc0ff42e14`.
It adds only bounded test planning, independent identity/grant oracles and
offline negative tests. No fixture, account, MFA factor, cookie, signed
attestation or domain-writer event has been issued by this branch.

**Owner final exception (2026-10-20):** Owner signing is an
**OWNER-ACCEPTED SIGNING EXCEPTION — NOT CRYPTOGRAPHICALLY VERIFIED**,
**not PASS**, for ordinary isolated functional engineering. It does not
unlock or waive the existing W10/W13/W7 proof verifiers or the 34
Playwright cases: those remain genuinely signed-proof-only. Separately
owned, non-production ordinary PG/API/auth/UI tests may be reported as
**LOCAL VERIFIED ONLY**, never Issue300 acceptance. Do not forge/replace
an Owner signature, weaken a verifier, reuse human credentials, or enable
`VAYLET_LOCAL_DISABLE_MFA` to manufacture assurance.

## Target identity and irreversible-operation gate

The sole candidate resources are W10/W13-owned PG17.10
`127.0.0.1:58387/issue300_r2_w7_acceptance_v2`, migration role
`issue300_r2_w7_owner_v2`, runtime role `issue300_r2_w7_runtime_v2`,
container `issue300_r2_w7_acceptance_v2_pg17`, label
`com.vaylet.task=issue300-r2-w7-acceptance-v2` and volume
`issue300_r2_w7_acceptance_v2_pgdata`. APIs `127.0.0.1:3167`
(signed enabled) and `:3168` (default fail-closed), dashboard `:3117`
(same-origin `/v1/staff/*` rewrite to signed API). No runtime until
**actual Owner Ed25519 root enrollment**, real Owner-signed lease,
four resource admission samples, independently owned Docker/PG startup
identity, full 96-migration ledger and inspected actual Owner attestation.
The earlier human `:57285/:3165/:3114` resources and old sessions are
out of scope. Do not issue credentials into an unsigned fixture.

Run only safe source verification now:

```powershell
node --test scripts/issue300-w18-*.test.mjs
node --test scripts/issue300-w13-session-matrix.test.mjs scripts/issue300-w13-role-scope.test.mjs
node --test scripts/issue300-r2-v2-org-fixture.test.mjs
```

## Exact four product accounts — post-Owner lease

Prime first issues/reissues the bounded W10 2-Org + 3-Location fixture using
`node scripts/issue300-r2-v2-org-fixture.mjs --issue` (or approved
`--recover-receipt` if committed) after **all** its signed prerequisites
pass. Its private receipt is a readback hash and ID mapping; it **does not**
itself authorize mutation or prove the independent Owner signature.
Location A is `receipt.locationIds[0]`; Location B is
`receipt.locationIds[1]`; the foreign Organization/location have their
own dedicated IDs. Never rely on the order of `allowedScopes`.

Use these private environment variables only after the leased target and
receipt have been verified:

```powershell
$env:ISSUE300_R2_CANDIDATE_SHA = '<exact-reviewed-clean-application-SHA>'
$env:ISSUE300_W13_EXCLUSIVE_LEASE = '<Owner-signed-live-lease-id>'
$env:ISSUE300_W18_W10_RECEIPT = '<absolute W10_ORG_LOCATION_RECEIPT_*.json in owned V2 dir>'
node scripts/issue300-w18-offline-preflight.mjs --plan
```

The returned `staff` map specifies each canonical command as
`launcher + staff.<role>.argv`: `pnpm --filter @valet/api
staff:provision -- ... --password-stdin`. Set `NODE_ENV=test`
and `MIGRATION_DATABASE_URL` privately to the **verified** V2 owner-role
connection. Feed each fresh **15–128-character** password only to the
corresponding process's noninteractive stdin. Do not put a password in an
argument, PowerShell transcript, Git, log or report. Each run must return its
own real canonical `userId`, `membershipId`, `auditEventId`,
`organizationId`, `role`, and `locationIds`.

| Identity | Product role | Organization | Granted locations | MFA |
| --- | --- | --- | --- | --- |
| `ca` | `ORG_ADMIN` | main | A **and** B | real TOTP |
| `lm` | `LOCATION_MANAGER` | main | **B only** | real TOTP |
| `supervisor` | `VALET_SUPERVISOR` | main | **B only** | no Admin MFA requirement |
| `foreign` | `ORG_ADMIN` | foreign | foreign only | real TOTP |

The test emails are unique deterministic `@example.test` identities scoped
to exact candidate and lease. `staff:provision` writes genuine Argon2
users, memberships, location grants and audited
`STAFF_ACCOUNT_PROVISIONED` records. It does **not** issue sessions or MFA
factors. For each Staff user, read back the actual active user, membership,
Org, Location and grant using an **independent V2 owner read-only PG
connection**. Save the **four canonical CLI outputs keyed by
`ca/lm/supervisor/foreign`** as one private JSON object, and the **five
joined active grant rows** (with fields `email`, `user_id`,
`membership_id`, `organization_id`, `location_id`, `role`,
`user_status`, `membership_status`,
`organization_status`, `location_status`) as one private JSON array.
Write both directly under the exact Git-ignored
`tmp/issue300-r2-w7-acceptance-v2-owned` directory, with strict Windows
ACLs and no aliases, symlinks, junctions or hardlinks. The offline verifier
checks **four distinct actual product receipts**, five precise joined
grants with exact canonical User/Membership UUID equality, live active
status fields, foreign isolation and Location B exclusivity. This offline
comparison checks supplied bytes only; the Owner must independently
establish that the joined rows came from the live leased PostgreSQL.

The exact parameterized source of those five rows, on an independently
owned **read-only** connection using the four planned emails as `$1`,
is:

```sql
BEGIN READ ONLY;
SELECT lower(u.email) AS email, u.id::text AS user_id,
       m.id::text AS membership_id, m.organization_id::text AS organization_id,
       m.role::text AS role, mla.location_id::text AS location_id,
       u.status::text AS user_status, m.status::text AS membership_status,
       o.status::text AS organization_status, l.status::text AS location_status
FROM public.users u
JOIN public.organization_memberships m ON m.user_id = u.id
JOIN public.organizations o ON o.id = m.organization_id
JOIN public.membership_location_access mla
  ON mla.organization_id = m.organization_id AND mla.membership_id = m.id
JOIN public.locations l
  ON l.id = mla.location_id AND l.organization_id = m.organization_id
WHERE lower(u.email) = ANY($1::text[])
ORDER BY email, location_id;
COMMIT;
```

Require exactly five rows and no other grants for these four users;
the checker binds exact `user_id`/`membership_id` to every product
CLI response. Separately validate the four independently persisted
provisioning `auditEventId` values with authoritative Audit readback.

```powershell
$env:ISSUE300_W18_PROVISION_RESULTS = '<absolute owned V2 four-CLI-results.json>'
$env:ISSUE300_W18_GRANT_READBACK = '<absolute owned V2 five-row-DB-readback.json>'
node scripts/issue300-w18-offline-preflight.mjs --check-provision-results
```

For each `ca/lm/foreign`, use the real API product flow on `:3167`:
`POST /v1/staff/auth/login` with fresh password;
`GET /v1/staff/auth/mfa/state`; first-time
`POST /v1/staff/auth/mfa/enrollment/begin` and
`POST /v1/staff/auth/mfa/enrollment/confirm` with a current real
30-second TOTP. A later newly minted Staff session must instead use
`POST /v1/staff/auth/mfa/step-up` with its own fresh TOTP.
Supervisor uses its own ordinary Staff login. Confirm **all four distinct
`staff_auth_sessions.id`** and independent active memberships with
`issue300-w13-staff-authority.mjs`; CA/LM/foreign require current TOTP
assurance. Never borrow or clone a human user's existing MFA, access bearer
or refresh cookie.

The W13 runner `node scripts/issue300-w13-v2-http-proof.mjs` must receive
the privately signed Owner fixture manifest, raw detached signature, live
Owner attestation digest, distinct credentials, canonical source receipts
and independent **at least 101 Search Sessions plus 101 Timeline source
records for each signed lane**. Real `AUDIT`, `KEY_CUSTODY`,
`DISPATCH` and `INCIDENT` HTTP writer receipts are essential; held SQL
test rows alone cannot count as these domain writers. W13 checks protected
`200/no-store` vs default `503/no-store`, foreign and supervisor denial,
LM-other-Location denial, signed old S0/new S1 pages and rollback/tamper
oracles. Owner signs only the independently verified exact raw manifest
bytes. No fabricated PASS if proof inputs are missing.

## Exact 34-case Playwright handoff

The existing `apps/dashboard/e2e-runtime/issue300-closure.spec.ts` has
**2 functional + 32 UI-M1** authentic cases. Each invocation must use
its **own fresh, real Dashboard login/MFA Staff refresh cookie** and
**fresh signed Owner browser target** (15-minute maximum); the prior cookie
is irrevocably marked spent with `wx` **before** Playwright creates
the context. The case runs once and cannot be retried using the spent file.
Each screenshot compares to an actual frozen image from the **same fixture,
same view and same locale/theme/width/zoom**, never synthetic zoom.

Create a private scenario object under the same owned directory:

```json
{
  "candidateSha": "<exact-reviewed-clean-application-SHA>",
  "leaseId": "<Owner-signed-live-lease-id>",
  "organizationId": "<W10 main Organization UUID>",
  "locationId": "<W10 Location B UUID>",
  "auditPath": "/audit-log?investigationDemo=1",
  "date": "2026-10-20",
  "start": "00:00",
  "end": "23:59",
  "expectsPaging": true,
  "expectedSessionUuid": "<independently-readback-actual-Session-UUID>",
  "expectedSourceId": "AUDIT:<independently-readback-actual-event-UUID>",
  "frozenScreenshots": "<same-fixture-frozen-image-directory>"
}
```

Date/time above is **an example shape**: set real source cohort window
from independently confirmed event timestamps. Never populate IDs by
copying API responses under test. After Owner-signed fixture issuance:

```powershell
$env:ISSUE300_W18_BROWSER_SCENARIO = '<absolute owned V2 scenario JSON>'
node scripts/issue300-w18-offline-preflight.mjs --browser-plan
```

For **each** listed case set `ISSUE300_W7_BROWSER_URL=http://127.0.0.1:3117`,
`ISSUE300_W7_BROWSER_SCENARIO` to that scenario,
`ISSUE300_W7_EXCLUSIVE_LEASE` and `ISSUE300_R2_CANDIDATE_SHA`
to the exact signed values, `ISSUE300_W7_TEST_ONLY_BROWSER_PROOF=1`,
`ISSUE300_W7_BROWSER_STORAGE_STATE` to the *new* authentic one-use
MFA storageState, `ISSUE300_W7_BROWSER_OWNER_ATTESTATION_FILE` to
the fresh private Owner-signed target (plus `.sig`),
`ISSUE300_W7_BROWSER_OWNER_ATTESTATION_SHA256` to its actual raw digest,
and `ISSUE300_W7_SINGLE_FRESH_MFA_CASE` to the exact case title.
Run that entry's `command` array from repo root; the command filters
one exact case using `--grep`. Launch the first functional canary before
the remaining 33; validate the source-record/paging and session-identity
proof before promoting it. There is **no 34-context shortcut**.

All proof output remains unclaimed until the authentically signed runtime
dependencies and actual API/DB/browser evidence exist. No signing key,
secret or cookie belongs in this report or repository.

## 2026-10-20 W18 resumed local admission record (unsigned, read-only)

Checked clean isolated branch `codex/issue300-r2-w18-lane-c`, starting
from `9cc28b2f0897fa76b17eb750e927323e2d8b4115`.
Windows host AMD Ryzen 5 3600, 16 GiB RAM. Two memory snapshots had
~1,142 MiB and ~2,357 MiB free; CPU sampled at 21% and 19%.
Docker Desktop Linux engine named pipe was absent. No listening target
on reserved task ports PG `:58387`/`:58427`, API `:3167`/`:3168`,
Dashboard `:3117`. Existing native PostgreSQL on all interfaces
`:5432` (PID 6880) and COS loopback `:54387` were **not task-owned**
and were **not contacted**. No task-owned V2 receipt directory, npm
dependencies, reviewed active manifest/lease, four fresh Staff accounts,
or admissible running target was present in this isolated checkout.

Prime explicitly confirmed W16's **exclusive Docker/PG ownership** pending
handoff. W18 performed **no** Docker startup, PG connection, DB migration,
HTTP request, credential issuance, MFA enrollment, browser session,
cookie access or browser run. These are **BLOCKED/NOT RUN**, not failure
of the product and not accepted proof. Even an unsigned ordinary local
test requires a **separate verified task-owned target**, adequate resource
samples and exclusive handoff; the existing signed proof scripts must not
be repurposed or bypassed. Native `:5432` and human credentials remain
strictly off-limits.

Genuine product source inspected: `apps/api/tools/provision-staff.ts`
reads passwords through non-interactive stdin, validates active
Organization/Location grants, writes Argon2 Staff accounts and
`STAFF_ACCOUNT_PROVISIONED` inside a transaction;
`StaffAuthController` authenticates login; `StaffMfaController`
exposes enrollment begin/confirm, state and step-up; services require
active Staff sessions and fresh current TOTP. This is a **source
inspection**, not evidence of actual API/database behavior.

Added `scripts/issue300-w18-auth-protocol.test.mjs`: seven offline
**mocked request** protocol checks exercise the actual W13
`loginActualMfa` orchestration. They assert ordinary login then
existing-factor current TOTP step-up, fresh-only enrollment
begin/confirm, and rejection of unauthorized enrollment and
login/step-up/enrollment/confirmation failures. The mock returns test
responses; these tests **cannot prove server authorization, Argon2, PG
persistence, working TOTP verification or real 34-browser execution**.
The combined W10/W13/W18 source/offline suite passed **26/26**.

Required future runtime evidence, upon W16 handoff and resource
admission: independently verified task-owned PG with genuine migrations,
canonical product Staff CLI receipts and live grants/audit readback,
distinct fresh CA/LM/Supervisor/foreign logins, real current TOTP for
CA/LM/foreign, ordinary authenticated API responses, and independently
observed UI outcomes. Report each ordinary local test distinctly from
Owner-signature-dependent acceptance. The **34** proof-only cases remain
**BLOCKED** without their unchanged valid signed Owner browser target
and 34 unique one-use MFA cookie states.
