# Issue #302 — Native Incident Crypto / recovery merge readiness

**Disposition: PHYSICAL QA RESOLVED — COMBINED SOURCE REGRESSION VERIFIED;
PRODUCTION RELEASE NOT AUTHORIZED.**

Source branch `codex/issue-302-303-native-crypto-photo` at
`e92f7f0c732ee53f26ccc45361c69b66f7296cfb`; crypto fix commit
`07d6feaf37d2e21b451795c5d40cb051076a3466`; merged from `origin/main`
`6d7bd5991e66d8f5d93978512352a52c72bdc7f6` through Native merge
`6982e168459f858bfe894a253490ba1bfca5344e`. All 49 changed Native-lane
tracked files matched their source blobs at the initial combined merge; this
does not authorize deployment. Exact current branch SHA via `git rev-parse HEAD`.

The physical failure was missing `globalThis.crypto` on Android/Hermes,
causing `secure-uuid` before Incident HTTP. Owner-approved
`expo-crypto@~57.0.4` supplies Native CSPRNG for secure UUIDv4 and RFC9562
UUIDv8 actor-bound Incident recovery, without `Math.random`, clock-seeded
fallback or a broad JavaScript global polyfill. DEC-077 and Accepted
DEC-063/071/072 still require operation-specific server reservation before
POST, immutable actor/org/location/session binding, idempotent reuse of the
same UUID and GET-only reconciliation of uncertain outcomes; no automatic
replay or business state-machine change. Diagnostics contain no payload,
customer free text, token or Incident identifier.

**Evidence:** Original physical Android Owner confirmed successful Incident
submission after the Crypto repair. Historical source QA Native 1692/1692
and Employee Client 843/843 passed on the isolated branch. This combined
candidate's Contracts tests 473/473, Employee Client 843/843 and focused API
  source tests 137/137 passed. Native first full run reached 1690/1692,
  with two Appearance tests timed out at 5 seconds; targeted retest passed
  4/4. A second full combined run with two Vitest workers and unchanged
  per-test timeouts returned **1692/1692 PASS / 239 files** (83.18 seconds).

**Qualifiers:** Owner's physical success is not a new independent
exactly-once PostgreSQL `Incident` + `INCIDENT_OPENED` audit run on this
merged candidate. Reboot/process-death stress, live cross-tenant grant/revoke
and production provider/APK signing qualification remain future gates.
The signed QA Android APK is an internal QA build, not production signed.

Security/privacy review and detailed implementation are in
[`ISSUE_302_303_END_TO_END_QA_RESOLUTION_2026-10-20.md`](ISSUE_302_303_END_TO_END_QA_RESOLUTION_2026-10-20.md)
and [`ISSUE_302_INDEPENDENT_MERGE_READINESS_W18_2026-10-20.md`](ISSUE_302_INDEPENDENT_MERGE_READINESS_W18_2026-10-20.md).
Changed-file list derives from `git diff --name-only 6d7bd599..e92f7f0c`;
Native Crypto implementation is `apps/valet-native/src/crypto/native-secure-crypto.ts`;
Incident runtime/portable Check-In and crypto tests are included in the
source commits above. Do not include generated Android build directories.

**Recommendation:** candidate for reviewed source PR, *not* automatic issue
closure/production release; final exact-SHA CI and QA signing approval remain.
