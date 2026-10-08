# T4 — Compatibility, gap register and T6 qualification handoff

This register separates source-level preparedness from staging/production
qualification. The T4 Owner-approved U-09 architecture is **not reduced**.
`PRODUCTION INFRASTRUCTURE QUALIFICATION: NOT VERIFIED` until operator proof
is attached. Do not activate enrollment or T3 ACTIVE from this document.

## 1. Compatibility and loss/recovery matrix

| Combination or failure | Invariant | T4 code/test or additional proof |
| --- | --- | --- |
| Customer current → compatible API current | Same-origin credential; canonical read; no internal origin visible in browser | Build-contract/Customer readiness tests pass; public HTTPS proxy pending |
| Customer previous → API current | Old browser page can restore valid persisted Browser Session | Existing T1 compatibility contract; old build artifact and staging proof pending |
| Customer current → compatible previous API | No new unrecognized required Guest endpoint before mixed rollout | Operator must enumerate prior release contracts; no speculative compatible version approved |
| Old Browser page, new API | Cookie continues to authorize same visit; no login/session swap | T1 restore and explicit switch tests plus real browser matrix in T6 |
| Old Service Worker and new public assets | No stale/static mismatch, secrets never cached | Existing SW narrowing; physical old/new cache tests and immutable assets evidence pending |
| Two API processes / independent pools | DB-backed session authority, no sticky process sessions | Real DB integration suites authored; pre-fix T4 DI crash corrected, post-fix database execution still unverified |
| Active visit through restart | Same current generation, read/operational scope | DB-backed authority plus stage kill/recovery evidence pending |
| Staff reissue / revoked Browser Session | Old generation invalid everywhere; no resurrection | T1 SQL invariants; cross-replica tests authored but not executed successfully |
| POST response lost after commit | No auto replay or duplicate retrieval/handoff; canonical GET reconciliation | T2 preserves explicit recovery; DB-authoritative integration test awaiting valid environment |
| Single Customer/API replica fails | Ready others continue; recovery ≤30s | No actual independent instance proof; staging chaos authority pending |
| DB failover | No wrong authority, preserved revocations, recovered ≤120s | Provider capability/connection recovery and measured timeline pending |
| Rollback onto prior compatible artifact | All existing Browser Sessions resolve; revocations and history persist | Requires release manifest + additive schema version matrix before rollout; no destructive downgrade |
| Post-visit COMPLETED | 24h limited read/rating/receipt; never reopens custody | Preserve T1 policy; cross-version physical tests pending |
| Another Organization target link | Independently authorize target, explicit context switch, source preserved on failure | Preserve accepted T1 cross-Org transaction rule; no proxy tenant inference |

**Compatibility floor:** Never deploy or roll back to an API that cannot
resolve an already enrolled Browser Session; no stale secret generation,
implicit authority transfer or destructive database rewind is allowed. Old
client versions must be identified by actual release artifacts. No runtime
compatibility has been fabricated merely because additive SQL exists.

## 2. Decision and gap register

| Missing exact fact / class | Blocks | Authority to resolve | Safe next action |
| --- | --- | --- | --- |
| Real approved Customer HTTPS hostname and TLS end point — `REQUIRES OPERATOR CONFIGURATION` | Prod build, cookies, issue #224 | Owner + infra operator | Inspect DNS/certificate/routes read-only; approve origin and verify HTTPS |
| Real server-only API build-time origin — `REQUIRES OPERATOR CONFIGURATION` | Production artifact proof, issue #227 | Infra operator | Provide authorized `API_ORIGIN` build secret/config; run `pnpm build:production` and artifact validator |
| Authenticated Native public/private ingress design — `REQUIRES RUNTIME PROOF` | Deployment | Infra/network operator | Confirm Native route and TLS/auth preservation in staging |
| Proxy header overwrite/strip and exact trusted CIDRs — `REQUIRES RUNTIME PROOF` | Secure anti-abuse production | Ingress operator/security | Discover actual hops; safely spoof in isolated staging; never set 0/0 |
| 2 Customer + 2 API independently failing instances — `REQUIRES OPERATOR CONFIGURATION` | U-09 HA | Owner/infrastructure provider | Approve region/zones/LB/service instances and verify failure domains |
| Managed PostgreSQL HA/failover/backup/provider — `REQUIRES RUNTIME PROOF` | DB recovery | DB provider/operator | Obtain config and run approved staging failover/restore |
| Database RPO and backup restore evidence — `OWNER DECISION REQUIRED` once provider facts known | Production launch | Owner + DB operator | Document acceptable RPO after real provider measurement; do not guess |
| Proxy LB retry policy, drain routing and 10s API grace — `REQUIRES RUNTIME PROOF` | Mutations/instance recovery | Ingress operator | Prove no blind POST replay, ready/unready routing, measured failover |
| Real immutable release store and compatible rollback artifact — `REQUIRES OPERATOR CONFIGURATION` | Safe rollout | Release operator/Owner | Choose hosting-specific digest/manifest/atomic switch and set rollback floor |
| Monitoring provider, retention, complete histogram ingestion — `REQUIRES OPERATOR CONFIGURATION` | Alert SLO qualification | SRE/operations | Connect bounded metrics without sensitive labels; inspect dropped samples |
| Real pager destination, primary/backup and escalation — `OWNER DECISION REQUIRED` | Alert delivery qualification | Owner + operations lead | Assign responders; staging synthetic page, ACK and recovery notice |
| Staging writable disposable PostgreSQL and representative proxy — `REQUIRES OPERATOR CONFIGURATION` | Real cross-replica suite/drills | DB/security/operator | Confirm database isolation, privileges, reset eligibility; run scoped tests |
| Pre-fix T4 observer DB ownership caused a NestFactory test startup failure; now corrected — `REQUIRES TEST EXECUTION` | DB integration-test qualification | Engineering/CI operator | Rerun new and T3 two-replica suites only against confirmed disposable PostgreSQL; no pass is claimed |
| T3 final aggregate PG validation interrupted on Owner request — `REQUIRES RUNTIME PROOF` | T3 ACTIVE/release | Owner + engineering | Run separately approved T3 qualification, retain COMPATIBILITY until then |
| T2 35s stale threshold vs outdated 15s T6 plan text — `CONFIRMED FROM DOCS` | T6 qualification documentation | Owner/T6 lead | Align **T6 evidence criterion** to approved 35s; do **not** change T2 runtime |
| Initial baseline architecture/test issues — `OUT OF SCOPE` | Aggregate green CI | Relevant feature maintainers | Track separately; don't silently edit Dashboard/Employee/DB during T4 |

Issue **#224** and **#227** remain open/evidence-pending. Do not close either
without true public HTTPS, real production origin/build and Owner approval.
No new material product decision is invented in T4; U-09 remains accepted.

## 3. Exact remaining Owner/operator permissions

- Written staging identity and permitted read-only/non-disruptive inspection;
  separately authorized, isolated mutation fixtures and fault injection.
- Approval of final region/provider, failure domains, proxy hop/CIDR contract,
  public hostname, private API link and Native ingress.
- Approval of managed DB failover/backup/RPO, credential least privilege,
  migration execution time (if actually required by other tasks) and restore
  target. T4 contains **no schema migration**.
- Release signing/digest, previous compatible artifact, rollback operator and
  emergency stop authority. Enrollment and T3 ACTIVE remain unchanged.
- Named on-call/destination and synthetic-alert/real-recovery evidence.
- T5 product gap decision/release and T6 full qualification and go/no-go.

## 4. T6 handoff — NOT T4 implementation

T6 must own the **complete Customer browser E2E CI lane**, old/new Browser
Session/Service Worker matrices, physical iOS/Android/PWA cookie-jar behavior,
EN/AR/RTL/white-label accessibility and exact same-origin public HTTPS flows.
In particular prove the T2 accepted **21s ±1s** visible cadence, **never
faster than 20s**, stale indication **35s**, no background/hidden polls,
coalesced wake/reconnect, Retry-After, no blind protected mutation replay and
handoff proof clearing after loss of trust. Do not use obsolete 15s.

T6 also owns sequential **100 / 500 / 1000** concurrent Guest qualifications,
**eight-hour and 26-hour soaks**, real latency/5xx/pool/cleanup metrics,
same-NAT anti-abuse protection, real 2x2 failure-domain availability, one
Customer/API instance drain/hard failure and measured application failover,
managed PostgreSQL failover/backup restore, release rollback rehearsal,
alert route delivery and data/security correctness. U-09 demands **99.9%**
monthly availability, app recovery ≤30s, DB recovery ≤120s and zero
unexpected active access loss, duplicate effects or cross-tenant disclosure.
There is currently **no measured** RTO/RPO, load/soak result, or production
monitoring delivery proof.

## 5. Strict readiness verdict boundary

`T4 CODE READY FOR INDEPENDENT OWNER MERGE REVIEW` may be reported once the
final diff passes focused implementation/security reviews without P0/P1
code blockers. This is **not** approval to deploy. `PRODUCTION INFRASTRUCTURE
QUALIFICATION: VERIFIED` is prohibited until real authorized evidence is
attached for the exact U-09 topology and targets. Escalate mismatches between
binding documents rather than silently selecting weaker availability.
