# F319-04 — Subscription LM GET after canonical Location grant revocation

**Finding:** confirmed P2 historical stale read. `GET /v1/staff/dashboard/locations/:locationId/subscription`
returned the previous same-Organization subscription details and IDs after a
canonical grant revocation committed; a fresh GET returned 404. See preserved
`logs/adjacent-audit-tests.txt` and `adjacent-path-review.md` (historical RED).

**Owner GO:** explicitly extended #319 authorization covers the Subscription
read only. `apps/api/src/modules/dashboard/subscription-read.ts` keeps the
original manager check's **commercial requirement `null`**, obtains a SHARED
`staff-management-org` advisory within its `READ COMMITTED` transaction,
revalidates active exact LM grant/Organization/Location/membership after the
lock, and holds it through original subscription SELECT/projection/COMMIT.
No Company Admin fallback or `DASHBOARD_ACCESS` entitlement was added;
response schema and frontend remain unchanged.

**GREEN:** `logs/adjacent-fixed-first-audit-tests.txt` under this directory,
1 of 2 route cases: prior committed canonical SQL revoke and stalled in-flight
GET lead to HTTP 404 with no Subscription data; fresh GET also 404.
`logs/adjacent-ca-races-first-audit-tests.txt` adds both Subscription-specific
real CA MFA Staff Management HTTP revocation orders (**2/4 PASS**): a valid
LM reader with a SHARED fence returns authorized synthetic planCode before
the blocked writer commits 201 (actual reader and writer PID dependency
observed); queued earlier writer 201 causes later reader HTTP 404 with
neither planCode sentinel nor subscription fields. Eligible LM real HTTP 200
was also asserted before both races. `logs/adjacent-eligibility-first-audit-tests.txt`
adds 7 Subscription-specific real Nest/PG cases within **14/14 PASS**:
eligible LM exact subscription/entitlements; MFA-assured CA forbidden;
foreign, ungranted or unknown Location; inactive membership; downgraded
LM; disabled User; and critically a subscription with
`DASHBOARD_ACCESS=false` remains a valid HTTP 200 projection reporting the
actual disabled entitlement. Final full suite and test SHA remain gates.
