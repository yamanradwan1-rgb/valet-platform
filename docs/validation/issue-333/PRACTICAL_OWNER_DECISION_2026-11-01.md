# Issue #333 — Practical Launch-Security Owner Decision and Validation Scope

Date: 2026-11-01
Authority: Explicit final VAYLET Owner decision, Accepted amendment of DEC-108
and the emergency/global User-disable wording of DEC-081
Baseline: `6bcae7f1dc13a69d224a04ef0bdf66bb4844c7a0`
Status: **IMPLEMENTATION GO for the practical contract; runtime verification pending**

## Final Owner contract

1. After canonical `LocationAccess` revocation **commits**, every newly
   authorized protected request must use current persisted scope and omit/deny
   the revoked Location. Other independently authorized Locations may remain.
2. A request that passed its required authorization **before** the revoke
   committed may complete afterward. The Owner explicitly accepts that bounded
   in-flight residual risk.
3. Revalidate authorization close to protected database reads and response
   generation where practical. Do not reuse stale grant scope for a protected
   query when fresh authorization is required.
4. After global emergency User disable **commits**, invalidate affected Staff
   sessions and attention/push endpoints and immediately deny newly authorized
   protected requests. Attempt to cancel already-authorized in-flight responses
   on a best-effort basis; no absolute last-byte guarantee is required.
5. Preserve cross-tenant isolation, exact Location scope, Company Admin,
   Location Manager, Supervisor and Shift eligibility, MFA, CAS, audit integrity,
   operational truth and historical data.
6. No unbounded protected response stream or background operation may extend
   the accepted in-flight window.

This supersedes the earlier strict requirement for an old response to finish or
abort before the revoke/disable COMMIT. It does **not** authorize a newly
required authorization decision to rely on precommit authority.

## Old strict evidence versus new contract

| Existing evidence | Historical strict classification | Practical-contract classification |
| --- | --- | --- |
| F333 Live Map, Location directory and three Visit Contact stale HTTP responses after canonical revoke | RED against old no-postcommit-delivery rule; recorded tests and observations stay unchanged | Old response finish after commit alone is permitted if required authorization succeeded before commit; near-query freshness and new-request coverage still require verification |
| E001 two-process old HTTP 200/private response after User disable COMMIT, with fresh/queued 401 | RED against old immediate-current-delivery rule | Old response delivery alone is an accepted residual; fresh/queued 401 is positive narrow evidence, but session/push invalidation, best-effort cancellation and full new-request denial need their own checks |
| P001 A+B Visit Contact search: grant A revoked before aggregate SQL, old query returned A and count 2; fresh B-only count 1 | Strict RED, with source-level pre-aggregate timing and numeric assertion correction | Stale-scope query remains a concrete near-query revalidation concern. Recheck the protected read boundary under the practical rule; do not relabel a query that reused obsolete grants as safe merely because its HTTP request began early |
| U002 last-byte/egress-fence architecture impossibility analysis | Valid conditional counterexample to the former strict requirement | No longer an implementation blocker for this practical contract; it is not proof of runtime safety under the replacement |

The historical strict RED tests, immutable evidence, failed assertions, old
validation reports and original design NO-GO remain untouched. They must
continue to be labelled **historical strict evidence**, not quietly converted
to passing tests or deleted. The new practical implementation has **no verified
GREEN result yet**. No production exploitation or broader cross-tenant bypass
is established by these local synthetic schedules.

## Focused implementation acceptance

- Revoke-first and emergency-disable-first fresh protected requests reject the
  revoked Location or globally disabled User using persisted authority, across
  all affected read paths.
- Reader-first requests retain only the Owner-accepted bounded in-flight
  behavior; each new page, retry, or newly required authorization decision
  revalidates rather than inheriting an old grant snapshot.
- The P001 before-query schedule demonstrates current-scope revalidation before
  protected aggregate/search/count/latest/vehicle/cursor derivation; no
  cross-tenant or unauthorized Location data enters a freshly authorized query.
- Global disable invalidates affected Staff sessions and push/attention
  registrations, denies newly authorized protected requests and attempts
  best-effort cancellation of existing in-flight responses.
- Slow-client/disconnect behavior is bounded and cannot leave indefinite
  protected streams, held work or background response activity.
- Existing CA/LM/Supervisor/Shift, MFA, CAS, authorization-before-mutation,
  tenant/Location isolation, audit and historical-record tests still pass.

These are acceptance obligations, **not claims of tests run by this docs-only
amendment**. The Owner has explicitly stopped further investigation of
distributed last-byte guarantees, coordinators and egress gateways for #333.
Implementation is authorized under the practical rule; normal code review,
CI, independent integration, merge and deployment decisions remain separate.

Historical source references (unchanged):

- `docs/validation/issue-333/U001_OWNER_CONTRACT_AND_REMEDIATION.md`
- `docs/validation/issue-333/u002-resolution/OWNER_DECISION_GATE.md`
- `docs/validation/issue-333/u002-resolution/E001_CURRENT_STRICT_RED_EVIDENCE.md`
- `docs/validation/issue-333/u002-resolution/P001_CORRECTED_STRICT_RED_EVIDENCE.md`
