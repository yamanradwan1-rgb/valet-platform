# Issue 416 / Option C — W37 mounted T5 verification

Baseline: `db85db57fc5c3913a22d34ab5d9ef77269756301`. This directory is
**test-only**. The feature remains disabled. It introduces no auth, MFA,
management, Guest, Push or reset implementation and changes no SQL grants.

## Scope and evidence standard

The probes run the real `AppModule` on a newly migrated disposable PostgreSQL
17 database. The fixture provisions the **actual restricted runtime role**;
each hostile statement is executed using that role, never the migration/admin
role. Legitimate operations use HTTP requests with generated `vsa1` and `vsr1`
credentials, real Argon2-verified Staff login and genuine TOTP enrollment/step-up.
Synthetic SQL injections are committed only to the fixture's disposable data so
the immediately subsequent real mounted HTTP call can measure acceptance.

| Finding / scenario | SQL-only attempt or baseline | Mounted outcome required | Expected result |
| --- | --- | --- | --- |
| S01 session insertion | Insert attacker-chosen `vsa1` verifier for an ACTIVE User with no raw password | `GET /v1/staff/auth/mfa/state` using forged bearer | SQL denied and HTTP 401 |
| S01 logout resurrection | Real logout, then runtime clear of `revoked_at` | Old bearer against MFA state | SQL denied and HTTP 401 |
| S01 access expiry | Expire real access verifier via fixture administrator | Old bearer against MFA state | HTTP 401 |
| S01 refresh forgery | Insert attacker-chosen `vsr1` verifier for a valid session | POST native refresh with forged credential | SQL denied and HTTP 401 |
| S02 fresh TOTP positive | Genuine enrollment/step-up after clearing current assurance | Mounted Staff role mutation | HTTP 201, exact membership revision 2 |
| S02 timestamp forgery | Runtime UPDATE of factor ID, MFA time and activity time following denied sensitive operation | Retry identical sensitive role command | SQL denied, HTTP 403, role/version unchanged |
| S02 revoked session | Real logout followed by runtime MFA timestamp and revoke clearance | Sensitive role mutation with old bearer | SQL denied, HTTP 401 |
| S03 actor UUID forgery | Real bearer revoked, SQL `staff_management_set_role` using CA actor member UUID and no bearer/TOTP | Employee's own bearer accesses Management directory, concurrent plus postcommit | SQL denied, HTTP 404, role/version unchanged |
| S03 tenant separation | Actor UUID from Company A passed to function for Company B | Foreign-org directory with valid Company A bearer | SQL denied, HTTP 404, target unchanged |
| Option C reset OFF | No reset controller registered | Public redeem and authenticated management issue routes | Both HTTP 404 |

The expected outcomes are **security acceptance criteria**, not claims about
the current `db85db57` implementation. Any `201`, successful forged session,
or unrestricted direct SQL mutation fails the probe and is a candidate launch
blocker. SQL permission denials and actual HTTP denials are checked separately.
Unexpected SQLSTATE fails the probe; tests never silently skip unsafe behavior.

### Observed baseline, 2026-11-15 (local, synthetic, W37 PG17.11)

The following are **actual fail-closed assertion failures** at `db85db57`,
verified through mounted HTTP after runtime-principal SQL mutations:

| Finding | Actual returned HTTP | Proof disposition |
| --- | --- | --- |
| S01 SQL-created access session with chosen `vsa1` | MFA state **200** | **Confirmed T5 bypass** |
| S01 SQL resurrection of real logged-out access session | MFA state **200** | **Confirmed T5 bypass** |
| S01 SQL-retired prior refresh and SQL-inserted chosen `vsr1` | Native refresh **200** | **Confirmed T5 bypass** |
| S02 SQL-recreated fresh MFA assurance after legitimate assurance cleared | Sensitive role mutation **201** | **Confirmed T5 bypass** |
| S02 SQL-cleared logout revocation and repopulated MFA clocks | Sensitive role mutation **201** | **Confirmed T5 bypass** |
| S03 actor-UUID role writer after real Admin logout | Employee gains LM Management directory **200** | **Confirmed T5 bypass** |

Legitimate TOTP re-step-up **201**, foreign-tenant direct SQL actor denied and
mounted foreign bearer directory **404**, public/protected reset routes **404**,
and expired Staff bearer **401** all passed. Initial expired-session and refresh
tests encountered source-check constraints (expiry CHECK and single-current
refresh UNIQUE); the probes were corrected to set legal historical timestamps
and to try SQL retiring the current refresh first. The corrected S01 rerun
had **3 expected security failures and 1 pass**; the initial full T5 run had
**7 failed/3 passed**, including two now-corrected probe setup mistakes.
These results are neither a remediation nor evidence that current security CI
should be waived. Keep the failing probes as regression gates for later fixes.

## Owned target and preflight

The W37 ownership guard runs before *every* test fixture's `CREATE DATABASE`.
It refuses CI, remote/unrecognized Docker contexts, `DOCKER_HOST`/
`DOCKER_CONTEXT`/`DOCKER_CONFIG` overrides, incorrect target URLs, mismatched
container labels, foreign images, bind-mounted storage, unexpected ports,
PostgreSQL versions other than 17, and differing host/container Postmaster
system identifiers. Nothing may run on Prime/W9/shared/production PostgreSQL.

Own Docker container: `vaylet-issue416-w37-option-c-20261115-pg17`.
Expected labels: `vaylet.issue=416`, `vaylet.owner=issue416-w37-option-c-20261115`,
`vaylet.environment=isolated-test`, `vaylet.disposable=true`.
Target address/database/admin: `127.0.0.1:51147/valet_w37oc`, `valet_w37oc`.
Use a unique synthetic **local test-only** PostgreSQL password; never commit it.

Once the named container, Docker context and host/container Postmaster identity
are independently attested, run from `apps/api` with environment variables set
in the same terminal session:

```powershell
$env:NODE_ENV = 'test'
$env:ISSUE416_OPTION_C_T5 = 'W37_DISPOSABLE_ONLY'
$env:TEST_DATABASE_URL = 'postgresql://valet_w37oc:<fixture-password>@127.0.0.1:51147/valet_w37oc'
$env:MIGRATION_DATABASE_URL = $env:TEST_DATABASE_URL
$env:DATABASE_URL = $env:TEST_DATABASE_URL
pnpm exec vitest run --config vitest.option-c-t5.config.mjs
pnpm exec vitest run --config vitest.option-c-compat.config.mjs
```

The separate compatibility selection exercises mounted Staff Auth/MFA revocation,
real Management+Location grants, two-backend refresh/deactivation races,
cross-company membership and Staff Push persistence, mounted Staff Push
registration, and a real Guest HTTP publication/revocation journey.
The existing full Staff → Guest #316 test hardcodes a different local test
bootstrap (`localhost:5432/valet`) and rejects this isolated target; it is
deliberately excluded. The included Guest test mounts its actual Guest controller
against a fresh DB and verifies persisted publication/privacy/revocation.
It reuses the repository's existing assertions without relaxing them.

## Caveats and further acceptance

- This is a focused attack-path test, not a complete SQL privilege inventory.
  Independently verify effective table/column/function/default ACL and inherited
  roles; use exact SQLSTATE and both SQL and HTTP postconditions to classify P0.
- It does not replace the separate W56 migration/provisioner **twice** tests,
  S04 durable anti-abuse checks, or a same-SHA CI/Security CI rerun.
- A failing T5 test with confirmed SQL privilege and mounted API acceptance is
  evidence of an exploitable defect. Failed setup or unexpected SQLSTATE is a
  blocked test, never a valid security pass.
- No reset route is enabled or registered. No production credential, external
  provider, W9 or shared Docker/SQL target is part of this suite.
