# U-002 scoped verification and reproducible commands

Status: **DESIGN/TEST ONLY, runtime implementation NO-GO**. Host Windows PowerShell, UTC 2026-10-31. Isolated Prime branch `audit/issue-333-u002-resolution-prime` based on immutable `9079706ad322e87f6f33fb61335fdc3b6bfd2528`. Fetched actual `origin/main c638a437749cae1f78a8c8a417fd4d53e6a34920` and confirmed it is ancestor of the audit branch. All PostgreSQL 17.11 runs used a fresh task-owned loopback cluster, identity check, zero child databases/other clients, verified stop and owned-directory removal. Historical retained W3 PGDATA was untouched.

| Exact command in Prime worktree | Result / count / local ignored evidence |
| --- | --- |
| `pnpm install --offline --frozen-lockfile` | **PASS**, 1043 pinned packages from cache; lockfile unchanged |
| `node scripts/architecture-check.mjs` | **PASS**; existing grandfathered file-length warnings only |
| `node scripts/architecture-line-policy.mjs` | **PASS**, 300-line code ceiling |
| `node --test scripts/test-harness/issue333-private-classification.test.mjs` | **PASS 2/2**, no private tests in default CI; no 42-vs-43 classifier waiver |
| `pnpm --filter @valet/api typecheck` | **PASS**, no source mutation |
| `pnpm --filter @valet/api lint` | **PASS**, no warnings |
| `pnpm --filter @valet/contracts build` | **PASS**, ignored local dist for E001 real Nest peers |
| `pnpm --filter @valet/api build` | **PASS**, ignored local dist for E001 real Nest peers |
| `powershell -NoProfile -ExecutionPolicy Bypass -File docs/validation/issue-333/w4-visit-contacts/run-private-lab.ps1` | **SECURITY FAIL / strict RED: 4 FAIL, 2 PASS of 6**; final formatted source run `bc0fcd5495b54eaf80afd357778a234a`, private PG17 identity/cleanup0/0/removed. P001 reaches unchanged helper line160, A private marker+numeric2 after revoke201/grant0; fresh B-only numeric1. See `P001_CORRECTED_STRICT_RED_EVIDENCE.md`. Pre-install run `7aa0a9711f2648759a10bd0297afa12b` was **BLOCKED**, not security RED |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/issue333/run-owned-postgres.ps1 -Suite baseline` | **PASS 28/28**, 4 #315 files, run `d3bcb7dd02db4f7ab822c85c4198a3a7`, exit0, cleanup0/0/removed |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/issue333/run-owned-postgres.ps1 -Suite audit` | **PASS 89/89**, 20 #319 files, run `c6144404aa9643049fee0cc292953d7e`, exit0, cleanup0/0/removed |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/issue333/run-owned-postgres.ps1 -Suite issue333 -TestFile test/dashboard-issue333-u002-emergency.integration.test.ts` | **SECURITY FAIL / strict RED 1/1**, run `f77cffe4a02b4164b6c71dbac854d228`, two Nest peers, canonical User disable persisted 23:47:22.806Z before old private HTTP200 finish 23:47:22.811Z; fresh401. Exit1, cleanup0/0/removed. See `E001_CURRENT_STRICT_RED_EVIDENCE.md`. Prebuild run `ba613741dc804e9f9d7670bf1792bdb1` was **BLOCKED** missing compiled artifacts, never called a security RED |
| `pnpm exec prettier --check` on all changed Markdown and P001 test | **PASS** after final formatting |
| `git diff --cached --check` and staged-name/status inspection | **PASS** after final staging; only scoped docs and two JSON numeric test expectations, no UI/runtime/schema/migration/dependency diff |

The only TypeScript change is `apps/api/test/issue333-w4-mixed-privacy.integration.test.ts:81,83`, comparing numeric JSON values 2 and 1. No original strict privacy assertion, E001 test, controller, authorizer, release or API contract changed. P001 final SHA256 `7d4ce87b171355241d012b984000ded6a8178766a618b7ff766287f1118754dd`, recorded in private runner source-hash artifact. Git HEAD/remote SHA are reported by Prime **after** commit/push verification.

**Classification:** Existing five F333 and E001 current vulnerability RED; new P001 confirms C1 mixed A+B data and count contamination; #315/#319 preserved only in their tested contracts; L001 sole-PG-lock candidate falsified in prior real evidence. Live partitioned API egress, true last-hop protected-byte termination, after-aggregate-SQL A+B and genuine PostgreSQL COMMIT ACK loss remain **UNVERIFIED**. No future five-route GREEN or deployment readiness is claimed.

**Owner gate: DECISION REQUIRED. Security conclusion: CONFIRMED VULNERABILITY — REMEDIATION APPROVAL REQUIRED.** No production runtime GO, PR, merge, deployment or Issue #333 closure.
