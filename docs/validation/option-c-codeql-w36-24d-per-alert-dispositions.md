# Option C / W36 — independent CodeQL alert dispositions (not approved)

**Source baseline:** `24d33d83b26ca6e7c97cca51396ca0dd3523020f`.
**Status:** 11 individual **PROPOSED** false-positive candidates, **zero**
approved dismissals, waivers, exclusions, baseline changes, CodeQL gate edits or
claims of Security CI PASS. The two RSA tests have an isolated source-only
candidate that must be independently reviewed and scanned before integration.

## Grounding and uncertainty

- Latest authenticated GitHub PR #464 remote HEAD seen by W36 was
  `db85db57fc5c3913a22d34ab5d9ef77269756301`. Its Security CI
  [run 43732841365](https://github.com/yamanradwan1-rgb/valet-platform/actions/runs/43732841365)
  reported 60 total, 48 existing and **12 new High/Critical, 12 blocked**.
  Integrated TOCTOU #62 correction is later local source: **no same-SHA scan**
  establishes a final count of 11. Code Scanning alerts below were checked
  against the prior remote scan and files rechecked at local `24d33d83`.
- CodeQL raw head/base SARIF and sanitized location/message fingerprints for
  these 11 were **not available**; the remote artifact was a fail-closed
  diagnostic (`SARIF_RULE_ID`). Alert links are not substitutes for verified
  fresh `(ruleId, path, primaryLocationLineHash, SHA256(message))` identities.
- All seven 11-alert source files are **unchanged** between the remote
  `db85db57` and local `24d33d83`. This does not prove unchanged static
  reachability, scanner extraction, or the absence of additional S01–S04 alerts.
- The CodeQL gate compares raw head/base SARIF findings and blocks every new
  High/Critical. **GitHub alert dismissal alone does NOT make this independent
  gate green.** No change to that gate is authorized here.

## Eleven distinct findings — owner decision required separately for each

Each proposed disposition requires the Owner plus independent security review
to verify the **final scanned SHA, complete SARIF identity, selected rule,
original immutable source blob and any changed source semantics**. `FP?`
is not an approved exception. No bulk accept, broad pattern or evergreen waiver.

| Alert | Rule and current source | Evidence and proposed disposition (Owner action pending) |
| --- | --- | --- |
| [#50](https://github.com/yamanradwan1-rgb/valet-platform/security/code-scanning/50) | `js/insufficient-password-hash`; `apps/api/src/modules/auth/vap1/vap1-a01-ceremony-binding.ts:93` | **FP? 1/11:** SHA256 of the persisted Argon2id PHC returned by `verifySubmittedStaffLoginPassword` only after validating submitted raw password. PHC is a protocol commitment, not the password KDF. Inspect the verifier call and status gate before accepting. |
| [#51](https://github.com/yamanradwan1-rgb/valet-platform/security/code-scanning/51) | same rule; `apps/api/src/modules/auth/vap1/vap1-a01-ceremony-binding.ts:95` | **FP? 2/11:** SHA256 of binary U2 payload for signed proof consistency; not password hashing. Independently validate exact payload/proof framing and caller authority. |
| [#52](https://github.com/yamanradwan1-rgb/valet-platform/security/code-scanning/52) | same rule; `apps/api/src/modules/auth/vap1-typed/u2-staff-login.ts:96` | **FP? 3/11:** SHA256 over canonical serialized typed Staff-login command, a fixed-width digest in frozen U2 ABI. Verify encoder schema and downstream SQL contract. |
| [#53](https://github.com/yamanradwan1-rgb/valet-platform/security/code-scanning/53) | same rule; `apps/api/test/issue416-vap1-a01-ceremony-binding.test.ts:40` | **FP? 4/11:** Test digest helper for pre-Argon2id-verified PHC and canonical binary frames. Test uses real Argon2id password hashing elsewhere; fixture does not store a weak password verifier. |
| [#54](https://github.com/yamanradwan1-rgb/valet-platform/security/code-scanning/54) | same rule; `apps/api/test/vap1-typed-a01-contract.test.ts:206` | **FP? 5/11:** SHA256 of `differentSession` binary payload in a protocol-mutation negative test. Distinguishes changed session identity, not password entropy. |
| [#55](https://github.com/yamanradwan1-rgb/valet-platform/security/code-scanning/55) | same rule; `apps/api/test/vap1-typed-a01-contract.test.ts:207` | **FP? 6/11:** SHA256 of original encoded binary payload; comparison is independent of production digest helper. Replacing with the production helper would weaken test independence. |
| [#56](https://github.com/yamanradwan1-rgb/valet-platform/security/code-scanning/56) | same rule; `apps/api/test/vap1-typed-state.test.ts:141` | **FP? 7/11:** Fixed SHA256 golden vector over exact canonical 396-byte U2 command, not a user password. Preserve independent golden vector check. |
| [#57](https://github.com/yamanradwan1-rgb/valet-platform/security/code-scanning/57) | same rule; `apps/api/test/vap1-typed-state.test.ts:153` | **FP? 8/11:** Test compares wire SHA256 digest with exported typed digest method. Input is encoded binary frame. |
| [#58](https://github.com/yamanradwan1-rgb/valet-platform/security/code-scanning/58) | `js/weak-cryptographic-key`; `apps/api/tools/issue416-legacy/tests/current-prime-contract.test.mjs:151` | **FP? / source fix candidate 9/11:** First intentionally generated RSA1536 negative key; no deployed key. W36 replaces test-time weak private-key creation with pinned *public-key-only* independently signed vector, verifies real 256-character signature passes Node verification and fails protocol Ed25519-only gate. Needs same-SHA CodeQL proof. |
| [#60](https://github.com/yamanradwan1-rgb/valet-platform/security/code-scanning/60) | same rule; `apps/api/tools/issue416-legacy/tests/current-prime-contract.test.mjs:152` | **FP? / source fix candidate 10/11:** Second independent RSA1536 negative key for the other approval role; W36 stores only separate public key and valid signature. Both identities checked independent; no private key committed. Prior #59 is a historic alert for older revision, not an additional current 12th crypto alert. |
| [#61](https://github.com/yamanradwan1-rgb/valet-platform/security/code-scanning/61) | `js/insufficient-password-hash`; `apps/api/src/modules/auth/vap1/issue416-a01-protected-login.ts:161` | **FP? 11/11:** SHA256 of `verifiedPhc` following real Argon2id verification and active-user check, then reused for exact SQL/U2 challenge. Dormant issuer, not password KDF; a separate S01–S03 authorization review is still mandatory. |

Exact baseline Git blob IDs and SHA256 file-content pins on `24d33d83`:

| Source file (relative to `apps/api`) | Git blob | SHA256 |
| --- | --- | --- |
| `src/modules/auth/vap1/vap1-a01-ceremony-binding.ts` | `46d85735b5207cb73a164241b8650ad3316eda9a` | `f60a4915f05aa4ec37275638714c4ad84e42002960db8bf8c4700ade115212a2` |
| `src/modules/auth/vap1-typed/u2-staff-login.ts` | `22af8611e0b78b58a93d225212ee674bff68f772` | `48361c650c3d16cb738c109156c49fb2b69b00d7445dd9c45e32e5554e1fd347` |
| `src/modules/auth/vap1/issue416-a01-protected-login.ts` | `afccd676cd7e5f0a2ed82e3f2425ee4965c7cce5` | `4bd21b0e063f388fbd60a0bc145f7a18af6d7734a1d592f20cd4d42162dfd8b8` |
| `test/issue416-vap1-a01-ceremony-binding.test.ts` | `4cc7cdf05c33058282f62f9c51da063c70292335` | `20fbdd470c752d6f69523bc3a48a1c481f2d5c6c3d8d8f9c15027032fd1ec52b` |
| `test/vap1-typed-a01-contract.test.ts` | `1f7715dba8a207a79ff57f9af1b62e4660bd10da` | `29755e43a6a9d783243ee2949b20e67041fb69beba85d9744f1cc1eb6e2fe9a0` |
| `test/vap1-typed-state.test.ts` | `888b40dc4ec71fe4f8ea179f75b338082a18da74` | `ea956b19e4991c13a031dd315f1909ee63bde1410827fb67f1acf4d23c3d36b1` |
| `tools/issue416-legacy/tests/current-prime-contract.test.mjs` | `25d2700788a9bf5b7851a41567980acc8ef61e68` | `d7f690283684b93c9ea257aaddbbfed10ec09357ded52e2c0e94681c8dd73f33` |

## What can (and cannot) make final Option C Security CI green

1. **Required:** all *real* new High/Critical are fixed in source with
   reproducer regression tests and then verified by exact-final-SHA CodeQL.
   S01–S04 new protected writers need a fresh scan: past remote results cannot
   assert new findings are absent. W36 statically inspected selected protected
   writer credential modules and S04 signer (S04 uses HMAC-SHA256, not a fast
   password digest); this is **not** CodeQL execution or a full threat audit.
2. **Proposed narrow test rewrite:** immutable synthetic RSA public-key-only
   vectors preserve the exact negative property that a valid SHA256 RSA1536
   signature with Base64 length 256 must be rejected **because its key type is
   not Ed25519**. Genuine RSA key generation is absent from the committed test.
   Only the isolated candidate has this change. Do not mark #58/#60 resolved
   until a new scan verifies the alerts are gone, and do not replace with RSA2048
   (344-character signature would fail length validation first).
   Candidate test file Git blob before staging: `974515527ed78c03dfc473149948671450a3f5bb`;
   synthetic **public-only** JSON fixture SHA256:
   `4f4b2b55e2e08658762d79d0f3fcb1b6143dea94479aa5ac56c2c683fd588d2e`.
3. **Nine SHA256 findings:** moving to password KDF, changing U2 wire hashes,
   making a test self-compare production digest implementation, or renaming
   call sites solely to elude CodeQL is **not** a justified security fix.
   With current strict gate and unmodified protocol, these can remain new
   High findings after scanning. Owner may review individually whether a
   future **exact finding-scoped**, independently verified policy is warranted,
   but implementing such a policy changes the gate and is **explicitly outside
   W36 authorization**. No approval has been given. Manual GitHub dismissal
   cannot modify the raw SARIF comparator; green cannot be promised under
   the present constraints.
4. **Scanner control:** the same final SHA needs GitHub CI, Security CI,
   authenticated same-run CodeQL head/base SARIF, sanitized per-alert
   `ruleId`, path, line, `SHA256(primaryLocationLineHash)`, `SHA256(message)`
   and file SHA256, plus verified query pack/tool identity and distinct severity.
   Missing or contradictory evidence is **fail closed**, not PASS.

### Local reproduction option — requires installed CodeQL CLI

`codeql` executable is **not installed/resolved** in the W36 Windows shell;
the following describes a reproducible Linux/Git-Bash run **not executed here**.
Reconfirm the approved base for the *final* PR before running; the exact
historical CI base `bfb4fdccf9d557c371313c9e357faa52e0a71014` is an
ancestor of `24d33d83` but may not be the final review baseline.

```bash
set -euo pipefail
SECURITY_BASE_SHA=bfb4fdccf9d557c371313c9e357faa52e0a71014
ROOT=$(pwd)
TMP=$(mktemp -d)
git worktree add --detach "$TMP/base" "$SECURITY_BASE_SHA"
QLS='codeql/javascript-queries:codeql-suites/javascript-security-extended.qls'
# Pin CodeQL CLI version 2.27.4, same query pack 2.5.0 as historical CI.
for rev in head base; do
  source="$ROOT"
  if [ "$rev" = base ]; then source="$TMP/base"; fi
  codeql database create "$TMP/$rev-db" --language=javascript-typescript \
    --build-mode=none --no-skip-empty --source-root="$source" --threads=2 --ram=4096
  codeql database analyze "$TMP/$rev-db" "$QLS" --format=sarifv2.1.0 \
    --sarif-category=/language:javascript-typescript --threads=2 --ram=4096 \
    --output="$TMP/$rev.sarif"
done
python3 scripts/security/codeql_gate.py --head "$TMP/head.sarif" \
  --base "$TMP/base.sarif" --out "$TMP/codeql-sanitized.json"
# Keep raw SARIF local/private; do not print or upload snippets/secrets.
git worktree remove "$TMP/base"
```

Locally verified alternatives: `python -m unittest discover -s scripts/security
-p 'test_codeql*.py' -v` exercises 55 static gate contracts but **does not
run CodeQL analysis**. On the final committed SHA, GitHub's `Security CI`
workflow is the authoritative verification. A non-green final scan must
remain a launch blocker; no waiver, suppression, severity downgrade, or
baseline change is implemented or recommended by W36.

## W36 execution and unrelated baseline blockers

- Actual isolated `24d33d83`-rooted W36 candidate: **39/39** legacy L1
  contract tests PASS, **55/55** CodeQL gate/telemetry/workflow unit tests
  PASS, selected ESLint PASS, Node syntax PASS and `git diff --check` PASS.
  These do not prove CodeQL findings closed. There was no runnable `codeql`
  executable in the Windows environment.
- `pnpm architecture:check` **FAIL** on the unchanged source baseline:
  `apps/api/test/guest-no-store.integration.test.ts` has 305 lines,
  `apps/api/test/staff-auth-native-fixture.ts` has 332 lines, and
  `packages/database/scripts/provision-runtime-role.mjs` has 273 lines
  against a stale grandfather exception. W36 changed none of these and must
  not claim architecture PASS or fix unrelated S01–S04 work.
- Targeted static scan of new S01/S02/S03/S04 protected-writer modules found
  signed SQL **HMAC-SHA256** in S04 (a keyed MAC, not a weak password hash),
  and no proven additional CodeQL crypto findings from the inspected paths.
  This was **not** a full dataflow scan, an exploit test, a review of every
  writer, or evidence that the final SHA will not introduce new findings.
