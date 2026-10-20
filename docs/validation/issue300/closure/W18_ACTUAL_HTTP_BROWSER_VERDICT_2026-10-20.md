# Issue300 R2 W18 — actual HTTP + Playwright execution verdict

**Observation time:** 2026-10-20 04:29:26 +03:00 (2026-10-20T01:29:26Z).
**Scope:** read-only host admission + offline fixture assertions, W18 isolated
branch `codex/issue300-r2-w18-lane-c`, starting clean HEAD
`7f538ffcf219f8615b37c6d74fcc5849475cfce1`.

## Current real execution results (no simulated PASS)

| Check | Status | Directly observed evidence |
| --- | --- | --- |
| Owned V2 PostgreSQL 127.0.0.1:58387 | BLOCKED / NOT RUN | `Get-NetTCPConnection -State Listen`: NO_LISTENER 58387 |
| Owned V3 PostgreSQL 127.0.0.1:58427 | BLOCKED / NOT RUN | NO_LISTENER 58427; W16 owns Docker/PG exclusively |
| Ordinary authenticated Staff HTTP at 127.0.0.1:3167 | BLOCKED / NOT RUN | NO_LISTENER 3167, no owned provisioned Staff or verified task database; no login request issued |
| Default-mode API 127.0.0.1:3168 | BLOCKED / NOT RUN | NO_LISTENER 3168; no HTTP request issued |
| Dashboard 127.0.0.1:3117 | BLOCKED / NOT RUN | NO_LISTENER 3117; no Playwright browser launched |
| Signed Owner browser proof, all 34 cases | BLOCKED / NOT RUN | Existing 34 source case plans only; no live Owner-signed browser target, no 34 unique actual MFA cookie states; untouched signed proof verifier |
| Source-only W18 auth protocol / browser selector tests | PASS (offline only) | `node --test scripts/issue300-w18-browser-plan.test.mjs scripts/issue300-w18-auth-protocol.test.mjs`: 9 pass, 0 fail; mocked HTTP responses, NOT genuine server/auth/browser evidence |

**Host and ownership admission (read-only):** Windows Docker Linux engine pipe
`\\.\pipe\dockerDesktopLinuxEngine` absent (`Test-Path` returned False).
Host `Get-CimInstance Win32_OperatingSystem` reported **828 MiB** free physical
memory, and `Win32_Processor` reported **100%** CPU at this sample.
`Test-Path` for root/API/dashboard `node_modules` all False.
`Test-Path tmp/issue300-r2-w7-acceptance-v2-owned` False.
Native PostgreSQL PID 6880 listens on `0.0.0.0:5432` and `[::]:5432`,
executable `C:\Program Files\PostgreSQL\17\bin\postgres.exe`; it is
**not attributable to a W18 task lease** and was deliberately not contacted.

**Exclusions:** No Docker startup, process/service changes, DB connection,
SQL, migration, authenticated HTTP attempt, browser, credential creation,
TOTP enrollment, MFA bypass, human LM session reuse, signing replacement,
production action, or shared-worktree edit. The unavailable product endpoint
prevents a genuine login test; claiming PASS from offline fixtures would be
false. The Owner accepts the **signing prerequisite exception only**,
explicitly **NOT CRYPTOGRAPHICALLY VERIFIED / NOT PASS**; it does not override
existing signed proof verifiers.

**Next genuine execution gate:** W16 must explicitly hand off exclusive
Docker/PG resources, host CPU/memory and ports must meet admission,
an independently verified task-owned migrated PG + Staff provisioning
receipts and unique fresh MFA credentials must exist, and own API/Dashboard
must be listening before ordinary unsigned functional HTTP/Playwright may
be executed. The untouched 34 signed proof cases additionally require
their genuine Owner-signed target and separate one-use MFA states.
