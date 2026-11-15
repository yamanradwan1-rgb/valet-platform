# Issue #416 — W36 source triage, exact PR #464 SHA db85db57

**State: source correction proposed for independent review; CodeQL and Security
CI remain FAIL. No waiver, suppression, baseline change, route activation or
production operation.**

Observed remote Draft HEAD:
`db85db57fc5c3913a22d34ab5d9ef77269756301`.
Security CI run [43732841365](https://github.com/yamanradwan1-rgb/valet-platform/actions/runs/43732841365),
job `132868907272`: CodeQL v2.27.4 / JavaScript security-extended,
**60 total / 48 existing / 12 new High/Critical / 12 blocked**. CodeQL's
independent telemetry step returned `INCOMPLETE CATEGORY=SARIF_RULE_ID`.
It did not provide trustworthy new-finding SARIF fingerprints. The full raw
SARIF was unavailable from the published sanitized 229-byte ZIP artifact.

The following rule, source and line mappings were inspected on the authenticated
GitHub Code Scanning alert pages, each of which linked to this exact `db85db57`
tree. These are GitHub alert-page observations, not a fabricated raw SARIF diff.

| Alert | Rule | Exact file and line | Security interpretation |
| --- | --- | --- | --- |
| [#50](https://github.com/yamanradwan1-rgb/valet-platform/security/code-scanning/50) | `js/insufficient-password-hash` | `apps/api/src/modules/auth/vap1/vap1-a01-ceremony-binding.ts:93` | `SHA256(matchedPhc)` is a commitment to the PHC returned **after** successful Argon2id verification; not a password storage KDF. |
| [#51](https://github.com/yamanradwan1-rgb/valet-platform/security/code-scanning/51) | same | `apps/api/src/modules/auth/vap1/vap1-a01-ceremony-binding.ts:95` | SHA-256 over canonical binary U2 payload; PHC commitment is nested inside payload. |
| [#52](https://github.com/yamanradwan1-rgb/valet-platform/security/code-scanning/52) | same | `apps/api/src/modules/auth/vap1-typed/u2-staff-login.ts:96` | SHA-256 over canonical U2 Staff login payload bytes, a protocol integrity commitment. |
| [#53](https://github.com/yamanradwan1-rgb/valet-platform/security/code-scanning/53) | same | `apps/api/test/issue416-vap1-a01-ceremony-binding.test.ts:40` | Fixture helper hashes PHC/payload bytes for protocol parity tests. |
| [#54](https://github.com/yamanradwan1-rgb/valet-platform/security/code-scanning/54) | same | `apps/api/test/vap1-typed-a01-contract.test.ts:206` | Test SHA-256 on changed binary session payload. |
| [#55](https://github.com/yamanradwan1-rgb/valet-platform/security/code-scanning/55) | same | `apps/api/test/vap1-typed-a01-contract.test.ts:207` | Test SHA-256 on original binary session payload. |
| [#56](https://github.com/yamanradwan1-rgb/valet-platform/security/code-scanning/56) | same | `apps/api/test/vap1-typed-state.test.ts:141` | Protocol golden-vector SHA-256 over encoded binary payload. |
| [#57](https://github.com/yamanradwan1-rgb/valet-platform/security/code-scanning/57) | same | `apps/api/test/vap1-typed-state.test.ts:153` | Digest equivalence test on binary payload, not raw password. |
| [#58](https://github.com/yamanradwan1-rgb/valet-platform/security/code-scanning/58) | `js/weak-cryptographic-key` | `apps/api/tools/issue416-legacy/tests/current-prime-contract.test.mjs:151` | Deliberate **RSA-1536 negative fixture**, first key. RSA genuine signature is 256 Base64 characters and otherwise passes Node verification; Ed25519-only verifier must reject. |
| [#60](https://github.com/yamanradwan1-rgb/valet-platform/security/code-scanning/60) | same | `apps/api/tools/issue416-legacy/tests/current-prime-contract.test.mjs:152` | Second independent RSA-1536 negative test key; no production key custody. |
| [#61](https://github.com/yamanradwan1-rgb/valet-platform/security/code-scanning/61) | `js/insufficient-password-hash` | `apps/api/src/modules/auth/vap1/issue416-a01-protected-login.ts:161` | SHA-256 of `verifiedPhc` following Argon2id password verification, subsequently pinned to A01 challenge/U2 payload. Dormant login class, no route registration. |
| [#62](https://github.com/yamanradwan1-rgb/valet-platform/security/code-scanning/62) | `js/file-system-race` | `packages/database/issue416-races/pg17-acceptance-migration-source.mjs:75` | **Valid TOCTOU concern:** `lstatSync(sourcePath)` checked a pathname before a separate `readFileSync(sourcePath)` re-opened it. |

Alert #59 links to a prior scan's older file revision, whereas current
`db85db57` #60 matches its second RSA negative test. Neither should be
double-counted in the 12 current new alerts.

## W36 targeted remediation for #62

Introduced `pg17-acceptance-source-fd.mjs` and replaced the pathname read with
`readTrustedMigrationBytes`. The helper opens a single read-only descriptor;
requests `O_NOFOLLOW` where supported, validates regular-file status and a
16-MiB size limit, reads from that *same descriptor*, re-checks descriptor
identity/size/mtime, then verifies the pathname is still the same nonsymlink
regular file. Existing exact SHA-256/Git-committed migration-byte and LF/CRLF
pins remain unchanged. This closes the scanner's check-then-reopen pattern.

The helper's Windows fallback relies on descriptor/path identity (Windows Node
does not expose `O_NOFOLLOW`), while Linux additionally atomically prevents
opening a final-component symlink. It does not promise protection against an
attacker with persistent write control over the source directory swapping files
*after* preflight, nor does it establish any live migration acceptance: such
an adversarial deployment boundary requires its own pinned immutable migration
source/cutover verification. Never construe this source correction as a full
filesystem threat-model closure or production-readiness assertion.

For #50–58/#60–61, moving from SHA-256 to Argon2 or replacing RSA-1536 with
RSA-2048 merely to clear the tool would change the frozen U2 wire contract or
weaken the exact negative test (an RSA-2048 signature exceeds its 256-character
input bound, so it fails before the Ed25519-specific check). No such change is
proposed. Their source-level review supports **false-positive candidates**;
each finding still requires its own auditable resolution through the approved
security process. The present gate must continue to block all High/Critical.

**Acceptance needed:** independent W32 review of W36 source/test commit;
same-commit CodeQL head/base re-scan, including confirmation that #62 is
resolved while all other unapproved High/Critical remain blocking. Existing
tests cannot establish that CodeQL or production runtime has passed.
