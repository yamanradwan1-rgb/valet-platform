# VAYLET #300 — Owner product-availability correction (2026-10-20)

**OWNER DECISION: ISSUE #300 INVESTIGATION IS AN APPROVED PRODUCT FEATURE INTENDED FOR NORMAL PRODUCTION USE BY AUTHORIZED COMPANY ADMINS AND LOCATION MANAGERS.**

This supersedes the assistant-added development/test-only controller/tab and
global production `migrate:deploy` refusal introduced in consolidation commits
`678ee8dc` and `a91be687`. Those commits and previous dated reports remain
historical facts; this record does not silently rewrite them. Concept A,
U01–U06, U-001 through U-005, UI-M1 and DEC-077/104 remain unchanged.

## Precise gate classification

| Control | Function | Correct operation |
| --- | --- | --- |
| Existing Staff credentials/MFA/current commercial access | Security | Always required, including for CA and LM |
| Current Org/Location and Membership grants | Security | Revalidated in DB transaction per request; deny foreign tenant, ungranted LM, Supervisor |
| HMAC-signed cursor | Integrity | Bind current auth session, role, exact Location, filters, current Incident Location policy and expiry; reject tampering |
| PostgreSQL transaction snapshot and immutable relation provenance | Historical correctness | Preserve with signed continuation and per-request snapshot/SQL checks |
| Unsupported NULL-direct Task/Incident/Vehicle/PARKED Audit cohort | Historical correctness | Fail closed for affected continuation; no guessed parent or inferred Session association |
| Mutable vehicle-label filters crossing page boundary | Consistency | Continue to fail closed rather than claim stable pagination without identity revision evidence |
| Owner-signed U005 indirect proof admission | Isolated certification lane | Remains restricted to exact signed test candidate, **not** a normal product access flag |
| Consolidation-only production disablement | Assistant-added product restriction | **Removed**; real controller routes and CA/LM tabs register in production |
| Consolidation-wide `migrate:deploy` refusal | Assistant-added operations restriction | **Removed**; original production TLS/database connection preflight remains |

Ordinary authorized Search, Filters, Timeline and direct Event Detail use
the real application controllers and source readers, not demo fixtures. Their
first page and continuation are permitted when the historical-cohort veto,
signed-cursor, grant/MFA and consistency checks pass. A `503` for a specific
unproven historical cohort or mutable vehicle-label pagination is **not** a
permanent global feature disablement. Existing Audit Events remains
unchanged and available to its previous roles.

## Exact implemented source boundary

- `apps/api/src/modules/management/management.module.ts` registers both
  Investigation controllers and normal HTTP middleware unconditionally.
- `apps/dashboard/src/features/audit/audit-page.tsx` offers Investigation for
  persisted Company Admin/Location Manager LOCATION scope without requiring
  query flags or development mode. It defaults to Audit Events, and never
  treats Supervisor or subscription-only privileges as Investigation access.
- `search/audit-investigation-search.service.ts` and
  `timeline/timeline-read-service.ts` enforce current scope/MFA via existing
  persisted authorization, HMAC-bound/short-lived cursors and protected
  historical cohort verification for continuing pages in every environment;
  each cursor binds the *current* Location Incident policy to its digest.
- `audit-investigation-u05-indirect-guard.ts` rejects only candidate
  **NULL-direct** Audit/parent histories from the unsupported entity families
  (and respects exact Org/Location/snapshot); direct authorized Audit entries
  do not cause an unrelated blanket veto.
- `packages/database/scripts/run-migrate-deploy.mjs` retains original
  `parseMigrationDatabaseUrl` and production TLS verification. The previous
  all-environment migration helper is deleted. **This is NOT authorization
  to execute production migrations in this source integration chat.**

## Actual evidence vs gaps

Combined-source historical results: Contracts 473/473, Employee Client
843/843, Dashboard 947/947, focused API 137/137, Native 1692/1692, V3 source
49/49, builds/typechecks/lints PASS on the earlier combined code SHA.
On the Owner-corrected source, a genuine NestJS **production-mode HTTP
transport smoke** now verifies four route registrations/dispatches plus
single Authorization-header enforcement. Its services and Staff resolver
are intentionally *mocked*: it is **not** real CA/LM MFA, database-backed
authorization, historical SQL or owner production acceptance. Existing
`investigation-authorization` tests cover CA, LM, Supervisor denial and
cross-scope denial with a mocked persisted Audit authority; source-only
signed cursor negative tests cover role/Location/session/expiry/policy changes.

**Outstanding:** disposable PG17 source migration 93→96 fresh/populated,
concurrent killed95 and ACL proofs, normal genuine CA/LM MFA with current
Location grants, HTTP Search/Timeline/detail direct/indirect real cohort
matrix, UI-M1 34 real authenticated Playwright screenshots/interaction,
100k/1m stress and cold runs. The historical 79 rows remain 57 BLOCKED,
22 NOT RUN until genuinely re-executed; they do not become PASS merely by
enabling a source route. Original Owner private-key/build certification
exception is **NOT CRYPTOGRAPHICALLY VERIFIED**. Do not bypass the signed
U005 proof-only verifier.

**Known bounded-functional limitation (not a cryptographic waiver):** a Search
with mutable vehicle make/model/plate/country filters and *more than one
page* still responds with a scoped `503` rather than falsely asserting that
current mutable labels are stable under the old database snapshot. The
vehicle-identity mutation/restart oracle or an explicit Owner-approved
partial-result contract remains necessary to make this filtered continuation
fully available. Ordinary immutable-filter multi-page queries require the
NULL-direct cohort verification and signed cursor. No claim is made that
every approved filter works at high volume already. This limitation must be
treated as a release-review finding, not silently hidden in a PASS status.

## Production-safe operational checklist (not an executed deployment)

1. Confirm exact release commit, owner-approved destination and PG17 engine;
   inventory the DB's `_prisma_migrations` 1..93 SHA256 checksums, failed and
   unknown migrations, backup/restore readiness and lock admission.
2. Review and execute forward-only 94,95,96 via the existing secure migration
   role and production TLS-verified `migrate:deploy` workflow, in a separately
   authorized deployment with bounded downtime and rollback. Do not execute
   migrations against an unauthorized tenant, human, QA or production DB.
3. Confirm six `pagination_birth_xid` columns, 12 birth triggers and 6
   provenance/attribution immutability triggers, runtime role permissions,
   legacy null behavior, and no unauthorized indirect cohort activation.
4. Deploy matching API and Dashboard builds only after schema verification.
   Configure `DATABASE_URL`, HMAC cursor key, real Staff/MFA and commercial
   roles through the normal secure deployment process; no test-only signed
   lease/flag is an activation prerequisite.
5. Run real CA/LM positive and Supervisor/foreign/expired MFA negatives,
   Audit Events regression, Search+Timeline+Detail+cursor multi-page reads,
   source privacy, EN/AR and RTL/LTR UI-M1, async Native Incident/photos.
6. Monitor 401/403/404/503 rates, incomplete cohort vetoes, DB locks,
   query latency, cursor restarts, Incident idempotency and photo custody.
7. Source rollback is the previously verified API/Dashboard client build;
   never DROP or reverse committed immutable source history to roll back a
   binary. DB contingency needs its own reviewed forward repair/restore plan.

**Release qualification:** source enablement is implemented, but deployment,
actual DB schema upgrade and real authenticated production behavior have NOT
been executed in this integration. CI and independent latest-SHA P0/P1 review
must be checked before GitHub merge. No issue is auto-closed.
