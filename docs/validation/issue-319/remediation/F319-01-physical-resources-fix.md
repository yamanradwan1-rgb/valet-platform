# F319-01 — Physical Resources Location Manager grant-revocation fence

## Historical RED (preserved)

At source SHA `20998a069eb5d576895c0e6c149271a4a0e4028b`, the LM helper authorized a location once, released no compatible Organization lock because none was acquired, and the real Physical Resources HTTP handler returned a protected synthetic key-slot row after the canonical CA Staff Management HTTP grant-revocation response had committed. The `REPEATABLE READ` overview also kept an older MVCC authorization snapshot. The original 25/25-pass **vulnerability reproduction** is retained in `../logs/audit-tests.txt` and the original `../http-authorization-acceptance.md`; it is not a post-fix security PASS.

## Scoped implementation

`apps/api/src/modules/dashboard/physical-resource-authorization.ts` now supports an internal reader mode. For six `READ COMMITTED` Physical GETs, LM eligibility is a non-authoritative hint, followed by the canonical `staff-management-org:<organizationId>` **transaction-scoped SHARED advisory**. It checks that isolation is READ COMMITTED and re-runs exact active User/membership/role/Organization/Location/LM grant/commercial eligibility; the Organization and membership must match the hint. `physical-resource-read.service.ts` holds that transaction lock through the actual protected query and response projection. The seven routes are key-slot list, parking-spot list, parking-zone list, key-slot custody, key-slot label, parking-spot label and the RR overview.

`physical-resource-overview-transaction.ts` pins a connection for the overview's required `REPEATABLE READ` snapshot. Only LM takes a SESSION-scoped SHARED advisory **before `BEGIN`**; the fresh RR snapshot then authorizes again and executes its projections under that fence. COMMIT/ROLLBACK and advisory unlock are followed by lease cleanup. An ambiguous lock acquisition/commit/rollback/unlock, or failed session-setting reset, discards the client instead of returning potentially contaminated state to the pool. No isolation downgrade.

Company Admin uses its existing independent MFA/exclusive-management path; it never upgrades a held LM SHARED Organization advisory. `CREATE` authorization and write permissions are unchanged. No frontend, migration or runtime DB privilege change.

## Post-fix evidence and boundaries

- `../remediation/logs/races-first-audit-tests.txt`: six real CA MFA HTTP reader-first/revoker-first tests shared with F319-02, **6/6 PASS**; key-slots and RR overview are exercised in both orders. The revoker waits when a valid reader owns the fence; a queued revoker commits before a later reader reaches its authorization fence, which then receives HTTP 404.
- `../remediation/logs/patched-full-audit-tests.txt`: all seven Physical GETs retain current-grant 200 / fresh revoked 404 behavior through the route matrix. Five non-overview/non-key-slot routes have additional reader-first held-advisory + canonical SQL revocation ordering; this is **not** a two-order real CA HTTP race for every route.
- `../remediation/logs/physical-lease-audit-tests.txt`: pre-BEGIN session advisory acquisition cancellation (`57014`) destroys uncertain PG lease; a transaction projection error rolls back and releases locks and a retried fresh connection succeeds. `../remediation/logs/extension-locks-retry-audit-tests.txt` demonstrates two simultaneous readers, one blocked writer, cross-Organization progress and 55P03/57014 recovery.
- `../remediation/logs/patched-full-audit-tests.txt`: 80 Physical key-slot uncontended HTTP samples p50 **10.28ms**, p95 **12.64ms**, versus historical 8.44/14.05ms; 80 RR overview samples p50 **14.36ms**, p95 **20.41ms** (no matched historical RR series). Local runs are descriptive, not a production SLO.

The `READ COMMITTED` helper cooperates with canonical application grant revokers. Privileged arbitrary DBA SQL outside the advisory protocol, already-delivered HTTP bytes and untested independent routes are excluded. See `FINAL_REMEDIATION_ACCEPTANCE.md` for final test SHA and the independent review after all scoped patches are verified.
