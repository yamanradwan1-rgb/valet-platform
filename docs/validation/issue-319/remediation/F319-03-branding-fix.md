# F319-03 — Branding LM GET after canonical Location grant revocation

**Finding:** confirmed P2 historical stale read, distinct from F319-01 and
F319-02. `GET /v1/staff/dashboard/locations/:locationId/branding` returned
the synthetic Organization-name sentinel after a canonical `staff_management_set_location_access(...false)`
revoker committed, with a new GET correctly denied. See immutable historical
`logs/adjacent-audit-tests.txt` and `adjacent-path-review.md`; the original
passing REPRO is a vulnerability demonstration.

**Owner GO:** explicit second authorization to fix this specific route within
Issue #319. In `apps/api/src/modules/dashboard/branding-command.ts` only the
read method uses `requireAuthorizedReadScope`: same LM-only `BASIC_BRANDING`
hint, canonical `staff-management-org` SHARED transaction advisory, mandatory
`READ COMMITTED`, post-lock exact same membership/Organization/Location/grant
and branding-entitlement recheck. The same transaction holds its fence through
the original branding SQL and response projection. No CA fallback, mutation
handler change, response schema or frontend changes.

**GREEN:** `logs/adjacent-fixed-first-audit-tests.txt` under this directory,
1 of 2 route cases: after canonical SQL removal commits before the reader
acquires the fence, the in-flight HTTP result and fresh request both return
404 without the private sentinel. `logs/adjacent-ca-races-first-audit-tests.txt`
contains both Branding-specific real CA MFA Staff Management HTTP revocation
interleavings (**2/4 PASS**): an already fenced Branding reader projects 200
with sentinel before the blocked writer commits 201 (exact reader backend
PID observed by `pg_blocking_pids()`); a queued earlier CA revoker commits
201 before the later Branding GET denies 404 without the sentinel. An
uncontended eligible LM 200 is also asserted in both race preparations.
`logs/adjacent-eligibility-first-audit-tests.txt` adds 7 Branding-specific
tests within a **14/14 PASS** real Nest/PG matrix: exact stored projection
for eligible LM; MFA-assured CA, foreign tenant, ungranted or unknown
Location, inactive membership, downgraded LM role and disabled User denied;
`BASIC_BRANDING=false` fails even with `DASHBOARD_ACCESS=true`.
Final test SHA and independent review remain recorded in
`FINAL_REMEDIATION_ACCEPTANCE.md` after final suite validation.
