# VAYLET #215 — P3 qualification groundwork and remaining gates

**Status: PARTIAL — preparatory code only / P3 qualification NO-GO.**

**Base:** P2 code-delivery SHA `a69a69b405cb5b9ba79211fab9a9b7b310a939e5` on isolated branch `codex/issue-215-p3-qualification`. P2 is **not merged into main or security-qualified**. `main` remains at the P1 baseline, `dbb0f8f3ae64bd5b42b22c521c5e52ca78f41e6d`.

**Authority:** DEC-104 (accepted C1 / QR-pattern UI-X1), [master plan P3](../plans/ISSUE_215_VERIFIED_CONDITION_PHOTO_MASTER_PLAN.md), existing security issue [#65](https://github.com/yamanradwan1-rgb/valet-platform/issues/65) and parent [#215](https://github.com/yamanradwan1-rgb/valet-platform/issues/215).

## Implemented and testable (unwired)

`apps/api/src/modules/valet-sessions/condition-photo-qualified-receipt.ts` is an **internal P3 preparatory utility**, not an activated condition guard:

1. SQL candidate selection requires the exact Organization/Location/ValetSession and `CHECK_IN_CONDITION` purpose, P1 operation VERIFIED, selected attempt and current availability AVAILABLE; bounded newest-first at ten.
2. Out-of-transaction exact private-object-version `readExact`, byte length and timing-safe SHA-256 comparison, with read buffer zeroing on all paths.
3. Opaque WeakMap-registered server-only proof bound to internal request nonce and full scope; an arbitrary client/DTO object or stale proof cannot qualify.
4. A separate **in-transaction read-only predicate** intersects proof with current DB operation/attempt, exact key/bucket/version/digest/size, selected attempt and AVAILABLE state. No storage I/O in this predicate.

These functions have **not** been wired into `evaluateLockedCheckInConditionGuard`, the condition marker, final Check-In completion or discovery. This is intentional: no security/provisioning evidence authorizes turning on required-photo qualification yet. The existing `FALSE AS qualifying_photo_present` and discovery `qualifyingPhotoPresent: false` remain unchanged and fail-closed.

### Focused local evidence

- `pnpm --filter @valet/api exec vitest run --config vitest.config.mjs --project api-non-postgres test/condition-photo-qualified-receipt.test.ts` — **4/4 PASS** (selected verified/available exact scope, forged/missing receipt denial, request/tenant binding, corrupt bytes/version denial). Uses fake read/query results, **not** an approved provider or actual P3 transaction race proof.
- `pnpm --filter @valet/api typecheck`, targeted ESLint, `pnpm architecture:check`, `git diff --check` — **PASS** (the architecture check reported only existing grandfathered oversize-code warnings; no new violation).

## Why P3 cannot receive a phase GO yet

- [#282](https://github.com/yamanradwan1-rgb/valet-platform/issues/282): real private S3/MinIO provider configuration, stable read-after-write/version semantics, access, immutability and independent review not approved.
- [#283](https://github.com/yamanradwan1-rgb/valet-platform/issues/283): exact bearer refresh/logout/revocation/T2 lock races not independently proved.
- [#284](https://github.com/yamanradwan1-rgb/valet-platform/issues/284): full real HTTP → restricted PostgreSQL → S3 → Audit proof absent.
- [#285](https://github.com/yamanradwan1-rgb/valet-platform/issues/285): crash/unknown PUT/tombstone/second replica proof absent.

**Remaining P3 implementation after prerequisites close:** add authorized/short preflight candidate query, check exact bytes outside any DB transaction, pass fresh internal receipt only to the existing condition and final-Complete guards, reuse current settings/session/advisory order and current photo policy, preserve idempotent marker response versus final current-policy recheck, cancellation/version/AuditEvent atomicity. Update discovery conservatively without S3 calls inside its current PostgreSQL transaction. Actual concurrent PostgreSQL/provider, invalid/legacy, optional zero-photo and deleted/corrupt evidence tests plus independent security/domain review are mandatory.

**Independent final code-diff review:** requested; unless a final reviewer explicitly signs off on the exact staged diff, this partial branch is **review pending**, never P3 GO. Prior read-only architecture advice does not substitute for reviewing the authored files.

## Later phases already tracked

- P4 Native portable flow/QR-pattern UI-X1: [#289](https://github.com/yamanradwan1-rgb/valet-platform/issues/289).
- P5 policy, privacy/retention and backup: [#288](https://github.com/yamanradwan1-rgb/valet-platform/issues/288); maintenance/integrity/cleanup [#290](https://github.com/yamanradwan1-rgb/valet-platform/issues/290).
- P6 physical Android/CI/integrated release evidence: [#291](https://github.com/yamanradwan1-rgb/valet-platform/issues/291).

No PR, merge, production flag, storage provisioning, UI edit, APK, deployment or issue closure is authorized/claimed by this partial P3 branch.
