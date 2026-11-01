# Issue #333 U-002 / P-001 — multi-Location projection falsification

Status: **CONFIRMED VULNERABILITY — intentional mixed A+B HTTP RED** for
current C1 contact search; **no remediation candidate implemented**.
Baseline: `a4f5f2c6589b6be01b7db99cac4e6829986007f1`.
No production runtime change is authorized by this note.

## Exact source dependency

The Location Manager visit viewer derives `locationIds` from current
`membership_location_access` via
`apps/api/src/modules/management/management-visit-contact-authorization.ts`.
The three private response families do not consist solely of independent rows:

| Family | Relevant source | Scope-dependent protected fields |
| --- | --- | --- |
| Customer contact search (C1) | `management-visit-contact-search-query.ts:48-129` | `page` membership, `completedVisitCount`, `latestValetSessionId`, `latestLocationId`, `latestLocationName`, `associatedVehicles`, customer name/phone and cursor position |
| Vehicle contact search (C1) | `management-visit-contact-search-query.ts:140-181` | match eligibility, `completedVisitCount`, latest session/Location and plate |
| Customer history (C2) | `management-visit-contact-history-query.ts:40-97` | page rows, contact/phone, plate, `returningContact`, cursor and nested session/Location |
| Vehicle history (C3) | Same history query and subject filter | Same history fields for the Vehicle subject |

The search `scoped` CTE filters Sessions by the **snapshot's** allowed
`$2::uuid[]`, then computes count/latest/associated vehicles. The history
`returningContact` correlated `EXISTS` also filters prior Sessions by that
array. Thus filtering an already-built response's visible rows cannot remove
contributions from revoked Location A in aggregate fields, metadata or page
identity. This is an inference directly from SQL, **not** a tested disclosure
by a proposed fix (none is implemented).

## Required deterministic acceptance schedule

1. In a task-owned isolated PostgreSQL cluster create two Locations A and B,
   one LM principal with both grants, an independent CA with fresh MFA, and
   distinct synthetic private customer/plate sentinels and completed visits.
2. Through actual authenticated HTTP invoke each C1/C2/C3 read, pausing after
   the authoritative projection and before any protected HTTP emission.
   **This later gate is a required unexecuted variant**; the actual
   experiment below paused after authorization/scope capture instead.
3. Through the **canonical** Staff Management revoke endpoint remove only A,
   record the authoritative transaction COMMIT, then resume the reader.
4. Assert the old response has **no** Location A sentinel, A-derived count,
   latest visit, vehicle association, `returningContact`, cursor influence,
   pagination or sensitive error disclosure. If the candidate cannot prove an
   exact A-free recomputation, assert whole-response denial/abort.
5. Make a fresh B-scoped request and assert B remains authorized and its
   independent aggregate matches a B-only SQL oracle.
6. Repeat for writer rollback, unknown commit result, slow HTTP delivery,
   reader cancellation, two readers, inactive A per DEC-094, foreign Organization
   and same-Organization ungranted Location.
7. Record authenticated principal identities without credentials, PG backend
   PIDs, lock/snapshot order, row-count and sentinel **presence booleans**,
   HTTP finish/close, cleanup and exact test source/command.

**Gate:** The five old F333 RED cases remain **CONFIRMED VULNERABILITY** on
their prior baseline. For a future candidate, classify each variant
`VERIFIED SAFE IN TESTED CONTRACT` only with real PostgreSQL, canonical
writer and authenticated HTTP. A source review or green synthetic-only test
does not meet that bar; unexecuted scenarios remain **UNVERIFIED**.

## Actual private PostgreSQL / authenticated HTTP falsification

Prime added `apps/api/test/issue333-w4-mixed-privacy.integration.test.ts`,
included it in the already private W4 runner and source-hash record, and added
an optional **observation-only** callback to
`apps/api/test/issue333-w4-visit-contact-race.ts`. The original three
strict C1/C2/C3 RED assertions remain unchanged and active.

Exact command (isolated Prime worktree, 2026-11-01):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File docs/validation/issue-333/w4-visit-contacts/run-private-lab.ps1
```

Private run `70b157865ca544fb8eee35d12534d15b`, genuine owned PG17 with
random isolated child database and actual authenticated Management HTTP.
One synthetic customer and two synthetic completed visits were created:
Location A's plate `W4-P001-A` and Location B's plate `W4-P001-B`,
with distinct creation instants. A verified MFA Company Admin invoked the
canonical POST revoke for **A alone**. The test-only gate paused after
`authorizeVisitContactRead` had captured the A+B `viewer.locationIds`,
but **before** `queryVisitCustomers` executed. The revoke committed,
then the old request ran its real aggregate SQL using that stale scope.

| Witness | Actual observed |
| --- | --- |
| Canonical revoke POST result | HTTP **201** |
| Independent persisted A grant count after commit | **0** |
| Initial authorization SQL witness (before pause) | PG backend **29140**, `read committed`, snapshot `3132:3132:`; aggregate SQL executed after revoke |
| Old response after commit | HTTP **200**, **A plate still present**, B plate present, `completedVisitCount="2"` |
| Fresh authorized B-only response | HTTP **200**, A plate absent, B plate present, `completedVisitCount="1"` |
| Strict no-A assertion on previous response | **FAILED intentionally: RED** |

The distinct original C1/C2/C3 RED tests failed for their own protected
sentinels as expected. W4 suite result **4 failed / 2 passed / 6 total**,
2 Vitest files, exit **1** for actual security violations. The 2 PASS cover
baseline scope negatives and fresh role-downgrade denial; the four RED
failures are never recast as passing protection. Test log
`tmp/issue-333-w4-private/evidence/issue333w4-70b157865ca544fb8eee35d12534d15b/tests.txt`
remains ignored and locally retained; the harness verified **0/0** child
databases/other connections, stopped its own PostgreSQL and reported
`OWNED_CLUSTER_DIRECTORY_REMOVED=True`. It did not touch the historical
retained W3 artifact.

The confirmed gap is the **currently deployed source's old in-flight C1
aggregate** after the revoke. A row-only postfilter implementation was **not
created** and therefore has no runtime verification. C2/C3 shared-contact
aggregate recomputation, page cursor equivalence, slow-client and backend
failure schedules remain **UNVERIFIED** for any future fix. A distinct
pause **after the completed aggregate SQL** also remains **UNVERIFIED**
for this new P-001 A+B dataset, though historical C1/C2/C3 RED paths
are independently established.

## Owner design choice

Prefer **deny/abort the entire in-flight C1/C2/C3 response on an ambiguous
grant change** until fully scoped recomputation is proven. Recomputing the
entire SQL search/history, including cursor and count, is the less disruptive
alternative when proven. Neither is Accepted or implemented here.
