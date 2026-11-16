# S04 Staff Activation PG17 Qualification

Run the isolated signed-activation SQL qualification with:

```powershell
$env:S04_W67_PG17_PORT = "51800"
$env:S04_W67_PG17_FIXTURE_URL = "postgresql://w67_owner:<password>@127.0.0.1:51800/s04_w67_disposable"
$env:S04_W67_PG17_SUPERUSER_URL = "postgresql://postgres:<bootstrap-password>@127.0.0.1:51800/s04_w67_disposable"
$env:S04_W67_PG17_SYSTEM_ID = "<system_identifier from pg_control_system()>"
pnpm --filter @valet/database s04:staff-activation:pg17
```

The target must be a dedicated disposable PostgreSQL 17 instance bound only to
`127.0.0.1` on the exact port specified by `S04_W67_PG17_PORT`. Its `w67_owner`
migration identity must be **non-superuser**
with `CREATEDB`, `CREATEROLE`, and `pg_monitor` visibility; the tests assert
those role attributes and the exact postmaster system identifier. The first
test provisions the S04 proof key and isolated runtime/Staff/MFA roles. The
bootstrap superuser URL is used only to install the fixture's exact SET-only
membership from `w67_owner` to the Staff writer; it is not used for migrations
or the activation transaction. The
second applies migrations 147 and 148, verifies that the unsigned four-argument
function is absent, and tests signed activation settlement, a wrong-XID MAC with
the correct current `p_xid`, a mismatched XID parameter, cross-reservation proof
reuse, proof replay, rollback/commit nonce atomicity, exact scope/state
restrictions, and runtime / MFA ACL denial.

Do not point these variables at a shared, production, or another worker's
database. The command fails when either attestation variable is missing.
