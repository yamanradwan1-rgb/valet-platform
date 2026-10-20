# Issue #300 R2 — W4 Security / Least-Privilege Review

Status: **PARTIAL (source correction prepared); actual provisioned-role HTTP evidence GAP**

## Identity and permitted boundary

- Owner authorization: `tmp/issue300-r2-owned/OWNER_R2_EXECUTION_AUTHORIZATION.txt` (R2 and UI-M1 local execution only).
- Frozen baseline: `ef5a0554fa20fe6ee6fcc0a4ceeffdc83d6e5687`.
- Worker branch: `codex/issue-300-r2-w4-security` in isolated `tmp/issue-300-r2-w4-security`.
- Edited solely `apps/api/src/modules/management/audit-investigation/security/audit-investigation-source-boundary.ts`.
- New offline proof: `apps/api/test/issue300-closure-security.integration.test.ts`.
- No PostgreSQL connection, authenticated HTTP, browser, runtime provisioning, evidence write, role alteration, migration, deployment or original frozen worktree edit in this worker's static pass.

## F02 — source-boundary defect and narrow correction

Previously, the direct point-detail containment query ended in `FOR SHARE OF session, evidence`. PostgreSQL 17 requires a column/table `UPDATE` privilege for a relation targeted by `FOR SHARE`; ordinary API runtime grants **do not provide evidence UPDATE**. `incidents` is explicitly SELECT+INSERT with UPDATE forbidden under Accepted DEC-059. Thus this is a confirmed SQL/ACL incompatibility (P1), not yet a demonstrated actual-role HTTP 42501 failure.

W4 now uses `FOR SHARE OF session` only. The guarded Session remains locked, and all four source variants retain the exact persisted `evidence.organization_id = session.organization_id`, `evidence.location_id = session.location_id`, `evidence.valet_session_id = session.id`, caller-authorized Organization, Location, Session, and source Event ID. Incident detail additionally requires the current Location be ACTIVE. Only `SELECT 1` is returned. `timeline-read-service.ts` independently performs a final canonical fixed-source read and purpose-safe projection within the same request transaction; the direct precheck never authorizes raw metadata or bytes.

W3 exclusively owns the matching indirect Audit `timeline-indirect-audit.ts` correction. Its frozen version has `FOR SHARE OF session, audit`; W4 notified Prime for W3 coordination. This report does not claim indirect F02 is fixed by the W4 commit.

## Authorization and privacy review

- Search, filters, Timeline and detail resolve the current authenticated staff session before entering the scoped transaction. All four operations call the persisted W4 authorization guard each time. Cursor signature does not convey authorization.
- `authorizeManagementAuditLocation` checks persisted current Organization/membership/Location scope; LM needs an exact `membership_location_access`, while CA has exact Location within own Organization. Both require commercial `DASHBOARD_ACCESS`. Investigation excludes Supervisor even though old Audit Events retains its separate authorized behavior.
- CA standard MFA: the exact current session/token is locked and rechecked in `lockAndRecheckMfaSession` (`FOR UPDATE OF session, staff_user`), with current factor, eight-hour assurance and 30-minute inactivity conditions. The permitted CA activity write updates only `last_admin_activity_at`, not factor assurance time. LM's management read uses current staff session/grant authorization and does not silently invent CA MFA authority.
- LM's persisted authorization locks staff session, user, membership, Organization, Location and grant row (`FOR SHARE`). CA's order is role hint, exact-session MFA lock, then active Organization/membership/Location share locks. Source containment follows; then safe projection; then CA activity write. Concurrent revocation ordering and commercial-policy transitions require real two-connection proof (GAP).
- Direct detail does not trust a source name as an SQL identifier: the four allowed values map to fixed tables, unsupported values fail before the query. Wrong Session/Event/Organization/Location gives the same concealed denial as an absent source; Incident current inactive Location is excluded.
- Search and Timeline output project fixed safe data, not arbitrary Audit metadata, GPS, photo keys/bytes, free-text reasons, or authentication/payment material. Existing F01 missing integrity signal and F03 member selector predicate mismatch remain **P1 owned by W2/W3**, not W4 source changes. No independent new P0 cross-scope leak was demonstrated by this static review; that is not a negative HTTP proof.

## Focused validation and nonclaims

The new offline SQL-boundary suite covers the four physical sources, exact scope/Session/Event equality, Session-only lock (and no evidence-row lock), Incident active-only predicate, missing/ambiguous rows and unsupported source rejection. Existing source-boundary and authorization suites exercise rejection and ordinary CA/LM role filtering. The non-DB suite intentionally uses a mocked transaction: passing it **does not prove** actual PostgreSQL ACL, row-level race outcomes, controller transport or a genuine CA/LM login.

Executed from this W4 worktree (no database connections):

- `pnpm --dir apps/api exec vitest run test/issue300-closure-security.integration.test.ts test/issue300-security/investigation-source-boundary.test.ts test/issue300-security/investigation-authorization.test.ts --project=api-non-postgres --reporter=dot` — **PASS: 3 files, 30 tests**.
- `pnpm --dir apps/api typecheck` — **PASS**.
- `pnpm --dir apps/api exec eslint src/modules/management/audit-investigation/security/audit-investigation-source-boundary.ts test/issue300-closure-security.integration.test.ts --max-warnings=0` — **PASS**.
- Dependencies installed offline for `@valet/api...` with frozen lockfile and scripts disabled; the initial full-workspace offline install failed for missing unrelated React Native masked-view tarball, then the focused API install succeeded. No tracked lockfile change.

| Proof lane | Status | Condition needed to upgrade |
|---|---|---|
| F02 direct narrow source change | PARTIAL | Real provisioned runtime role on disposable PG17, API rebuild/HTTP detail for all four sources, no evidence UPDATE |
| F02 indirect Audit | GAP in this W4 tree | W3 independently patches and tests its own `timeline-indirect-audit.ts`; Prime integrates both |
| T45/T46/T47/T48/T51/T52/T53 | GAP for final candidate | Authenticated CA/LM + cross-org/location, expiry, stale session, revoked grant, incident inactive and wrong-event HTTP negatives |
| T49/T50/T55/T66 | PARTIAL existing/static only | Authenticated Supervisor/employee/platform denial and old Events regression; transport headers/logs under actual API |
| T54/T70 and revocation order | GAP for final candidate | Real two-connection read/revocation races, CA activity-only delta and retry reauthorization |
| F01/F03 anomaly/selector privacy | P1 delegated | W2/W3 fixes and independent real-role sole-witness and foreign-scope privacy probes |

Before upgrading F02, W6/Prime must provide the exact exclusive owned PostgreSQL lease, applied-migration/role fingerprint and role attestation. Reproduce the **frozen** `FOR SHARE OF session, evidence` against each of the four sources using that restricted role and capture non-secret SQLSTATE; then execute the integrated new direct+indirect detail route with the same role and assert authorized 200, wrong-scope concealment and no evidence-table UPDATE privileges. Include simultaneous canonical Session/Incident writer updates to check for races or unusual blocking. Never add UPDATE to append-only evidence to make the test pass.

## Release limits

The planned local source correction is narrowly scoped. Production activation, source/parent continuation acceptance, migrations, push/PR/merge/deployment and Issue closure are outside this W4 verdict. Final runtime/security status remains **GAP** until the above evidence exists on the frozen integrated candidate and actual restricted role.
