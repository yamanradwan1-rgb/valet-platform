# Issue #416 — Production rollout and rollback gates

**Status: NOT AUTHORIZED.** This checklist records Owner-approved v9 and Option A S1/U1/U2/L1/L2 requirements, not a new deployment decision.

## Production-readiness gate inventory

| Gate | Evidence required | Status |
| --- | --- | --- |
| Original test DB | Officially approved W9 Migration113 failed-history repair; actual PG17 fresh and upgrade paths, exact checksums | BLOCKED |
| VAP1 proof | Genuine credentials, purpose-limited signer, 18-field and U2 20-field HMAC Node/PG parity, same transaction/XID and replay negatives | NOT RUN |
| SQL ACL | Private NOLOGIN custody, effective runtime/PUBLIC/inherited denials, no ordinary SQL key read, old overloads and provisioner twice | NOT RUN |
| 35 U2 records | Each actual executable writer protected or safely retired, legacy paths maintained until coordinated cutover | NOT VERIFIED |
| A01 and R02/R03 | Real binder+finalizer, committed immutable receipt, all six 15-minute quotas including pre-parser malformed attempts, unknown COMMIT recovery | NOT RUN |
| Race matrix | All 21 approved independent-PG-connection races, both lock orderings, deadlocks, rollback and reconciliation | NOT RUN |
| L1/L2 | Full all-status T0 parent/tenant roster, two independently authorized Ed25519 operators, monotone external checkpoint, old credential revocation, N→R→N rehearsal | NOT VERIFIED |
| Reset backend | Three frozen routes, CA/target tenant eligibility, five-minute exact-session MFA, 15-minute DB clock, CAS/replay, one disclosure and atomic session/refresh/push revocation | NOT RUN |
| Dashboard and public page | EN/AR RTL/LTR dark/light responsive accessibility, copy-once and non-disclosing errors, fragment removed before untrusted scripts, no-store/no-referrer/CSP | NOT RUN |
| Exact SHA | Independent cumulative source/security reviews, source/PG/HTTP/Playwright regressions, lint/typecheck/build/architecture/Gitleaks, GitHub CI and Security CI | NOT RUN |
| External operating controls | Production key escrow/rotation and secret injection; encrypted backups, restore rehearsal, observability/alerts/on-call and cutover approvals | NOT VERIFIED |

## Rollout order — only after every mandatory gate passes

1. Freeze one independently reviewed immutable SHA. Obtain separate Owner authorization for non-force feature-branch push and Draft PR; require exact-SHA CI and Security CI evidence.
2. Obtain separate production migration/cutover authorization with environment/tenant and privilege inventory, encrypted backup, key ownership/rotation, monitoring and rollback decision owner.
3. Stage additive forward-only DB migrations with default OFF flags; verify normal Staff Auth, refresh, MFA, Management and operational regressions and effective SQL grants before enabling a protected writer.
4. Perform independently attested all-status T0 and L1/L2 staged admission, actual old-session/refresh/push fences, old-writer denials, provisioner-twice tests and exact N/R compatibility.
5. Activate purpose-scoped proof signer, durable anti-abuse ingress and private reset commands only for independently attested isolated rehearsal; validate issuance, anonymous redemption, no bearer disclosure on retry, 429/503/401 concealment and unknown COMMIT.
6. Run a separately approved small production cohort only after explicit activation approval, inspect audit/receipt/limiter and tenant-safety telemetry, then approve or refuse expansion.

## Emergency HOLD, rollback and limits

- Turn server-side reset admission OFF and HOLD unverifiable authority. Do not regrant legacy SECURITY DEFINER or direct DML capabilities merely to restore UX.
- A committed password change, reset token consumption, Staff-session/refresh revocation or push-token clearing cannot be safely undone by restoring a stale database snapshot; require normal reauthentication and controlled recovery.
- Keep forward-only migration source/history immutable. No automatic database reset, direct Prisma history edit or rollback of committed credentials/audit.
- An older backup cannot revive later revocations, key retirements, consumed codes, MFA changes, entitlement denials, reset generations or signed receipts. Require a complete independently checked monotone external checkpoint.
- On key compromise, unverified receipt, lost COMMIT, unsigned T0 parent or source/DB mismatch: fail closed, retain PENDING/UNKNOWN limiter evidence, do not issue a second raw reset bearer, and require explicit reconciliation/rotation approval.
- Any cross-tenant defect, credential-forgery path, signer oracle, private HMAC visibility, old-writer bypass, quota discount, audit forgery or unclosed mandatory race means NO activation or rollout.

**Distinct external authorizations required:** W9 guarded Prisma bookkeeping; feature-branch push/Draft PR; merge; real signing-key provisioning; production migrations, cutover, activation, rollback/restore and Issue closure.

**Current verdict: isolated fixture identity PASS only; protected SQL and production readiness NOT VERIFIED.**
