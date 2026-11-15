# W36 independent CodeQL + migration-source review — Option C

**Local source base:** `1fbf95c58089b7689d77230b2a730f6e51a92580`
(Option C, NOT the PR #464 remote head). Source-only review; no S01–S03
writer work, gate modification, suppression, Code Scanning dismissal, remote
push, main/PR update, reset activation, PG17 provisioning or production run.

## Scan provenance and limit

Authenticated GitHub PR #464 still reports `db85db57fc5c3913a22d34ab5d9ef77269756301`
as Draft HEAD, with Security CI [run 43732841365](https://github.com/yamanradwan1-rgb/valet-platform/actions/runs/43732841365)
**FAIL:** CodeQL 60 total / 48 baseline / 12 new HIGH/CRITICAL blocked.
CodeQL telemetry reported `INCOMPLETE CATEGORY=SARIF_RULE_ID` and did not
release source-pinned SARIF fingerprints. There is **no remotely verified
Security CI or CodeQL outcome for local `1fbf95c5`**. The integrated `5f4ba78f`
source correction targets historical finding #62; an actual CodeQL rerun must
confirm its removal. **Eleven remaining findings** is a local source/alert
mapping, NOT a proven same-SHA scanner count or security clearance.

## Individually examined current-source HIGH findings

Every row is an authenticated GitHub Code Scanning alert formerly resolved to
the `db85db57` revision and independently traced through the corresponding
unchanged local `1fbf95c5` source. The designation **FP candidate** is
conditional on security-owner review; the current gate still blocks them.

| Alert and rule | Local source location | Source-level security determination |
| --- | --- | --- |
| [#50](https://github.com/yamanradwan1-rgb/valet-platform/security/code-scanning/50), `js/insufficient-password-hash` | `apps/api/src/modules/auth/vap1/vap1-a01-ceremony-binding.ts:93` | **FP candidate.** `matchedPhc` is an accepted Argon2id v19 PHC returned only after verification of `submittedPassword` (`staff-auth-vap1-login-ceremony.ts:17–41`, `Argon2StaffPasswordVerifier`). SHA-256 commits to the already-computed PHC; it does not replace Argon2id for password storage. |
| [#51](https://github.com/yamanradwan1-rgb/valet-platform/security/code-scanning/51), same rule | `apps/api/src/modules/auth/vap1/vap1-a01-ceremony-binding.ts:95` | **FP candidate.** SHA-256 hashes canonical `payloadBytes` from U2, not the submitted password; it is compared with the protected proof's binary payload digest. |
| [#52](https://github.com/yamanradwan1-rgb/valet-platform/security/code-scanning/52), same rule | `apps/api/src/modules/auth/vap1-typed/u2-staff-login.ts:96` | **FP candidate.** SHA-256 hashes encoded binary U2 Staff login fields; this is an integrity commitment over a protocol frame, not a password-verifier algorithm. |
| [#53](https://github.com/yamanradwan1-rgb/valet-platform/security/code-scanning/53), same rule | `apps/api/test/issue416-vap1-a01-ceremony-binding.test.ts:40` | **FP candidate.** Generic fixture digest helper is used on the already-Argon2id PHC and encoded payload; submitted password is checked separately using real `hashStaffPassword` and verifier. |
| [#54](https://github.com/yamanradwan1-rgb/valet-platform/security/code-scanning/54), same rule | `apps/api/test/vap1-typed-a01-contract.test.ts:206` | **FP candidate.** Negative test computes SHA-256 of binary `differentSession` payload to assert session ID changes alter the digest. |
| [#55](https://github.com/yamanradwan1-rgb/valet-platform/security/code-scanning/55), same rule | `apps/api/test/vap1-typed-a01-contract.test.ts:207` | **FP candidate.** Same negative test computes digest of the original binary session payload for comparison. |
| [#56](https://github.com/yamanradwan1-rgb/valet-platform/security/code-scanning/56), same rule | `apps/api/test/vap1-typed-state.test.ts:141` | **FP candidate.** SHA-256 golden-vector assertion over canonical 396-byte U2 payload, not a user password. |
| [#57](https://github.com/yamanradwan1-rgb/valet-platform/security/code-scanning/57), same rule | `apps/api/test/vap1-typed-state.test.ts:153` | **FP candidate.** SHA-256 equality assertion of canonical U2 buffer and exported digest function. |
| [#58](https://github.com/yamanradwan1-rgb/valet-platform/security/code-scanning/58), `js/weak-cryptographic-key` | `apps/api/tools/issue416-legacy/tests/current-prime-contract.test.mjs:151` | **FP candidate, deliberate test-only negative.** Generates first RSA-1536 key to prove a real 256-character Base64 signature that Node accepts is still rejected by Ed25519-only protocol verifier. |
| [#60](https://github.com/yamanradwan1-rgb/valet-platform/security/code-scanning/60), same rule | `apps/api/tools/issue416-legacy/tests/current-prime-contract.test.mjs:152` | **FP candidate, deliberate test-only negative.** Second independent RSA-1536 key tests separate approval role; neither RSA key is configured or exported as a trusted production root. Historical #59 relates to prior source revision, not another new local finding. |
| [#61](https://github.com/yamanradwan1-rgb/valet-platform/security/code-scanning/61), `js/insufficient-password-hash` | `apps/api/src/modules/auth/vap1/issue416-a01-protected-login.ts:161` | **FP candidate.** `verifiedPhc` follows a concrete Argon2id verification at :155–159 and user status checks; SHA-256 is a fixed 32-byte PHC commitment for A01/U2/SQL and is rechecked under the leased transaction User lock. The owner-only A01 issuer remains dormant/unregistered. |

`hashStaffPassword` uses Argon2id v19, 16-byte random salt, 64 MiB memory,
three passes, parallelism four. The verifier rejects unsupported PHC formats,
does dummy work for unknown users, and requires `ACTIVE` status. This supports
the **specific SHA-256 false-positive classification**, not a blanket approval
of Staff Auth, MFA, SQL writers or account lifecycle. In particular S01–S03
remain separate, confirmed launch blockers under Option C.

**Do not convert U2 digests to a password KDF:** changing the frozen frame,
fixed-width SHA-256 and PostgreSQL digest ABI would break protocol parity.
Replacing RSA-1536 with RSA-2048 in the rejection test would yield a 344-char
Base64 signature, failing the input-length guard before exercising the crucial
Ed25519-only key-family check. Neither cosmetic source rewrite is a sound fix.

## Independent re-review of integrated TOCTOU correction (#62)

Option C includes integrated source commit `5f4ba78f` (from original isolated
W36 `2342f2de`). The fix opens a single file descriptor and reads from it,
checks regular-file type, size <= 16 MiB, descriptor identity, stable size/
mtime and post-read path identity/symlink status, with `O_NOFOLLOW` where
available. This addresses the concrete path `lstatSync` → new
`readFileSync(path)` time-of-check/time-of-use flaw at the historical line 75.

**Further bounded-read issue found and corrected in this worktree:** the
integrated helper used `readFileSync(descriptor)`, which continues to EOF and
could allocate beyond the 16-MiB pre-check if an untrusted file grows while
being read. Now it allocates exactly the pre-checked size, uses positional
`readSync` until that many bytes are read, rejects early EOF, reads one extra
byte to reject growth, and still applies both fstat/lstat checks and the
independent exact Git/pinned content digests. A deterministic unit test appends
data after the first descriptor read and proves fail-closed behavior.

Review also found two **adjacent unsafe path reopens in the same acceptance
chain**: `race-migration-pins.mjs` called `readFileSync(path)` for
`verifyPinnedMigrationSources` *before* the bounded-source check, then again
for `approvedMigrationChecksums` *after* it. A growing or symlinked file could
thus consume unbounded memory even though the subsequent pinned-hash check
would reject tampered content. Both now call the same safe descriptor reader.
`approvedMigrationChecksums` additionally validates the exact allowed migration
name **before** any filesystem lookup, rejecting traversal/nonreviewed names.
The original exact content checks and dual-LF/CRLF checksum contract are kept.

**Residual threat boundary:** the `O_NOFOLLOW` flag is unavailable in Node on
Windows; the helper then enforces post-open descriptor/path identity and source
digest. The checks are a *snapshot verification*, not a lock on every ancestor
directory or protection against all future directory mutation. Adjacent
`race-migration-pins.mjs` enumerates filenames separately, but now reads each
SQL source using the bounded descriptor helper and checks its exact pinned
SHA-256 before accepting bytes. No proof is claimed for adversarial
simultaneous cross-process writes, malicious repository-owner behavior or a
production migration on mutable source. This needs independent owner review.

## Validation and next step

Execute the isolated FD/canonical migration tests, selected ESLint, architecture
check, and exact working-tree checks. Request independent review before any
integration. Only a new same-commit GitHub CodeQL run can show whether #62
is absent, which of the 11 alert identities still block, and whether further
new findings were introduced. **No false Security CI PASS is asserted.**
