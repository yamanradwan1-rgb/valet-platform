# Issue #416 — independent CodeQL #50–59 triage (W36)

**State: review proposal only; NO ACTIVE EXCEPTION OR GREEN SECURITY GATE.**
Baseline inspected: `d8a470d26b6d37e1e100c7083b12c29be9eaaaf6` in
`cos/issue416-w36-codeql-crypto`; GitHub alert pages reference the PR #464
merge ref at `e98b964ec5fcf51285fbb3a6d641116ce4acc9f5` (that merge commit
was unavailable in the local object database). All source pin hashes below
refer to the **local** reviewed tree, not an unverified remote blob.

## Classification and observed source paths

| Alerts | Rule | CodeQL primary location, at scanned PR merge ref | Assessment |
| --- | --- | --- | --- |
| #50 | `js/insufficient-password-hash` | `apps/api/src/modules/auth/vap1/vap1-a01-ceremony-binding.ts:93` | SHA-256 of *already Argon2id-verified PHC*, not raw password. |
| #51 | same | `apps/api/src/modules/auth/vap1/vap1-a01-ceremony-binding.ts:95` | SHA-256 over canonical U2 payload bytes, including PHC verifier digest. |
| #52 | same | `apps/api/src/modules/auth/vap1-typed/u2-staff-login.ts:96` | SHA-256 over canonical binary U2 staff-login payload. |
| #53 | same | `apps/api/test/issue416-vap1-a01-ceremony-binding.test.ts:40` | Test digest helper for PHC and binary frame fixtures. |
| #54–55 | same | `apps/api/test/vap1-typed-a01-contract.test.ts:206–207` | Negative test compares digests of two distinct binary payloads. |
| #56–57 | same | `apps/api/test/vap1-typed-state.test.ts:141,153` | Golden-vector and equality checks over encoded binary payload. |
| #58–59 | `js/weak-cryptographic-key` | `apps/api/tools/issue416-legacy/tests/current-prime-contract.test.mjs:151–152` | Test-only RSA-1536 keys, used as valid non-Ed25519 signatures that must be rejected. |

Source pages: `https://github.com/yamanradwan1-rgb/valet-platform/security/code-scanning/{number}`
for each #50 through #59. CodeQL's inspected `js/insufficient-password-hash`
query source link is pinned by GitHub to
`github/codeql@1be292a1e54696ca543b4ad0f9b4537b9687caa7`, path
`javascript/ql/src/Security/CWE-916/InsufficientPasswordHash.ql`.
The exact CodeQL CLI pack and query digest of the **next** scan must be
separately attested; a GitHub UI query-source link does not pin the CI binary.

`staff-auth-vap1-login-ceremony.ts:17–41` first checks the actual submitted
password using `Argon2StaffPasswordVerifier` against the accepted PHC, returns
the PHC *only after* successful verification, and runs dummy verification on
invalid user/hash. `staff-password-hashing.ts:5–14` uses Argon2id v19 with a
16-byte random salt, memory cost 65,536 KiB, time cost 3 and parallelism 4.
`vap1-a01-ceremony-binding.ts:42–53` is explicitly dormant and has no signing,
SQL or issuer authority. The U2 `verifiedPasswordDigest` field is SHA-256 of
the checked PHC bytes and the other hashes are fixed on-wire commitments;
changing the digest/KDF breaks the accepted v9 wire contract. None of these
locations writes a fast digest of raw password as the stored password verifier.

The RSA case is **not safely replaceable** with RSA-2048: a real RSA-2048
signature is 344 Base64 characters and is denied by the existing 256-character
envelope guard before the public-key family check. A valid RSA-1536 signature
has exactly 256 characters and Node's `verify(null, message, rsaPublicKey,
signature)` returns `true`; the Ed25519-only guard at
`verified-recovery-case.mjs:101–105` is what prevents accepting it. The
focused W36 test change adds an explicit positive crypto-verification control
to keep this security invariant auditable. All key generation is local to an
offline negative test; none becomes a production signing key or trust root.

## Reviewed local source-blob pins

`git hash-object` values for the six affected paths at the W36 review point.
The test pin below covers the **modified** W36 file; pin it again after any
source change. Pin both the Git blob and the exact file bytes at the scan head.

| File (prefix `apps/api/`) | Local Git blob SHA-1 | SHA-256 of file bytes |
| --- | --- | --- |
| `src/modules/auth/vap1/vap1-a01-ceremony-binding.ts` | `46d85735b5207cb73a164241b8650ad3316eda9a` | `f60a4915f05aa4ec37275638714c4ad84e42002960db8bf8c4700ade115212a2` |
| `src/modules/auth/vap1-typed/u2-staff-login.ts` | `22af8611e0b78b58a93d225212ee674bff68f772` | `48361c650c3d16cb738c109156c49fb2b69b00d7445dd9c45e32e5554e1fd347` |
| `test/issue416-vap1-a01-ceremony-binding.test.ts` | `4cc7cdf05c33058282f62f9c51da063c70292335` | `20fbdd470c752d6f69523bc3a48a1c481f2d5c6c3d8d8f9c15027032fd1ec52b` |
| `test/vap1-typed-a01-contract.test.ts` | `1f7715dba8a207a79ff57f9af1b62e4660bd10da` | `29755e43a6a9d783243ee2949b20e67041fb69beba85d9744f1cc1eb6e2fe9a0` |
| `test/vap1-typed-state.test.ts` | `888b40dc4ec71fe4f8ea179f75b338082a18da74` | `ea956b19e4991c13a031dd315f1909ee63bde1410827fb67f1acf4d23c3d36b1` |
| `tools/issue416-legacy/tests/current-prime-contract.test.mjs` | `25d2700788a9bf5b7851a41567980acc8ef61e68` | `71f4b94a7d98d87b17dcfa0b0530bc93f7f42446fd73f9708850be87753dcde3` |

## Strict proposal for temporary source-locked acceptance

**No waiver may be activated from this document alone.** A security owner and
independent reviewer must explicitly approve each of the ten *individual*
findings, including expiry (suggested latest `2026-11-21`, UTC) and owner ID.
Before accepting any result, retrieve the **actual** head and base CodeQL
SARIF from the same CI run, and pin for *each* entry the exact `ruleId`,
repository-relative `artifactLocation.uri`, `region.startLine`,
`partialFingerprints.primaryLocationLineHash`, SHA-256 of `message.text`,
Git blob SHA for that committed head source file, specific approved rationale,
reviewer and expiration. Distinguish duplicate findings with explicit count 1
each; #58/#59 must remain separate entries even though the same line pair
changes under a test edit. Require the exact CodeQL CLI/query-pack identity
and SARIF category established for that scan. Values not obtainable from the
actual SARIF **MUST remain unset**, so the gate stays red.

If a reviewer elects to implement this in `scripts/security/codeql_gate.py`,
the default must remain **zero exceptions**. Only after current head/base
scans validate must an exact matching *new* High/Critical result be consumed
against a single reviewed entry. Each accepted entry must match exactly once;
all unmatched, duplicated, stale, shifted, expired, unsigned/unapproved,
changed-message, changed-rule, changed-fingerprint, changed-line, changed-blob
or changed-query entries must fail closed. Comparison must continue to block
**all other** new High/Critical findings, and the raw source or fingerprint
must never appear in sanitized reports. No rule-wide suppression, scan
exclusion, severity downgrade, or blanket PR bypass is justified.

The current `codeql_gate.py:239–274,277–296` maintains a four-component
identity `(ruleId, path, primaryLocationLineHash, SHA256(message))` and blocks
every new High/Critical finding. It does **not** currently retain `startLine`
or source blob identity for waivers, nor does CI export the raw SARIF as an
artifact; implementation and exact per-finding pins require separate review.
Until that is done, `sast-codeql` remains blocking by design. A test that
changes any one field of an approved synthetic record must produce exit 1/2,
as must one newly added unrelated High/Critical finding.

**Scope and release verdict:** approve the focused W36 negative-test
assertions for independent QA; **NO approval** for CodeQL suppression,
Issue #416 release, merging PR #464, reactivating SQL authority or recovery.
