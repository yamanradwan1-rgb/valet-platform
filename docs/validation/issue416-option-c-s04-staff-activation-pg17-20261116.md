# Issue 416 Option C — S04 Staff activation PG17 evidence

**Disposition:** targeted S04 signed-settlement qualification passed on an
isolated PostgreSQL 17.11 instance. This is not full Option C launch acceptance
and does not supersede the separate W66 mounted-HTTP/cutover blockers.

## Source identity

- Branch: `codex/option-c-s04-final-20261116`
- Tested source commit: `f3e817f3c72c0eeb0b45919e887acd01fc7cbd5d`
- Parent: `e356564ec5ff12bc901fcdd244085d0d7799942e`
- Forward-only migration: `20261116000100_option_c_s04_signed_staff_activation_success`
- Migration SHA-256: `B31468F86E2E37427D93D8C3F606D759990A67C6F9B77A5E1B94D226C6BBF4C7`
- PG17 integration test SHA-256: `54B9DFC1049E86D21CED1EA0EA79E2D5917946448225A77D09D4BCA6DE9BE9C9`

## Disposable PostgreSQL target

- Image: `postgres:17-alpine`
- Image ID: `sha256:ab20e934b27ba3ff927c1b4c9ff8cf6c32f315f743efe68dd3441182a87fb085`
- Container: `7c7d23b7469358edd240bcd10a8c3afe32eb321aeaf33c4cd1760ff08bedbd13`
- Owner label: `issue416-w67-s04-20261116`
- Database: `s04_w67_disposable`
- Loopback binding: `127.0.0.1:51667 -> 5432/tcp`
- Data directory: tmpfs (`rw,size=1g`); no bind mounts or persistent volume
- PostgreSQL: `17.11`
- `system_identifier`: `7708534437165154345`
- Migration/test owner: `w67_owner` (`rolsuper=false`, `rolcreatedb=true`,
  `rolcreaterole=true`, `rolinherit=false`, `rolbypassrls=false`, `pg_monitor`
  membership)
- Bootstrap `postgres` superuser URL was used only to set the fixture's exact
  `SET TRUE / INHERIT FALSE / ADMIN FALSE` membership for `w67_owner` to the
  Staff writer. Migrations, proof issuance and activation settlement ran as the
  non-superuser `w67_owner` / dedicated writer roles.
- No passwords or connection strings are recorded here.

## Exact invocation

```powershell
$env:S04_W67_PG17_FIXTURE_URL = 'postgresql://w67_owner:<redacted>@127.0.0.1:51667/s04_w67_disposable'
$env:S04_W67_PG17_SUPERUSER_URL = 'postgresql://postgres:<redacted>@127.0.0.1:51667/s04_w67_disposable'
$env:S04_W67_PG17_SYSTEM_ID = '7708534437165154345'
$env:NODE_ENV = 'test'
pnpm --filter @valet/database s04:staff-activation:pg17
```

The runner rejects non-loopback hosts, a different port/database/user, query or
fragment components, a missing system identifier, and a non-PG17 fixture. The
first test provisions the S04 proof key and isolated runtime/Staff/MFA roles;
the second applies the prior S04 helper migration and migration 148 in order.

## Result

**Result: 2/2 PASS.**

- `S04 independent PG17 fixture denies raw runtime SQL and accepts bounded proofs` — PASS
- `owned PG17: XID-bound activation finalizer, rollback, replay, cross-row and ACL` — PASS
- Total: 2 tests, 2 passed, 0 failed, 0 skipped; runner exit code `0`.

Verified in the database after the run:

- The eight-argument `public.s04_staff_activation_success(uuid,text,text,text,xid8,uuid,bigint,text)` exists.
- The previous unsigned four-argument signature is absent.
- EXECUTE is granted to `w67_s04_staff_writer` only; runtime and MFA writer EXECUTE are false.
- `w67_owner` has exactly one SET-only membership to the Staff writer (`inherit=false`, `set=true`, `admin=false`).

The PG17 tests cover the genuine invitation receipt, active member/user,
Argon2-era activation transaction boundary, signed reservation/scope/key /
invitation/XID binding, wrong-XID MAC with the correct current `p_xid`, a
mismatched XID parameter, cross-reservation proof reuse, nonce replay,
rollback/commit nonce atomicity, COUNTED-state preservation, and runtime/MFA ACL
denial. The generic `s04_finalize` remains unavailable to Staff Auth.

## Additional local validation on the same source commit

- API typecheck — PASS
- Targeted API ESLint — PASS
- Database typecheck — PASS
- Database lint — PASS
- Database non-Postgres suite — 8 files / 65 tests PASS
- API non-Postgres suite — 281 files / 2,025 tests PASS; 2 files / 6 tests skipped by existing external-fixture conditions
- API Option C unit config — 4 files / 14 tests PASS
- Focused S04 / Option C source contracts — 12/12 PASS
- `git diff --check`, Node syntax checks and package JSON parsing — PASS

## Explicit limits

This is a targeted synthetic SQL integration fixture, not a full Prisma fresh /
upgrade migration run, not the complete mounted API test, and not production
evidence. The full Option C combined branch still requires the W66 cutover ACL
compatibility fixes, the runtime session-lock remedy, mounted HTTP acceptance
on the combined migration chain, comprehensive writer ACL preflight, and an
independent final-SHA review. No main/production/remote database, branch or PR
was changed by this run. CodeQL/Security CI on this commit was not run here.
