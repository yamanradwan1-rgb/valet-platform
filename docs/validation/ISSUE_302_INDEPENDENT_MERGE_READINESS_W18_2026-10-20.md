# Issue #302 — W18 independent native crypto / Incident merge-readiness review

**Date:** 2026-10-20. **Method:** READ-ONLY source/history/document review;
no device, API, DB, secrets, signing keys, APK execution or production access.
**Verdict:** **SOURCE INTEGRATION MATCH VERIFIED; CONDITIONAL CODE-REVIEW
READY, NOT INDEPENDENT INCIDENT EXACTLY-ONCE ACCEPTANCE OR RELEASE PASS.**

## Exact Git provenance (locally available refs)

- Read-only target worktree: `D:/kndoom/valet-platform/tmp/issue-302-303-isolated`,
  branch `codex/issue-302-303-native-crypto-photo`, exact HEAD
  `e92f7f0c732ee53f26ccc45361c69b66f7296cfb`. Its existing untracked
  `apps/valet-native/modules/vaylet-battery-status/android/build/` was
  preserved untouched; it is not part of the 49-file tracked patch.
- Local `origin/main` and exact merge-base:
  `6d7bd5991e66d8f5d93978512352a52c72bdc7f6`.
  `git rev-list --left-right --count origin/main...HEAD`: **0 behind,
  4 ahead**. This is comparison with the locally stored remote-tracking ref;
  no network fetch was made to prove the current remote state.
- Linear ancestry:
  `ad5ab76d58ae62eafedacba0cd21342f113dda9b` (pinned diagnostics) →
  `07d6feaf37d2e21b451795c5d40cb051076a3466` (Expo CSPRNG) →
  `bc2485e0c2756d47489d94d8a2f54b10c07d0cfe` (photo async copy) →
  `e92f7f0c732ee53f26ccc45361c69b66f7296cfb` (QA documentation).
- Entire #302/#303 source patch versus `origin/main`: **49 tracked files,
  3,156 insertions / 170 deletions**. `git diff --check
  origin/main...e92f7f0c` **PASS**.
- Prime's available consolidated SHA
  `ecc7b3a2563a7a017d3ad299594bb2549e601ff1`: target
  `e92f7f0c` is an **ancestor**; all **49/49** target-changed tracked paths
  exist in the combined diff, and `git diff --name-only e92f7f0c ecc7b3a2
  -- <all 49 target paths>` returned **zero files**. Thus the integrated
  tracked source is byte-identical for this entire issue patch in the
  inspected local Git object database. This does **not** validate the other
  combined changes or replace integrated CI.

## Decision scope / source findings

- Binding `AGENTS.md`, `docs/00_SOURCE_OF_TRUTH.md`,
  `docs/08_DECISIONS_LOG.md`, accepted `DEC-077` (actor-bound process-death
  recovery), `DEC-071` (Expo Native), `DEC-072` (Staff auth),
  `DEC-063` (no generic replay), and `docs/17_AGENT_CODE_STRUCTURE_RULES.md`
  were consulted before the source audit.
- Owner approval of exactly `expo-crypto@~57.0.4` is recorded in
  `docs/validation/ISSUE_302_303_CRYPTO_REPAIR_APPROVAL_GATE.md`.
  The recorded resolution is `expo-crypto@57.0.4` with Expo SDK 57;
  package/lock changes are scoped to Native.
- `apps/valet-native/src/crypto/native-secure-crypto.ts` (49 lines) obtains
  `getRandomValues` and `randomUUID` from deferred `expo-crypto`, requires
  in-place Uint8Array results and strictly validates UUIDv4. Missing or
  throwing providers fail closed as `NATIVE_CSPRNG_UNAVAILABLE`; no
  `globalThis.crypto`, `Math.random`, clock or global polyfill fallback
  appears in this adapter.
- `native-incident-recovery-runtime.ts` injects native secure entropy into
  the existing portable `createIncidentRecoveryId` UUIDv8 generator.
  `native-incident-legacy-submit.ts` uses the same adapter for legacy UUIDv4.
  `native-crypto-capability.ts` probes the operational adapter and separately
  records `crypto-object`, `get-random-values`, `random-uuid`, and
  `uuid-v8-validation` without claiming that a mocked probe proves hardware
  CSPRNG quality. The pinned three-category diagnostic state is separate from
  the 200-event telemetry ring.
- No new Incident API/schema/migration, actor authorization, marker protocol,
  idempotency or automatic replay was added in these four commits.
  `DEC-077` retains marker/readback → reservation → single POST, canonical
  actor binding and GET-only reconciliation of ambiguous outcomes.

## Source tests and historical physical evidence (provenance separated)

- `native-secure-crypto.test.ts` covers injected entropy, missing/throwing
  provider, malformed native response and unlinked host; additional Incident
  parity, preflight and capability/pinned-diagnostics regressions are tracked.
- The task's historical QA reports assert final **843/843 employee-client**
  and **1,692/1,692 Native** source tests, TypeScript, lint, architecture
  checks, plus independent source P0/P1 review (no remaining confirmed P0/P1).
  **W18 did not rerun** these suites or an Android build; these are
  report-attributed outcomes, not new independent test passes.
- The owner reportedly submitted an Incident successfully on a real Android
  device after the CSPRNG repair, clearing the original physical
  `secure-uuid`/pre-HTTP barrier. These are **Owner-observed** device facts,
  not W18 ADB captures.
- Historical Crypto QA ARM64/Hermes APK evidence: report records
  `VAYLET_302_303_EXPO_CRYPTO57_ARM64_20261019.apk`,
  **89,455,610 bytes**, SHA256
  `B006FC76554870D84EC9708F138CFDE018233F5E6F75DB033D41B9F2467442F6`.
  Later photo-hotfix QA APK is attributed to source
  `bc2485e0`: **89,458,986 bytes**, SHA256
  `EE4F50F96716DA5B8A874B4D41A0F4E8368A790CD3DB1786F93B00297681117C`.
  Documentation records `apksigner verify` v2, same **Android Debug QA**
  certificate, `arm64-v8a` only, minSDK 29, targetSDK 36, Hermes, intended
  private QA API/Customer origins and Gradle successful release-JS assembly.
  This reviewer did **not** independently re-hash or re-verify APK bytes and
  cannot infer current artifact accessibility or production signing.

## Remaining risks / non-claims and review decision

1. **No newly observed exact-once Incident SQL/audit proof:** final QA report
   explicitly says an independent post-hotfix check for exactly **one**
   Incident plus matching `INCIDENT_OPENED` event was **not rerun**. Owner's
   successful report does not establish that predicate or delayed-post races.
2. Device-specific process death, marker recovery, account switch/revocation,
   foreground/background, long-run pinned diagnostics with 200+ actual
   Task Queue events and other release/stress cases remain incompletely
   observed in the reviewed evidence. Source tests are not a substitute.
3. Debug QA APK signature is appropriate to internal QA **only**; no Play
   Store certificate, production deployment or release readiness proven.
4. The independently reviewed **combined** tree contains all 49 unchanged
   issue-path blobs, but other Issue #300 changes and cross-feature behavior
   require Prime CI and integration review. No claim of full PR/CI pass.

**Recommendation to Prime:** It is reasonable to prepare/review the already
integrated #302 source for a PR with these evidence qualifications. Do **not**
mark Incident exactly-once, production release, formal issue closure or
security acceptance PASS without their independent runtime gates. Preserve
Owner-supplied physical success as attributed evidence, not new W18 execution.
No push, merge, signing, production mutation or tracker action by W18.
