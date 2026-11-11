# Issue #442 / #449 — U-003 Gate A focused evidence checkpoint (2026-11-11)

**Verdict: GATE A BLOCKED — INSUFFICIENT FINAL-CANDIDATE SECURITY QUALIFICATION.**
This is an evidence checkpoint, not an architectural plan or an approval.
The five Employee Native messages, production Outcome GET, Gate B, PR, merge,
deployment and feature activation remain **not performed / not authorized**.

## Scope and immutable governing contract

- Repository: `yamanradwan1-rgb/valet-platform`.
- Existing worktree: `D:\kndoom\valet-platform\tmp\issue-442`.
- Branch: `fix/issue-442-retrieval-cancel-state`.
- Verified local/upstream/remote HEAD at this checkpoint:
  `3e883576c6f924c580d18c71b342334cd3952ca0`.
- Owner-approved `DEC-112` version **3 Accepted**. This accepts a limited
  16-class, reason-only, *unobserved* post-proof residual, **not** known
  applicable revocation or credential-expiry exposure.
- Time ceilings remain **2,000 ms from admission to controllable handoff**
  and **150 ms from final complete protected proof before COMMIT to handoff**.
  A slow or uncertain COMMIT cannot restart the 150 ms lease.
- Preserve `DEC-081`, `DEC-108`, tenant isolation, original historical
  Membership, current Staff Session/authorization, and canonical history.
- Previous deadlock fixes `3fd6bab9` and `ad2df443` are ancestors of HEAD.

## Provenance and preservation

The published 2026-11-09 and 2026-11-10 local SHA256 manifests continue to
match **140/140** frozen ignored artifacts. All experiments and logs below
remain under **Git-ignored `tmp/u003/`**; none is production implementation.
The untracked additional 2026-11-11 CSV inventory is **NOT publishable**:
one stale v12 wire test hash/size was found among its 48 listed entries.
Do not stage, trust or alter it as a complete freeze without a new exact
audit. Old failures and logs are retained, not overwritten.

## Targeted PostgreSQL 17 / real HTTP evidence

These are separate cohorts, **not** one final source-generation matrix:

| Cohort | Observed result | Exact local log |
| --- | --- | --- |
| Typed COMMIT ACK lost v12 | 1/1 PASS, cleanup 0/0/0 | `u003-one-final-wire-acklost-v12-20261111-run1.log` |
| Matched transparent COMMIT ACK v13 | 1/1 PASS, cleanup 0/0/0 | `u003-one-final-wire-acklost-v13-20261111-run2.log` |
| Canonical Location lifecycle v1 | 4/4 PASS, cleanup 0/0/0 | `u003-canonical-location-deactivation-v1-20261111-run1.log` |
| Mounted Nest/Express v12 HTTP gate + v4 canary | 2/2 PASS, cleanup 0/0/0 | `u003-mounted-postproof-disable-v4-v12-20261111-run1.log` |
| Canonical history v1 writer-first | 1 PASS / 1 FAIL, cleanup 0/0/0 | `u003-canonical-history-v1-writerfirst-20261111-run1.log` |
| Canonical terminal completion v2 writer-first | 1/1 PASS, reader-first skipped, cleanup 0/0/0 | `u003-terminal-completion-v2-writerfirst-20261111-run1.log` |

The v13 ACK-positive runner's first attempt exceeded the test profile's
pool-count limit; its later isolated `api-postgres-race` run passed. The v1
history writer-first transfer-back passed; terminal completion v1 failed
with SQLSTATE `42703` from an **invalid test assertion** against
`handoff_verifications.location_id` (nonexistent column). Its replacement
v2 joins the verification to the exact `valet_sessions` org/session and
checks the actual session Location. Independent source review approved that
narrow correction, and the v2 writer-first runtime case passed. These facts
do **not** justify claiming reader-first completion evidence.

The Location tests show the canonical original active Location correctly
refuses deactivation with HTTP 409 while drain blockers exist, including a
live Shift or noncompleted ValetSession. A distinct fully drained Location
can be deactivated via canonical HTTP with once-only audit. No synthetic
direct SQL Location deactivation is promoted as a legitimate writer.

The mounted v4/v12 canary uses the actual Nest runner and global Staff
interceptor, tests a premature Controller `response.end()` after a real
proof, and observes no protected bytes before awaited observer release.
Its unblocked ACTIVE control yields canonical HTTP 200. Independent review
supports this narrow egress guarantee but **does not** prove that the
negative's exact final status came from User Disable rather than a later
150 ms lease expiration; it is not Gate A approval.

## Blockers that prohibit promotion to Gate A

1. **HTTP trusted metadata:** the existing v12 gate sanitizes 401/403/429
   errors but has no verified production rate-limiter issuer-to-typed
   `Retry-After` receipt. A numerical value or controller-provided setter
   is not trusted provenance. Metadata v2 remains unexecuted.
2. **Genuine known revocation:** the test-only `cancelKnownSecurity` method
   is not wired to production post-COMMIT User Disable, Session
   revoke/logout, Membership/role/Location grant or applicable MFA events.
   User-only interceptor observation and accepted *unobserved* post-proof
   residual must not be represented as full cancellation delivery.
3. **Exceptional resource ownership:** the default Vitest global PG harness
   can run `cleanupOwnedRun` and `DROP DATABASE ... WITH (FORCE)` after a
   test-local timeout, even if an HTTP or pg.Client operation has not
   settled. Independent reviewers blocked execution of the new unbounded
   reader-first v2, metadata v2 and exceptional owned-writer v5/v6
   candidates pending a proven parent-level quarantine/retirement gate.
   New ignored source is **unrun** and not a substitute for this proof.
4. **16-class final freeze:** Location active refusal and terminal
   writer-first evidence improved the matrix, but canonical completion
   reader-first, exact transfer-back reader-first, possible applicable
   role/MFA transitions, known-revocation handoff, and one frozen
   combined end-to-end candidate remain unqualified.
5. **Independent whole Gate A review:** no reviewer has approved a final
   immutable Backend authorization/HTTP candidate. A narrowly approved
   source or passing isolated suite does not imply this approval.

## Delivery boundaries and next safe actions

- Keep the same branch/worktree. Preserve the 140 manifest-frozen files and
  all later versioned scratch sources/logs without overwrite. Author a new
  versioned scratch file for any further experimental fix.
- Review any parent-level PostgreSQL test cleanup correction before
  executing affected resource-sensitive canaries; **do not** run parallel
  suites against the shared PG17 reservation.
- Reconcile exact source hashes and the 16 DEC-112 classes, independently
  approve one complete Gate A candidate, then—and only then—implement
  production `GET /v1/staff/tasks/:taskId/outcome`.
- Only after independent Gate B may the five approved Native recovery
  messages be implemented; preserve the current visual UI freeze.
- Issue tracking: [#442](https://github.com/yamanradwan1-rgb/valet-platform/issues/442),
  [#448](https://github.com/yamanradwan1-rgb/valet-platform/issues/448),
  active [#449](https://github.com/yamanradwan1-rgb/valet-platform/issues/449).

No Git-ignored logs, secrets, password-bearing environment values or
unapproved production artifacts are incorporated into this document.
