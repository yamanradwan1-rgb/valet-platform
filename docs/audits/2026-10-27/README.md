# VAYLET audit — independent review publication

This branch publishes audit reports and sanitized evidence only. It does not fix findings, approve release or complete the requested exhaustive audit.

- **Audited baseline:** [`66968655b8bd90c6681daf53fb9d8da9b9ab9f79`](https://github.com/yamanradwan1-rgb/valet-platform/commit/66968655b8bd90c6681daf53fb9d8da9b9ab9f79).
- **Publication branch:** `audit/vaylet-full-audit-2026-10-27`, created directly from that exact baseline.
- **Audit date:** 27 October 2026, Asia/Amman. Publication reuses existing evidence; it did not rerun tests or contact providers/databases.
- **Purpose:** make the complete original Reports A–L, findings, coverage and supporting evidence independently reviewable.

## Start here

1. Read the [complete audit report](VAYLET_AUDIT_2026-10-27.md), including the coordinator qualifications and detailed subsystem appendices.
2. Inspect the [original complete coverage CSV](coverage-ledger.csv), [coverage summary](evidence/coverage-summary.json) and [every not-fully-reviewed path](evidence/not-fully-reviewed.txt). The CSV is byte-for-byte unchanged from the original delivered ledger.
3. Use the [evidence manifest](evidence-manifest.md) for finding-to-evidence mapping, original/published SHA-256 values, sanitization and exclusions.
4. Browse the [sanitized evidence index](evidence/README.md), [original validation commands/outcomes](evidence/validation-commands.md), [endpoint declarations](evidence/api-endpoints.csv) and [migration inventory](evidence/database/migration-inventory.json).

## Mandatory interpretation limits

- **491 of 4,705 candidate source files** received full-file review: approximately **10.4% file-level** and **8.5% line-level** coverage. The exhaustive audit remains incomplete.
- Tool-assisted inventory/architecture/tests are not full semantic review. 0 confirmed P0 does not mean no P0 exists.
- The formal deep-security scan was unavailable. No completed security scan or blanket Security GO is claimed.
- PostgreSQL operational integration validation was incomplete: 3 files failed fixture setup and 23 cases were skipped. Applying 103 SQL migrations directly to disposable PostgreSQL is separate evidence and does not prove Prisma bookkeeping, runtime provisioning or concurrency.
- Physical-device and external-provider qualification remains incomplete. Node/SSR/mocked tests do not establish actual Android/browser/S3/FCM/Meta behavior.
- CONFIRMED includes conclusive source behavior or the explicitly stated local reproduction; HIGH source/model evidence retains its missing runtime proof. No finding was upgraded for publication.
- The original audit's two unexpected dependency-setup incidents and restoration remain disclosed. This publication installed no dependencies and ran no tests.

## Finding summary

| ID | Priority | Confidence | Finding |
|---|---|---|---|
|OPS-001|P1|CONFIRMED (source-conclusive; operational PG reproduction incomplete)|Started task cannot transfer safely when original owner is unavailable|
|DB-01|P2|CONFIRMED (existing failing test)|Expected migration history102 vs actual103|
|VAL-002|P2|CONFIRMED (existing failing test)|Expected audit-event count102 vs actual103|
|DASH-01|P2|HIGH (source; browser reproduction incomplete)|Live Operations counters stale while rows refresh|
|CUST-001|P2|CONFIRMED (mounted synthetic DOM)|Storage-denied preferences leave React/DOM state inconsistent|
|INT-001|P2|HIGH (actual-source fake-DB model)|Expired staff worker can initiate avoidable duplicate generic push|
|NATIVE-WEB-01|P2|HIGH (source and pure probe)|Same-login operational scope change retains old Web targets|
|DASH-02|P3|HIGH (source; browser reproduction incomplete)|Guest preview failure remains displayed as Loading|
|CUST-002|P3|CONFIRMED (SSR markup)|Busy buttons lose accessible names|
|TEST-001|P3|CONFIRMED (discovery/direct execution)|Three tracking suites omitted from official API projects|

Totals: 10 findings/risks; 1 P1, 6 P2, 3 P3; 6 CONFIRMED and 4 HIGH. The separate unresolved hypotheses are not confirmed vulnerabilities. Existing deferred/release gates remain separately labeled in the full report.

## Independent review procedure

Review the application source at the audited baseline, not whichever commit main reaches later. The only delta in this branch is under `docs/audits/2026-10-27/`.

```sh
git diff --name-only 66968655b8bd90c6681daf53fb9d8da9b9ab9f79 HEAD
git show 66968655b8bd90c6681daf53fb9d8da9b9ab9f79:apps/api/src/modules/dispatch/reassign-task-command.ts
cd docs/audits/2026-10-27
sha256sum -c SHA256SUMS.txt
```

Read each finding's preconditions, execution path, attempted disproof, role/environment scope and validation limits before reproducing it. Check exact source line references against the baseline. Start with OPS-001's DEC035/DEC043 contradiction and the two deterministic inventory failures; then challenge each HIGH finding rather than interpreting a probe as complete end-to-end proof.

Reproduction scripts are historical audit evidence adapted only for portable path selection. They retain the same models/assertions and were **not rerun for publication**. Their source/dependency adapter is documented in the [evidence README](evidence/README.md). They do not install dependencies. Do not treat historical commands as authorization to migrate, provision, deploy, contact providers or use real data.

## Publication provenance and exclusions

All 65 archive members were inspected and published as individual text artifacts. The original ZIP itself is intentionally not committed: it duplicates the published content and includes unsanitized host paths and synthetic URL userinfo. No factual finding, captured outcome or source-review status was omitted. Local machine/runtime/cache paths were replaced with aliases; two synthetic credential-shaped URL title occurrences were redacted. No actual credential/key/cookie, customer dataset, production log, database dump, environment file or screenshot was present in this archive. No screenshot/device/provider evidence was invented.

The [manifest](evidence-manifest.md) records each original and published digest and every transformation. Large JSON inventories remain downloadable/raw text; GitHub may limit their rendered preview. No Git LFS, PR, issue, merge, fix or deployment was created.
