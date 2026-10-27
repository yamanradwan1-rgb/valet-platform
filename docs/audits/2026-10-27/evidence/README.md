# Sanitized audit evidence

The complete [report](../VAYLET_AUDIT_2026-10-27.md) and [original coverage CSV](../coverage-ledger.csv) are one directory above. The [manifest](../evidence-manifest.md) is the authoritative provenance/hash/evidence map. [archive-member-review.json](archive-member-review.json) records all 65 inspected original archive members and their dispositions.

## Evidence groups

- **Coverage/discovery:** [coverage-ledger.json](coverage-ledger.json), [coverage-summary.json](coverage-summary.json), [not-fully-reviewed.txt](not-fully-reviewed.txt), [inventory.json](inventory.json), [api-endpoints.csv](api-endpoints.csv), [database migration inventory](database/migration-inventory.json). `inventory.json` is the initial discovery snapshot; final review statuses come from the original CSV and consolidated coverage ledger. Worker ledgers overlap and must not be summed.
- **OPS-001 and qualified expiry hypothesis:** [backend operations report](backend_operations/report.md), [focused test output](backend_operations/tests.log), [controlled time probe](backend_operations/handoff-time-harness.cjs), [probe output](backend_operations/handoff-time-harness.log). The probe concerns the separate unresolved expiry semantics, not a runtime takeover reproduction.
- **DB-01:** [database report](database/report.md), [full pure database tests](database/vitest-non-postgres.log), [focused failure](database/vitest-manifest.log), [independent comparison](database/manifest-comparison.log), [comparison script](database/check-migration-manifest.mjs).
- **VAL-002:** [coordinator findings](coordinator-findings.md) and [full Contracts tests](contracts-full-tests.log).
- **DASH-01/02:** [dashboard report](dashboard/report.md), selected baseline source references and [dashboard ledger](dashboard/coverage.json). The seven-file 78-case success is retained as a worker report/recorded terminal outcome; no separate raw dashboard output log exists in the archive. No browser fault injection is claimed.
- **CUST-001/002:** [customer report](customer/report.md), [mounted/SSR reproduction](customer/reproduce-preferences.cjs), [output](customer/preferences-reproduction.log), [481-case test JSON](customer-tests.json).
- **INT-001:** [integrations report](backend_integrations/report.md), [actual-source model](backend_integrations/late-lease-probe.cjs), [model output](backend_integrations/late-lease-probe.log), [focused suite](backend_integrations/focused-tests.log). This is fake-DB/provider model evidence, not real PostgreSQL/FCM exactly-once proof.
- **NATIVE-WEB-01:** [native/Web report](native/report.md), [scope probe](native/workspace-scope-probe.cjs), [output](native/workspace-scope-probe.log), [Web focused output](native/web-workspace-tests.log). No full mounted A-to-B browser transition is claimed.
- **TEST-001:** [tracking discovery output](tracking-official-discovery.log), [explicit test configuration](tracking-tests.config.mjs), [direct output](tracking-direct-tests.log), [coordinator finding](coordinator-findings.md). The empty discovery file records zero output and is not proof of a successful test run.
- **Other validation:** [commands](validation-commands.md), [employee-client full tests](employee-client-full-tests.log), [employee-Web full tests](employee-web-full-tests.log), [native initial run](native-node-full-tests.log), [timeout follow-up](native-timeout-disambiguation.log), [font path diagnosis](native-font-diagnosis.txt), [original build-wrapper outcome](node-validation.log), [blocked PG integration output](disposable-postgres-tests.log), [direct SQL application](disposable-sql-migration.log), [disposable PG summary](disposable-postgres-result.json).

## Provenance and limits

Logs retain original result counts, assertion failures, skips, durations and timestamps. Host paths use `<AUDIT_WORKTREE>`, `<AUDIT_WORKDIR>`, `<DEPENDENCY_CHECKOUT>`, `<NODE_RUNTIME>` and `<PACKAGE_CACHE>`. Those are aliases, not public infrastructure addresses or executable shell syntax. Historical log times keep their recorded format; user-facing audit dates are Asia/Amman.

`typecheck-api-final.log`, `lint-final.log` and `tracking-official-discovery.log` are zero-byte captured stdout/stderr files. An empty file alone does not establish success. Typecheck/lint exit0 observations were retained in the original report/tool outcomes; discovery's empty output means no matched files. No new run is implied by publication.

The original audit-integrity record describes the audit's clean worktrees and lack of pushes at that earlier time. This later, separately owner-authorized reports-only publication is not a rewrite of that historical record. Original dependency-layout conflicts and incomplete native/default-timeout qualification remain recorded.

## Optional independent reproduction prerequisites

These synthetic probes read source and use already available dependencies. Publication does not install or execute them. A reviewer must independently choose and authorize any execution environment. Use the exact baseline source with an existing supported dependency setup; no credentials, provider transport or real database is required by these probes.

`reproduction-paths.cjs` defaults to the repository containing this evidence. Optional `VAYLET_AUDIT_SOURCE_ROOT` selects another baseline checkout; optional `VAYLET_AUDIT_DEPENDENCIES_ROOT` selects an existing dependency checkout. Their values are local paths chosen by the reviewer, never committed credentials. Source/probe assertions and synthetic identifiers are unchanged; only filesystem/dependency resolution was adapted.

The scripts are evidence files, not application changes or CI additions. Read them before running. The migration comparison intentionally asserts the existing102-vs103 mismatch; a nonzero assertion is the expected original finding, not a failed remediation. The handoff-time probe supplies a synthetic BEGIN timestamp and does not establish real lock scheduling. The Staff Push probe supplies a fake two-worker database and fake provider.
