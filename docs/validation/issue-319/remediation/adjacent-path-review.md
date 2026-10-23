# Issue #319 — adjacent read-path classification (post-remediation investigation)

Scope authorization: Owner first approved production fixes for F319-01 Physical
Resources and F319-02 Configuration. After the independent discovery below,
the Owner explicitly instructed **"عالج المساران بطريقك"** (fix both paths),
authorizing the narrowly scoped F319-03 Branding and F319-04 Subscription
read-path remediation on the same #319 branch. Live Operations and all other
unconfirmed adjacent paths remain outside production change scope.

## Newly confirmed adjacent findings — historical RED, subsequently patched

| ID / provisional severity | Real HTTP route | Source cause | Repro evidence |
|---|---|---|---|
| F319-03 / P2 | GET /v1/staff/dashboard/locations/:locationId/branding | `apps/api/src/modules/dashboard/branding-command.ts:23-35,99-110`: bare LM `authorizeDashboardLocation`, then `loadBrandingRow` in same READ COMMITTED transaction without writer-compatible Organization advisory | `remediation/logs/adjacent-audit-tests.txt`: initial positive LM auth, canonical grant-removal SQL completes at 23155.186ms, protected 200 branding response at 23159.762ms; fresh GET 404; synthetic brand-name sentinel returned |
| F319-04 / P2 | GET /v1/staff/dashboard/locations/:locationId/subscription | `apps/api/src/modules/dashboard/subscription-read.ts:17-68`: bare LM `authorizeDashboardLocation`, then subscription projection without grant fence | Same log: grant removal completes at 23642.315ms, protected 200 response at 23649.836ms; fresh GET 404 with no subscription |

The historical tests are deliberately kept in their original raw logs; their
passing result proves the **old vulnerability**, never the correction. The
exact HTTP routes originate in `branding.controller.ts:49-90` and
`subscription.controller.ts:30-69`. The controlled barrier wraps the actual
LM authorization call; the application executes the real Nest controller and
database projection. The grant revoker invokes the supported
`staff_management_set_location_access(..., false)` SECURITY DEFINER function
under the private test runtime role; this specific adjacent proof is **real HTTP
reader + canonical SQL revoker**, not a real CA revoke HTTP request.

Both demonstrations use synthetic, same-Organization data for a formerly
eligible Location Manager, not an arbitrary foreign-tenant principal. P2 is
proposed due to the same narrow post-commit stale read impact and concurrency
precondition as F319-01/F319-02. This is an independently discovered pair of
defects, not a regression caused by the two approved patches: neither source
path was modified.

## Authorized narrow fixes and first GREEN proof

- Branding `readLocationBranding()` now takes a transaction-scoped canonical
  `staff-management-org` SHARED advisory after an LM `BASIC_BRANDING` eligibility
  hint, requires `READ COMMITTED`, rechecks the exact Location/Organization/
  membership/grant and `BASIC_BRANDING`, and keeps the lock through
  `loadBrandingRow()` and COMMIT. Existing Branding write operations were not
  changed; no Company Admin read fallback was introduced.
- Subscription `readLocationSubscription()` now does the same for an LM scope
  with **commercial requirement `null`**; this specifically preserves access
  to the subscription projection when Dashboard entitlement is disabled.
  Existing response data, Company Admin exclusion, and SQL projection stay.
- `remediation/logs/adjacent-fixed-first-audit-tests.txt` demonstrates the
  exact prior vulnerable revoker-first timing converted to safe HTTP **404**
  after canonical SQL grant revocation for **both paths: 2/2 PASS**, PostgreSQL
  17.11. Branding's synthetic private-name sentinel was absent from denial;
  fresh requests also denied. The test-only initial runner removed its owned
  cluster, with 0 child DBs and 0 child connections.

`remediation/logs/adjacent-ca-races-first-audit-tests.txt` adds real
MFA-assured CA Staff Management HTTP `POST .../location-access/revoke` in
**both orders for both Branding and Subscription: 4/4 PASS**. Reader-first
real backend PID blocks the EXCLUSIVE writer while the authorized projection
finishes with HTTP 200. Revoker-first external gate shows queued actual writer
and a later SHARED reader, with CA 201 before denied GET 404. Synthetic
Branding displayName and Subscription planCode sentinels cannot appear in
revoker-first/fresh-denial bodies. `remediation/logs/adjacent-eligibility-first-audit-tests.txt`
confirms **14/14 PASS**, 18 actual HTTP GET assertions across both paths:
valid LM exact response; CA MFA no fallback; wrong Organization/Location,
inactive membership, role downgrade and disabled User denied; Branding
commercial entitlement enforced; Subscription with disabled Dashboard
entitlement remains readable. Final full suite and independent review are
required before closure.

## Other adjacent source candidates and coverage limits

- Scope discovery (`dashboard-scope-discovery.service.ts:77-158`) rechecks the
  live Staff session and uses fresh READ COMMITTED grant/location SELECTs;
  in-flight canonical grant revocation before the grant projection yielded
  HTTP 200 with empty `items` in
  `remediation/logs/patched-full-audit-tests.txt`. This proves this selected
  ordering only; the entire discovery matrix was not exhaustively raced.
- Live history uses its own purpose-specific session SHARED row locks, MFA
  checks and staff-management Organization SHARED lock
  (`live-history-read-authorization.ts:18-287`). This was a source review,
  not a new deterministic Live Operations RR map interleaving.
- Management Visit Contacts and all other independent read families remain
  inventoried in `authorization-path-inventory.md`; no blanket safety claim
  follows from the two focused fixes.
- Independent read-only F319-05 review additionally identified **unverified
  same-pattern Company Admin `REPEATABLE READ` candidates**, NOT confirmed
  additional vulnerabilities: `dashboard/analytics-kpi-snapshot-transaction.ts:79-105`,
  `management/management-company-analytics.service.ts:23-34`, and
  `management/company-report-read-service.ts:80-92` may take their RR snapshot
  through an eligibility read before authoritative persisted MFA factor
  assurance. `management/company-report-export-service.ts:80-155` also has a
  distinct fresh READ COMMITTED finalization gate whose mitigation effect was
  not concurrency-tested. These other readers were not included in the Owner's
  narrow F319-05 **Physical Resources Overview** source authorization and
  therefore remain a separate investigation/approval gate. Do not extrapolate
  the Physical Overview patch to them or call them confirmed exploits.
- Privileged DBA SQL outside cooperative advisory locks and HTTP responses
  delivered before revocation are explicitly outside the accepted contract.
