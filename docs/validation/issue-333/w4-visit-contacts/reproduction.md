# Issue #333 W4: management visit contact authorization verification

## Scope and source contract

- Repository baseline: `c638a437749cae1f78a8c8a417fd4d53e6a34920`; isolated worktree `/valet-platform/tmp/issue-333-w4`, branch `audit/issue-333-w4-visit-contacts`.
- Read targets: `apps/api/src/modules/management/management-visit-contact-authorization.ts` and `management-visit-contact.service.ts`, including downstream contact search and customer/vehicle history queries. These files were not changed.
- Entities: `Organization`, `Location`, `OrganizationMembership`, `MembershipLocationAccess`, `StaffAuthSession`, `Customer`, `Vehicle`, and historical `ValetSession`. No ValetSession or Task/Dispatch transition, schema, migration, index, or policy configuration is changed by W4.
- Accepted context: `DEC-023` (session boundary), `DEC-081` (membership role/access lifecycle), `DEC-084` (visit contact visibility), `DEC-094` (inactive Location history), `docs/23_MANAGEMENT_BACKEND_216_EXECUTION_PLAN.md` and `docs/24_MANAGEMENT_DASHBOARD_INTEGRATION_PLAN.md`. Inactive but still granted Location history is an expected read according to the Location lifecycle contract.
- Prior #319 `89/89` and #315 `28/28` are historical acceptance evidence; W4 did not rerun those suites.

## Reproduction sequence

Run only in the named isolated worktree on the disposable local PostgreSQL 17 test host:

```powershell
pnpm install --frozen-lockfile --offline
powershell -NoProfile -ExecutionPolicy Bypass -File docs/validation/issue-333/w4-visit-contacts/run-private-lab.ps1
```

The runner creates a dedicated cluster under the ignored `tmp/issue-333-w4-private/` subtree, uses a random nonstandard loopback port, verifies the exact data directory and owner identity, and stops/removes the cluster only after its child DB/connection inventory reaches zero. An explicit test-only gate rejects unrelated databases and CI environments. No shared or production database was used.

Each race uses real authenticated HTTP and an authentic, active Location Manager session. Two active Location grants are created by the canonical Company Admin endpoint with valid sensitive MFA. The test fixture **inserts synthetic visit records directly into the disposable database** for initial data setup; this is not evidence of a canonical visit-creation writer. The test-only spy pauses the reader immediately *after* `authorizeVisitContactRead` returns its granted Location set, while its database transaction remains open. The Company Admin then invokes the **canonical authorization-invalidating** `/location-access/revoke` HTTP endpoint for Location A with expected membership version. Only after that HTTP response returns `201` and a separate database read proves zero A grant rows does the test release the paused reader. It compares the actual pending HTTP response body with a fresh HTTP request by the same LM. The production authorizer, SQL queries, and grant-revocation writer remain unchanged.

## Two independent completed runs

| Check | Private run 1 (PG17, loopback port 58887) | Private run 2 (PG17, loopback port 59234) |
| --- | --- | --- |
| Aggregate two LM grants; ungranted Location and cross-tenant excluded; granted inactive historical visit visible | PASS | PASS |
| Canonical Company Admin role downgrade denies subsequent LM read | PASS | PASS |
| Contact search, revoke Location A during paused read | FAIL: marker disclosed | FAIL: marker disclosed |
| Customer history, same revoke interleaving | FAIL: marker disclosed | FAIL: marker disclosed |
| Vehicle history, same revoke interleaving | FAIL: marker disclosed | FAIL: marker disclosed |
| Revoke HTTP status, postcommit grant A count | `201`, `0` each race | `201`, `0` each race |
| Pending read status, private A marker | `200`, present each race | `200`, present each race |
| Fresh read status, private A marker | `200`, absent each race | `200`, absent each race |
| Test summary | 2 PASS / 3 FAIL | 2 PASS / 3 FAIL |
| Child test databases, other child sessions, owned directory after stop | `0`, `0`, removed | `0`, `0`, removed |

The same **2 PASS / 3 FAIL**, canonical revoke `201`, persisted grant `0`, stale marker present, fresh marker absent, and verified owned-cluster cleanup repeated in two further runs. Run 3 used private PostgreSQL 17 port `60080`; fingerprinted run 4 used port `60310`, run ID `c439d8933e3a440aa550ded7c68def38`. Run 4 cleanup checked `0` child databases, `0` other child connections and `OWNED_CLUSTER_DIRECTORY_REMOVED=True`.

The three red assertions check `expect(previousBody).not.toContain(privateMarker)`. They remain deliberately strict, preserving the precise unexpected body disclosure as the repeatable finding. The synthetic private marker is disclosed in the stale in-flight response; the same marker is absent from a newly authorized response. No full response JSON, private record identifiers, passwords, access tokens, MFA secrets or raw database credentials are stored in this committed document. Raw local captures remain ignored under the owned private test directory.

**Independent Prime reproduction, fifth run:** From `/valet-platform/tmp/issue-333-prime`, the unchanged three test-code inputs reproduced **2 PASS / 3 strict RED FAIL** using a new task-owned PostgreSQL 17.11 cluster, port `63546`, run `8c70415fc99048978245cb84887ad5f0`. Each route's canonical CA revoke returned `201`, persisted Location A grant count was `0`, in-flight LM HTTP response returned `200` **with** its synthetic private marker, and a fresh HTTP `200` excluded the marker. Diagnostics respectively: contact PID `21820`, snapshot `1944:1944:`, elapsed reader/writer/fresh `115/80/33 ms`; customer visits PID `22908`, snapshot `1967:1967:`, `38/20/11 ms`; vehicle visits PID `22908`, snapshot `1990:1990:`, `42/23/18 ms`. All reader transactions reported `read committed`, blocking PID set `[]`. The runner exited **1 due solely to the three intentional security RED assertions**; post-run child databases `0`, child connections `0`, `OWNED_CLUSTER_DIRECTORY_REMOVED=True`. Private ignored traces: `tmp/issue-333-w4-private/evidence/issue333w4-8c70415fc99048978245cb84887ad5f0/`.

## Transaction diagnostics from real PostgreSQL

The test spies at the application authorization boundary but calls the actual authorizer first, then obtains connection metadata using a separate SQL statement on the **same held PostgreSQL transaction**. `pg_current_snapshot()` describes that *diagnostic statement*, not the exact earlier authorization aggregate `SELECT` snapshot. The ordering proof comes from the test gate after authorization, awaited canonical writer HTTP `201`, independent persisted grant count `0` and actual pending/fresh HTTP bodies. These diagnostics do not establish that an external SQL lock held the request; `pg_blocking_pids` was empty.

| Path | Run 3 backend PID / diagnostic snapshot | Run 4 backend PID / diagnostic snapshot | Isolation / blocking PIDs in both runs |
| --- | --- | --- | --- |
| Contact search | `4948` / `1951:1951:` | `17932` / `1964:1964:` | `read committed` / `[]` |
| Customer history | `4948` / `1974:1974:` | `17932` / `1987:1987:` | `read committed` / `[]` |
| Vehicle history | `4948` / `1997:1997:` | `25336` / `2010:2010:` | `read committed` / `[]` |

Each run's three route-specific results were independent authenticated HTTP requests. Run 3 measured forced-race reader/writer/fresh request elapsed times `44/20/44`, `44/21/39`, `49/26/15` ms respectively. Run 4 measured `847/817/43`, `47/22/15`, `55/30/18` ms respectively. Development timing summaries using the median for p50 and nearest-rank p95:

| HTTP elapsed time (mixed routes) | n | p50 | p95 |
| --- | ---: | ---: | ---: |
| Paused/in-flight LM reader | 6 | 48 ms | 847 ms |
| Canonical revocation writer | 6 | 24 ms | 817 ms |
| Fresh/uncontended LM reader | 6 | 28.5 ms | 44 ms |

These are small synthetic development samples, with a forced concurrency pause, heterogeneous routes, and heavy unrelated host contention in run 4. They cannot establish production latency distributions or SLOs.

## Reproducible immutable source identity

The private runner recorded these SHA-256 digests **before invoking Vitest** in fingerprinted run 4. Only this sanitized digest set is committed; raw response logs and the ephemeral cluster are not. The three test-code hashes remain identical in the independent Prime rerun. Windows line-ending normalization changed the raw runner/config byte digests between the W4 and Prime worktrees; the independent run re-attests Prime's exact inputs below and supplies its own trace. Do not use the historical runner/config digests as a claimed byte-for-byte match to Prime.

| Source path (worktree-relative) | SHA-256 |
| --- | --- |
| `apps/api/test/issue333-w4-visit-contacts.integration.test.ts` | `97448d55ddc9285634c027e09155e09d0d5380c955917dfc7dd9a494668ef5ab` |
| `apps/api/test/issue333-w4-visit-contact-race.ts` | `d068229ee8fc32dde42117c703cbfcd8d0a982bfb0c74db02cb3fedd72d77fae` |
| `apps/api/test/issue333-w4-private-lab.ts` | `3285e76668ac62e391f959f3d30701a00bb623d18f390f948fab04a13c2897f5` |
| `docs/validation/issue-333/w4-visit-contacts/vitest.config.mjs` | `3bcb3850c8314f80aaf65ec05467a09ad926dac6db6eb4443f6b3409bed9bb9f` |
| `docs/validation/issue-333/w4-visit-contacts/run-private-lab.ps1` | `51cf2084d722f245736a10ff716c13d4a6bb67b2bea31c7c9a6f347d72e4187c` |

Independent Prime run 5 runner/config SHA-256: `vitest.config.mjs` = `cfabf88a17c3b006995296865227f196774b3127d633738418ac902cb65a5b8b`; `run-private-lab.ps1` = `63e7c6298cd35a5dcaa46eba4e5c668e1a0cdf338e24527f50b2f5427dd08789`. The test-code digests equal those in the table.

## Interpretation and limits

- **Observed behavior:** repeatable private Location A contact/history body disclosure after successful canonical Location grant revocation, when read authorization began before revocation and protected projection continued afterward. This is a real HTTP/PostgreSQL transaction interleaving, not a mocked database result.
- **Security classification:** acceptance of in-flight grant revocation semantics needs the independent Accepted Decision review. `DEC-081` clearly requires immediate blocking of emergency/security disable, whereas ordinary grant revocation within a previously authorized read has a potential contract distinction. W4 makes no unilateral severity claim or runtime change.
- The test forces a bounded pause to reproduce a concurrency window. It does not establish prevalence under ordinary load, an exploit without precise concurrency, or the effectiveness of a proposed remediation.
- Direct ungranted/foreign subject ID history requests were not exercised as separate baseline negatives. The source queries include both organization and authorized Location predicates (`management-visit-contact-history-query.ts:76-79`), and the race tests exercise both customer/vehicle history, but this narrower extra negative remains unverified by W4.
- The first two runs did not capture per-request latency or backend snapshots. The two instrumented runs above cover those diagnostics without changing production code.

W4 only adds isolated test scaffolding and this sanitized evidence. There is no production code, grant behavior, schema, migration, dependency, API, UI, deployment, or CI configuration change.
