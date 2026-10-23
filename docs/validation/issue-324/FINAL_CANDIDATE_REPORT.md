# VAYLET #324 — Integrated Remediation Candidate / Owner Handoff

**Date:** 2026-10-23 (Asia/Amman)

**Repository:** `yamanradwan1-rgb/valet-platform`

**Baseline:** `main` at `2bee94f200677176368e14edc64928c779c884fe` (accepted #319 merge)

**Candidate branch/worktree:** `security/issue-324-prime` / `tmp/issue-324-prime`

**Final SHA:** obtain with `git rev-parse HEAD` at PR review; post-baseline CI remediation commits are recorded in `PR334_CI_ACCEPTANCE.md`. No deployed release SHA exists.

**Decision:** **CONDITIONAL — SPECIFIC BLOCKERS.** This branch is a reviewable engineering candidate, **not** an independent security GO or a production release approval.

## Source changes

1. API bootstrap only registers Swagger UI and its JSON/YAML document endpoints in explicit `development` and `test`. All other `NODE_ENV` values fail closed. Local Nest HTTP tests confirm production/staging document URLs return 404 and development documentation is retained.
2. API responses receive `Cache-Control: no-store`, `nosniff`, denial of framing, limited frame-ancestor CSP, referrer and permissions headers. Express `X-Powered-By` is disabled. No blanket CORS, authorization, MFA, database or proxy changes.
3. The plate OCR endpoint validator requires HTTPS for remote endpoints; plaintext requests are allowed only to literal `127.0.0.1` or `[::1]` in `development`/`test`. Invalid configurations produce no outbound provider fetch. Existing redirect/time/response-size controls, fallback and production OCR cost guard remain unchanged.
4. Dashboard, Customer and Employee Web use restrictive framing/MIME/referrer headers; the intentionally **framing-only** CSP avoids breaking Next scripts, maps, camera, browser location, cookies and localized layouts. `X-Powered-By` disabled across all three.
5. Upgraded resolved Next.js `16.2.11 → 16.4.3` across three web apps, API Sharp `0.34.5 → 0.35.5`, and transitive Multer `2.2.0 → 2.5.0` via pnpm override. Other narrow patched transitive pins: `proxy-addr`, `qs`, `compression`, `shell-quote`, `fast-uri`, `source-map-js`, `vite`, `js-yaml`, `brace-expansion`.
6. Scanner quality summary rejects Semgrep `errors` (including `PartialParsing`), missing parser-error metadata, **missing or malformed `results`**. Static scanner artifacts remain intact. The previous PR CI run had failures documented in `PR334_CI_ACCEPTANCE.md`; actual new Semgrep complete scan remains NOT RUN.
7. `MASTER_DISPOSITION.md` maps 104 historical review units one-for-one: 57 dependency/advisory pairs, 29 Gitleaks suspected sites, 17 ZAP categories, one Semgrep MFA item. It contains **no matched secret values**.

## Verified local tests (candidate worktree; no production systems)

| Command/scope | Actual result |
| --- | --- |
| `pnpm install --frozen-lockfile --ignore-scripts --prefer-offline` | PASS |
| `pnpm build` (verification-mode full monorepo build) | PASS, 10/10 tasks on final dependency lockfile; Next 16.4.3 on Dashboard, Customer, Employee |
| `pnpm lint` | PASS, 11/11 tasks |
| `pnpm typecheck` | PASS, 11/11 tasks |
| `pnpm architecture:check` | PASS, with grandfathered line-count warnings already recorded by policy |
| Focused Vitest API header + Swagger + OCR provider/diagnostics/cost guard | PASS, 48/48 assertions across 5 files |
| Focused condition-photo multipart + ingress Vitest | PASS, 4/4 across 2 files; **not** an OCR-authenticated PostgreSQL HTTP test |
| `python -m unittest scripts/security/test_summarize_audit.py` | PASS, 5/5; partial parsing, missing metadata, missing or malformed results fail closed |
| `node --test scripts/test-harness/*.test.mjs` | PASS, 39/39 (current candidate) |
| Database non-PostgreSQL Vitest | PASS, 65/65 |
| Postgres17 disposable migration manifest acceptance | PASS 5/5 (were RED 5/5 on main 2bee94f2) |
| Staff Operational Context controller and auth-transition tests | PASS 9/9 |
| Windows capacity PID tests | PASS 16/16 on Windows |
| Employee E2E API origin contract Playwright | PASS 4/4 (not full lifecycle) |
| Full `pnpm test:non-postgres` | FAIL, baseline-inherited test drift confirmed in selected API/Dashboard tests; see `PR334_CI_ACCEPTANCE.md`. Not a clean PASS |
| `pnpm audit --json` | Runs and reports remaining advisories; **nonzero audit status**, **not a clean PASS** |
| Authenticated OCR HTTP+PostgreSQL suites / abort/disconnect load tests | **NOT RUN** |
| Semgrep actual scan with corrected parser inputs | **NOT RUN**; historical 9 partial parser errors remain visible |
| Authenticated full PostgreSQL suite and #333 race campaign | **NOT RUN**, intentionally outside this scope |
| Independent W11 READ-ONLY source-diff review | Performed on Prime 0afa8641: 32 changed files inspected, no P0/P1 confirmed; P2 Semgrep report-structure gap found and locally fixed after review. Follow-up of final patched diff and production verification remain separate |
| Public production TLS, reverse proxy, header/WAF, operational DNS verification | **NOT RUN**; requires operator deployment evidence |

## Supply-chain result and residual risks

The baseline local `pnpm audit` found **7 Critical / 27 High / 22 Moderate / 3 Low**. With the final lockfile, local `pnpm audit` still exits nonzero with **0 Critical / 3 High / 6 Moderate / 0 Low**. This verifies package-version advisory reduction only, not exploitation, reachability, or production uptake.

The remaining High candidates are:

- `deepmerge-ts@7.1.5` through Prisma configuration (`@prisma/config@7.9.1`); advertised correction requires a major version upgrade and the vulnerable recursive-object input path has not been established in the running PostgreSQL API. Defer broad override pending upstream compatible fix/test.
- `mysql2@3.15.3` through Prisma tooling; the known server uses PostgreSQL, not a MySQL protocol connection. **Not confirmed runtime reachable** but still present in lockfile; no blanket platform upgrade solely to silence it.
- `node-forge@1.4.0` through Expo/React Native build tooling; upstream advisory reported no patched version in the scanned data. No evidence of a running web/API request path. Keep tracked for an upstream release and Android/iOS build qualification.

Six Moderate advisory rows remain in local `pnpm audit`: Vitest and `@vitest/mocker` (development), `uuid` via Xcode/Expo tooling, `decode-uri-component` transitive, and `mysql2`. The 57-row historical dependency matrix is grouped by canonical advisory+package, not by current `pnpm audit` row count.

## Credential, runtime, scanner and deployment obligations

- The 29 Gitleaks sites remain **suspected pattern matches**, not proven active secrets. Paths, classifications and owner follow-ups are sanitized in `MASTER_DISPOSITION.md`. Do not print or paste matched secrets or rotate keys without verified owner sign-off. Native Firebase client configuration requires restriction verification rather than treating a public client key as a server secret.
- Nine historical Semgrep partial parsing errors, including `apps/api/src/modules/shifts/shift-presence-attempt.ts`, remain unqualified. New quality gate fails the scan instead of publishing a false PASS; scanner execution and parser correction need a separate actual run before full closure.
- `infra/nginx/README.md` has no deployed proxy configuration; Customer service docs describe a Cloudflare Tunnel to loopback. External TLS termination, forward-header trust, HSTS, ingress and production response headers are **NEEDS OPERATOR EVIDENCE**. We did not guess a proxy CIDR or change production services.
- This run did not check authenticated BOLA/SQLi/Stored XSS/CSRF app-wide; Astra's earlier source review was nonexhaustive. Do not infer general security clearance.
- Historical #319 is **CLOSED** and untouched. Residual concurrency #333 is **OPEN and separate**. Neither is part of the #324 remediation candidate.

## Final acceptance boundaries

No direct merge to `main`, force push, release artifact, live deploy, destructive cleanup, production database access, secret rotation or production configuration change occurred.

**Owner review candidate:** available on the isolated branch with a complete ledger, successful focused tests and independently identified scanner-quality correction. **Not production-ready/Issue-closure-ready** until the remaining three High paths have accepted reachability/mitigation decisions, Semgrep is rerun with full parse coverage or explicitly deferred, actual ingress and credential-owner evidence are recorded, mandatory CI/PG E2E gates are resolved through approved safe infrastructure and final changes are independently reviewed.
