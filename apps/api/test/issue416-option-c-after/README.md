# Option C — independently attested AFTER writer acceptance gates

**Historical W37 source baseline:** `1fbf95c58089b7689d77230b2a730f6e51a92580`.
**Scope:** test-only security evidence, not a writer implementation, grant change,
Password Reset activation, rollout approval or production security clearance.

## Suites and decision rules

The prior W37 `issue416-option-c-t5/*.probe.ts` remains the **BEFORE** suite
imported in `9a00e398`; it is not included by either new config. This work adds:

| Explicit selector | Purpose | Correct status at unremediated `1fbf95c5` |
| --- | --- | --- |
| `vitest.option-c-before-onboarding.config.mjs` | S03-adjacent **BEFORE** create/resend/activate runtime-only provenance → mounted activation/Staff login | RED when SQL and API both accept forged origin |
| `vitest.option-c-after.config.mjs` | **AFTER** runtime column/table ACL, legacy function EXECUTE/PUBLIC ACL, parent-role and twice-provisioned ACL, real HTTP 401/403 and real Staff/MFA/Management/onboarding positives | RED until all protected writers & grant retirement are deployed to the tested SHA |

All tests are opt-in `*.before.ts` and `*.after.ts`, not `*.test.ts` or
`*.spec.ts`; they are **not** part of default CI classification. Do not add an
`expect.toPass`, silent skip, production grant override, or changed error
contract to conceal a RED test. After protected writers are implemented, verify
the exact final integration SHA plus CI/Security CI independently.

### AFTER acceptance matrix

| Boundary | Actual negative SQL / HTTP | Positive compatibility |
| --- | --- | --- |
| S01 | Runtime must not INSERT Staff session, revive logout, modify access or refresh lineage; mounted forged `vsa1` 401, revoked bearer/refresh 401 | Real password login, refresh rotation, MFA state, logout |
| S02 | Runtime cannot INSERT/UPDATE factor/recovery, backfill MFA or session assurance; mounted sensitive mutation 403 | Real TOTP enrollment + step-up, sensitive management mutation 201 |
| S03 management | Runtime and PUBLIC cannot EXECUTE actor-UUID role/status/location functions, even if callable before; revoked admin 401 and employee without authority 404 | Current same-tenant Company Admin directory/mutation; foreign tenant 404 |
| S03 onboarding | Runtime and PUBLIC cannot EXECUTE legacy `staff_onboarding_create`, `staff_onboarding_resend`, `staff_onboarding_activate` overloads | Real authorized Staff invitation create/resend 201; public activation 200; normal password login 200 |
| Provisioner x2 | Seed a temporary `NOLOGIN` parent role with sensitive UPDATE grant and membership; first & second runtime provisioning must remove ALL direct/inherited legacy grants, unsafe function EXECUTE and membership | Runtime still has `LOGIN`, `NOINHERIT`, no createdb/createrole/superuser/bypassrls, authenticated API remains functional |

`42501` is required for denied direct table DML. On a retired legacy function,
either `42501` or SQLSTATE `42883` **with independently verified absent exact
`regprocedure`** is acceptable. Syntax, check, unique or FK violations are not
evidence of a protected-writer boundary. Tests check effective privileges with
`has_column_privilege`, `has_table_privilege` and `has_function_privilege`, which
include relevant inherited/table-level authority, rather than looking only at
the role's explicit ACL entries. PUBLIC EXECUTE and direct membership are
separately checked. A failed privilege query is never reported as denied access.

### Safety and reproducibility

The AFTER suite is pinned to a dedicated local Docker target that must be
provisioned and independently attested before execution:
`vaylet-issue416-option-c-final-20261116-pg17`, image `postgres:17-alpine`,
loopback port `127.0.0.1:51800`, bootstrap database/user `postgres`, test
database/admin role `valet_w66final4`, and named volume
`vaylet_optionc_final_pg17_data`. Required labels are
`vaylet.owner=issue416-option-c-final-20261116`, `vaylet.issue=416`,
`vaylet.environment=isolated-test`, and `vaylet.disposable=true`. The container
must have restart policy `no`, exactly that one named volume and no bind mounts.
The test owner is non-superuser with `CREATEDB` and `CREATEROLE`, `NOINHERIT`,
no replication or `BYPASSRLS`, and only the `pg_monitor` parent membership with
`INHERIT TRUE`, `SET FALSE`, `ADMIN FALSE`. `owned-target.ts` verifies these
properties before any test database/role is created, including matching the
host/container `pg_control_system().system_identifier`.

The optional historical BEFORE-onboarding suite uses a separate W37 target
`vaylet-issue416-w37-option-c-20261115-pg17`, loopback port `127.0.0.1:51147`,
database/admin role `valet_w37oc`, and owner label
`vaylet.owner=issue416-w37-option-c-20261115`. It is not the AFTER target.
Both targets reject CI, host/context environment overrides, remote or
unrecognized Docker contexts, wrong role/DB, PostgreSQL versions outside 17
and differing host/container system identifiers. No W9, Prime, shared or
production container/volume/SQL instance is permitted.

Once the disposable fixture has been independently attested, run from
`apps/api` with the real fixture password supplied locally (never commit it):

```powershell
$env:NODE_ENV = 'test'
$env:ISSUE416_OPTION_C_AFTER = 'OPTION_C_FINAL_DISPOSABLE_ONLY'
$env:TEST_DATABASE_URL = 'postgresql://valet_w66final4:<fixture-password>@127.0.0.1:51800/valet_w66final4'
$env:MIGRATION_DATABASE_URL = $env:TEST_DATABASE_URL
$env:DATABASE_URL = $env:TEST_DATABASE_URL
pnpm exec vitest run --config vitest.option-c-after.config.mjs
```

To run the optional original BEFORE onboarding evidence, switch to the separate
W37 target and set `ISSUE416_OPTION_C_T5='W37_DISPOSABLE_ONLY'` with
`TEST_DATABASE_URL`/`MIGRATION_DATABASE_URL` pointing to
`postgresql://valet_w37oc:<fixture-password>@127.0.0.1:51147/valet_w37oc`.

The fixture itself runs official fresh migrations and initial runtime
provisioning; the AFTER provisioner test then executes `runtime:provision`
**twice more** after adding an intentional synthetic inherited-role poison.
It checks first and second results independently and removes only its own
temporary role. Normal test teardown drops only its own random test DB/role.

## Observed evidence on pinned unremediated baseline

**Source status:** `mfa-runtime-privileges.mjs` still GRANTs session/MFA
`INSERT/UPDATE`; `staff-management-runtime-privileges.mjs` still GRANTs the
legacy actor-UUID functions; `staff-onboarding-runtime-privileges.mjs` still
GRANTs create/resend/activate. Therefore the AFTER suite is designed to fail
on this source. A RED baseline is not a failed protected writer rollout, because
no protected-writer implementation was included in this branch.

**Fresh BEFORE onboarding proofs**, three separate synthetic real SQL→mounted
API chains in one owner-attested PostgreSQL 17.11 fixture:

1. Ordinary runtime SQL calls `staff_onboarding_create` with actual but
   bearer-unproven Company Admin membership UUID; creates a PENDING User and a
   caller-chosen invitation verifier. Real `/v1/staff/auth/activate` **200**;
   target native login **200**.
2. Admin genuinely logs out. Ordinary runtime SQL still calls
   `staff_onboarding_resend` with that revoked-session actor UUID and a new
   caller-chosen invitation verifier. Real activation **200**, native login
   **200**.
3. Ordinary runtime SQL calls `staff_onboarding_activate` with a **stored
   invitation verifier** and an unrelated synthetic User's valid Argon2 PHC.
   Target becomes `ACTIVE`; mounted native login with that donor's raw password
   **200**. No raw invitation credential was presented to the SQL command.

The BEFORE security assertions deliberately reported **3 failed / 0 passed**.
The initial AFTER suite on this source reported **10 failed / 2 passed**:
effective grants, actor functions and direct SQL writes are still accepted;
positive Staff login/refresh/management and strict role identity checks pass.
Independent AFTER-positive onboarding suite reported **2/2 PASS**, including
real create/resend/activation/login and 401/403/404 denied issuers.

After correcting an unrelated ancestry diagnostic `GROUP BY` test error, the
isolated provisioner-twice test executed both replays and logged **11 dangerous
effective grants per pass**, while its injected parent membership was removed
by the provisioner. The regression remains RED because direct legacy grants
are restored on both runs. This distinguishes **successful inheritance
cleanup** from **failed sensitive permission closure**.

## Explicit limitations

- The current baseline does not contain remediated protected writers; **zero
  AFTER security green claims** are made. Positive tests passing does not
  establish T5 safety.
- SQL privilege results come from an isolated provisioned role, not customer
  production infrastructure. No actual production grant attestation occurred.
- S04 anti-abuse, complete role/function inventories, and full concurrency/
  UNKNOWN-commit admission remain separate acceptance work. These tests do not
  replace same-SHA CI and independent security review.
- Keep public Password Reset unregistered and disabled. No tests attempt to
  activate or implement it.
