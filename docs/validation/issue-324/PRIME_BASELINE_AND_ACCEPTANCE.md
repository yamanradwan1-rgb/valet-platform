# VAYLET #324 - Prime integration and evidence gate

Date: 2026-10-23 (Jordan). This record is limited to the scoped security
remediation candidate and is not a production security certificate.

## Starting state

- Repository: `yamanradwan1-rgb/valet-platform`.
- `main`, `origin/main` and all new task worktrees began at
  `2bee94f200677176368e14edc64928c779c884fe`.
- #319 is CLOSED: eight focused P2 repairs merged at that SHA, with historical
  local acceptance #319 89/89, #315 28/28, four quality gates, independent
  scoped GO. This run will not reimplement them.
- #333 is OPEN as separate unverified authorization-concurrency coverage.
- #324 is the consolidated tracker; #325-#332 are historical superseded
  findings, not proof of remediation.
- The original `main` worktree had user-owned uncommitted changes to
  `apps/dashboard/next-env.d.ts` plus three local helper files. They are
  excluded and preserved. No task work is performed directly on `main`.
- The original #324 issue audit counted 225 raw scanner rows and 104
  deduplicated review units: 57 dependency/advisory pairs, 29 suspected secret
  sites, 17 ZAP alert types, and one Semgrep MFA candidate. They are review
  units, not confirmed exploit counts.

## Exclusive work-package boundaries

| Lane | Worktree/branch suffix | Owned source |
| --- | --- | --- |
| Prime | `prime` | Integration and this gate document |
| W1 | `w1` | Dependency manifests and lockfile |
| W2 | `w2` | OCR config/provider/controller/tests |
| W3 | `w3` | API bootstrap/headers/Swagger/tests |
| W4 | `w4` | Sanitized secret classification document |
| W5 | `w5` | Dashboard/Customer/Valet Next config/tests |
| W6 | `w6` | CI static scan quality and master finding ledger |
| W7 | `w7` | Independent READ-ONLY final review |

All live worktrees use `security/issue-324-<suffix>`. Workers must commit
their scoped edits; Prime cherry-picks only verified commits. W7 examines the
integrated candidate after focused acceptance tests, not individual claims.

## Acceptance method

1. Integrate dependency resolution first; then OCR, API, Web, SAST/ledger.
2. Verify no cross-file conflict, unintended migrations, DB grants, new
   production OCR enablement, auth transport or authorization changes.
3. Run OCR transport and multipart boundary tests, Swagger/API header checks,
   web builds/compatibility, dependency audit, static parser check,
   architecture, types/lint/build gates relevant to changed files.
4. Run #319/#315 isolation suites only if a patch actually changes accepted
   auth/session/MFA/transaction boundaries; never claim historical PASS equals
   new integrated PASS.
5. Record exact final SHA, commands, PASS/FAIL/SKIP/NOT RUN and limitations.
6. Require independent W7 review, resolve confirmed scope-relevant blockers
   before any owner-ready verdict.

## Exclusions

No main merge, deployment, production data/infra, secret rotation, destructive
cleanup, new broad SQLi/XSS/CSRF/BOLA audit, or #333 concurrency campaign.
Operator-only TLS/ingress/secrets controls stay NEEDS OPERATOR EVIDENCE unless
validated from actual deployment evidence.

## Source-controlled ingress review

- `infra/nginx/README.md` is a placeholder, not an effective Nginx
  configuration. `infra/docker/README.md` does not supply a production
  proxy/container topology; the root compose is PostgreSQL-only.
- `infra/systemd/README.md` describes a dedicated Customer server bound to
  `127.0.0.1:3002` behind a managed Cloudflare Tunnel and private
  `API_ORIGIN=http://127.0.0.1:3001`; this is documentation, not live
  attestation of public TLS, tunnel hostname or API ingress restrictions.
- `docs/GUEST_T4_DEPLOYMENT_AND_RECOVERY_RUNBOOK.md` explicitly requires a
  separate operator deployment decision, verified origin, internal API hop,
  trust CIDRs, reverse-proxy behavior, replica topology and immutable
  artifact config. Source review cannot establish these.
- Consequently no guessed production Nginx directives, broad forwarded-IP
  trust, loopback-only API binding or HSTS max-age are introduced by Prime.
  Effective external TLS termination, redirects, WAF, client IP trust,
  forwarded-proto semantics and edge security headers remain
  **NEEDS OPERATOR EVIDENCE** with an approved actual topology.

## Final acceptance

Integration source changes, focused tests and the 104-unit historical ledger
have been prepared in the isolated Prime branch. See
`FINAL_CANDIDATE_REPORT.md` and `MASTER_DISPOSITION.md` for the actual results.
The COS worker sessions repeatedly failed to start; Prime performed the
candidate implementation directly. Independent W7 review was **NOT
PERFORMED**. Therefore the candidate remains **CONDITIONAL**, not a security
GO or approved production release. Unverified items stay UNRESOLVED/NOT RUN.
