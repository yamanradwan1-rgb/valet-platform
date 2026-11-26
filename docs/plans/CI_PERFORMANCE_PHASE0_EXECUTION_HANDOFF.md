# Issue #467 — Phase 0 execution handoff

Status: **NO-GO; execution in progress**. Owner authorized Phase 0 correctness work only. Phases 1–9 and all performance changes remain prohibited.

## Immutable takeover inputs

- Source: `cc507a5b25779e12934a3ead846ceb2c8ddff16b`.
- Original CodeQL comparison BASE: `bfb4fdccf9d557c371313c9e357faa52e0a71014`.
- Plan v1.1: `3a54782f1de97c80f1791abe749614579f245c37`; plan blob `3f3ccf62ab6dae06c76dcfce223cad97842c5a14`.
- Tracking: https://github.com/yamanradwan1-rgb/valet-platform/issues/467 (description and both prior comments recovered).
- Existing documentation branch: `codex/issue-467-ci-performance-plan-20261126`. Publish only a fast-forward, with the prior branch head verified.
- On takeover, authenticated GitHub readback and git ls-remote/fetch agree that main is the documented SHA. #466 is closed and merged at that SHA; no open PRs were returned. Original main checkout is at `eba55b76916a6892059e45622252b87483f4cb1e`, 772 commits behind origin/main, with two pre-existing untracked files. Existing Option C integration worktree has unrelated untracked local QA files. Do not edit/reset/clean either. Existing planning worktree D:/v467-plan was clean; new detached docs worktree under tmp/issue-467-cos-docs-20261126 avoids disturbing it.

## Prime and workers

CoS run `97269af9-c995-4261-a2ee-b5c59547ad3e`. At most seven active independent workers:

| Role | Assignment | Initial state |
|---|---|---|
| W1 | 009b owned, non-forcing DB teardown, exact guard, partial/uncertain DDL and focused PG17 proof | Isolated branch `codex/issue467-w1-009b-nonforce` at source baseline |
| W2 | Staff Push outage fidelity and negative setup-failure regression | Isolated branch `fix/issue-467-w2-staff-push-outage` at source baseline |
| W3 | Four application CodeQL occurrences, exact provenance and independent classifications | Source review complete; strong false-positive candidates |
| W4 | Five test/fixture CodeQL occurrences, exact provenance and independent classifications | Source review complete; false-positive candidates |
| W5 | Effective checks, ruleset, entitlement and qualification procedure | Read-only review complete; W9 independent cross-review pending |
| W6 -> W8 | Independent PostgreSQL and test review | W6 browser bootstrap failed; W8 replacement invited |
| W7 -> W9 | Independent Security and CI review | W7 browser bootstrap failed; W9 replacement invited |

Only W1 and W2 may edit their respective test/fixture paths. Workers must commit locally, never independently push/merge/deploy or change settings. Prime reviews immutable diffs and actual test results before integrating. W3/W4/W5 have reported read-only evidence; final W9 independent cross-review remains required. Neither test correction is yet accepted.

## CodeQL occurrence ledger

All nine findings are HIGH `js/insufficient-password-hash` (CWE-916). HEAD `cc507a5b25779e12934a3ead846ceb2c8ddff16b`, original BASE `bfb4fdccf9d557c371313c9e357faa52e0a71014`. Main artifact 15076553082 and PR artifact 15074009089 contain byte-identical sanitized raw reports, SHA256 `003be29680384ae3ecee41ab44a79254aafb2359e34ca2db31f0edfe85ba61a2`, 61 total / 52 existing / 9 new / 9 blocking. PR archive SHA256 `0c5ab78928b75e05d7dd480f5adefc79ae258a56f1ec67c154871ffc77727abf`; main archive SHA256 `aa8bec63445b3badea1c7c777dcde49d9c90723d762667a42105a762920ff15a`, independently matched by W9 against Actions artifact inventory. The PR has a distinct ref-scoped native reconciliation 9/9/0; main does not. CodeQL CLI 2.27.6, queries 2.5.2.

Source paths below are relative to `apps/api/`. Source SHA256 is computed from committed Git blob bytes, not a Windows CRLF checkout. Fingerprint is the sanitized finding location hash. W3/W4 mapped exact alert IDs using authenticated GitHub alert readback.

| Alert | Source path and line | Source SHA256 | Location fingerprint | Data flow / source-only candidate |
|---|---|---|---|---|
| 50 | src/modules/auth/vap1/vap1-a01-ceremony-binding.ts:93 | d8260274862a7d9df392a2ed89ba2d211e31408fda224d49995fa7527e88bdec | e0064fc0a177a86d1a03998a987f0593f703c9d2dee005c95e5a6181bae48578 | Digest of verified Argon2id PHC for equality binding |
| 51 | src/modules/auth/vap1/vap1-a01-ceremony-binding.ts:95 | d8260274862a7d9df392a2ed89ba2d211e31408fda224d49995fa7527e88bdec | b63b31b7bf384e856d68687f10d66f00bd3f29436bef51ad76da9eef48231dd0 | Typed frame payload digest compared with proof digest |
| 52 | src/modules/auth/vap1-typed/u2-staff-login.ts:96 | 8123f7591858ba345a49099579cdc0b8d63113e885c2965f739bc73c98a020a3 | 1d00b616c63004a06701bdfd078552cef7ceac6602c57048ee5ea6204ef2ee51 | Canonical typed U2 protocol frame digest |
| 53 | test/issue416-vap1-a01-ceremony-binding.test.ts:40 | 855a9787b5c05b110ca2c6b2ed0ad78d1a6829a3ca5ea85ac4c1191a34559302 | fb84e8ed18425a654c39403c6ba5e095fcdf9991a483b2dbe0f99b925a10f09d | Fixture oracle digest of PHC/state/payload; real Argon2id and negative password tests |
| 54 | test/vap1-typed-a01-contract.test.ts:206 | 14a2af2b34ae177adfe98d043b3da949d845620073f9e0d6ac15fa76e327db71 | 92e6833d8df01d0ea2e06613e6a62290596886ef93095e45984255bca31d4670 | Negative comparator over changed-session encoded payload |
| 55 | test/vap1-typed-a01-contract.test.ts:207 | 14a2af2b34ae177adfe98d043b3da949d845620073f9e0d6ac15fa76e327db71 | 80c1be9cc39b085d78ff818955c8b36d175a5ef35f5dc1dbd2bd0e67bf811033 | Independent comparator over original encoded payload |
| 56 | test/vap1-typed-state.test.ts:141 | b6eb66cc577e71e796843c56196a7f695f5a63f83519af307c6cb32bedf6a20e | acb2865eb111492c96365c5a01479d5748f1edd46780f5d2522a0923a8b134f4 | Golden vector over typed frame with synthetic PHC digest |
| 57 | test/vap1-typed-state.test.ts:153 | b6eb66cc577e71e796843c56196a7f695f5a63f83519af307c6cb32bedf6a20e | c78fa9900ee83e3cb1de1551030bb69ca96bd053d1f880e33412f51b173939f3 | Independent payload digest parity with codec helper |
| 61 | src/modules/auth/vap1/issue416-a01-protected-login.ts:161 | 8d02204b61ba6805c5a83c2b9c3162ed24bbba29f051f93f21378130c9a30a5c | 07a8f487b0c925132ea8953e23efa60871f72001467fd18e221ce36b07c18821 | Verified PHC digest in dormant bound SQL proof protocol |

W3 inspected `staff-password-hashing.ts` (Argon2id v19, m65536 KiB/t3/p4, random 16-byte salt, 32-byte tag), `staff-password-verification.ts` (argon2.verify), and ACTIVE-user/strict-PHC checks in `staff-auth-vap1-login-ceremony.ts`. Negative source coverage includes wrong passwords/forged or stale PHC, mismatched typed identity/state/frame, tampered proof and SQL challenge, and no dormant route registration. W4 independently reviewed fixture oracles and related codec/ceremony sources. No runtime execution by W3/W4; no claim of SQL authority attestation. All nine are source-supported false-positive candidates, not new approved dispositions. W9 final semantic review pending. Owner must separately authorize a durable Security correctness decision and preserve original comparison evidence; moving BASE, porting PR #466 dispositions, renaming hashes, weakening tests, or suppressing findings is not an approved correction.

## Current confirmed historical results

| Event | CI | Security CI |
|---|---|---|
| main push cc507a5b | [45729785587](https://github.com/yamanradwan1-rgb/valet-platform/actions/runs/45729785587): postgres-database and quality failed; Standard, Race and other lanes succeeded | [45729785582](https://github.com/yamanradwan1-rgb/valet-platform/actions/runs/45729785582): sast-codeql and security-gate-push failed; four other scanners succeeded |
| #466 PR at documented HEAD | [45725392883](https://github.com/yamanradwan1-rgb/valet-platform/actions/runs/45725392883): Race cancelled, quality failed | [45725392928](https://github.com/yamanradwan1-rgb/valet-platform/actions/runs/45725392928): all jobs passed only under scoped PR reconciliation |

No qualifying run has been credited. Existing plan v1.1 retains the official attempt ledger, exact Race inventory, original raw comparison report identity, and known evidence limitations.

## Mandatory correction and review gates

1. 009b: preserve all four ACL tests, real migrate/provision, exact owned database and role, non-forcing guarded drop, close handles first, reconcile uncertain DDL through lease ownership, drop role only after DB removal. PID 785 is the DROP issuer; actual termination target unknown. Prove normal and bounded close, persistent backend failure, partial setup/unknown DDL, unrelated survival and owned residue.
2. Staff Push: broad rejection must not accept setup failure. Show outage setup success, actual finalization call and expected failure, durable lease and replacement recovery. No privilege changes.
3. Security: nine HIGH js/insufficient-password-hash findings (#50–57, #61); compare to original BASE. Older per-occurrence proposal at docs/validation/option-c-codeql-w36-24d-per-alert-dispositions.md is recovered reference, not fresh authorization. PR-only dispositions may not be transferred. A new BASE that counts them as existing is not remediation. No new dismissals, suppressions or gate changes.
4. Ruleset: W5 independently revalidated #28117363 Disabled via live owner settings UI/API, default branch, quality/security-gate integration 15368, strict freshness, CodeQL HIGH+/Errors, no bypass, PR required (0 approvals), deletion/non-fast-forward rules. Main protected=false and Branches UI no classic rules. Direct classic protection REST 403 and effective-rules API blocked by connector allowlist. Owner alone controls activation; keep all configured rules, verify readback and negative merge eligibility. Saved enforcement and account entitlement untested; W9 cross-review pending. Separate security-gate-push from PR required check.
5. Qualification: after independent reviewed fixes, owner-authorized integration and effective enforcement, require at least three comparable full green baseline repetitions. Pin checkout and HEAD, event, exact BASE, workflows, runner/cache conditions. Reconcile 298 original Race paths or exact updated approved inventory; substantiate cases and skips; verify owned cleanup and original security delta. Log all attempts, including failed/cancelled. A draft PR or branch-push pass alone does not qualify main-push behavior. Owner merge is separately required for main push; Prime must not merge.

## Local execution constraints

Docker server 29.5.3 is reachable; postgres:17-alpine image exists. An existing VAYLET QA environment uses 45432 and other ports, and is out of scope. No default, dev, staging, production or existing QA DB is to be used by this task. W1/W2 must attest fresh disposable PG17 with restricted CI-equivalent principals, disjoint endpoint/lease and exact resource ownership. Available disk observed ~8.47 GB D and ~7.16 GB C at takeover; coordinate heavy installs and test processes. Do not remove existing worktrees, Docker services or caches to gain capacity. The gh CLI is not on PATH; GitHub connector supplied issue and workflow job readback.

## Resume checklist

- Retrieve worker messages and exact commits; reassign unavailable workers with independent review preserved.
- Check W1/W2 worktree states and resources without editing their files; obtain focused actual PG17 proof and independent reviewer approval before integration.
- Review nine occurrence ledger, original raw delta, and ruleset restoration proposal before asking for any owner-only decision.
- Prepare reviewed test-only draft candidate(s) from the exact current main. Push after review; record official CI and Security event results separately. Do not claim new main qualification from a feature-branch push.
- Keep this handoff and master plan current, commit and fast-forward the documentation branch, link immutable plan to Issue #467 and verify the comment. Do not close Issue #467.
- Record every missing test, independent review, official run and owner decision. Do not claim GO while any remains.
