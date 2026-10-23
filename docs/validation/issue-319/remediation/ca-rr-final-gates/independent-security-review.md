# Independent READ-ONLY security review — Issue #319 CA RR final gates

Reviewer: independent `independent_ca_rr_review` worker, 2026-10-23. The reviewer authored **no** production patch, tests, fixture, database mutation or document. Review material: actual five source-file change set, new synthetic tests, raw RED/GREEN PostgreSQL 17.11/Nest HTTP logs, canonical MFA/session/Management lock order, historical F319-05/#315 contracts and cleanup traces. This is **source/log review**, not independently rerun test execution.

## Signed scope-limited verdict

**FOCUSED SECURITY GO** for CA-RR-A KPI, CA-RR-B Company Analytics, CA-RR-C Company Report DAILY canonical MFA recovery disclosures. Reviewer found **P0=0 confirmed surviving; P1=0; P2=0 within these three exercised revoker-first paths and B reader-first path**. Export PDF finalizer adjacent real HTTP schedule also PASS. **Issue #319 closure/merge/deployment: NO-GO** pending Owner acceptance/CI and wider unverified route families; no claim all 85 Dashboard/Management GET patterns are safe.

The original code at `3e5dc9b` genuinely returned 200 and a synthetic persisted Location timezone after distinct-session canonical recovery committed factor retirement in three strict RED tests. Postfix strict tests give 403/no sentinel/fresh 403, with same first-RR snapshot and recovery schedule. Exact session ID/user/token hash + factor membership/ACTIVE `FOR SHARE OF factor` tie the fence to the authenticated request; existing Company Admin required capabilities and MFA remain. KPI retains original LM pre-snapshot lease and CA exclusive Management transaction; Analytics/Report use a narrow only-two-capability helper with entire fresh RR retries on `40001`.

Reader-first Company Analytics 2/2: real `pg_blocking_pids()` shows recovery waiting on reader PID 25692; valid reader completes before recovery commit; fresh denied. Reviewer cautions that the canonical User-row `FOR UPDATE` also blocks recovery, so **the blocker is the ordered session/User/factor protocol, not provably solely the factor row**.

PDF export finalizer 1/1: original report RR returned snapshot before callback, recovery committed during render, independent READ COMMITTED finalizer reauthorized before bytes; 403, no PDF header, no extra generation audit.

Source contract and safety: no broadened roles, permissions, SQL grants, migrations or UI. Runtime role non-superuser, no CREATEDB/CREATEROLE. `#315` regressions 28/28 PASS. Each temporary PG cluster teardown had zero child DB/connections and owned cluster removed; one migration-owned `valet_photo_evidence_lock_owner` role can exist before whole-cluster removal.

## Reviewer residual unknowns (NOT confirmed P2)

- Independent reader-first cases for KPI and report route C not directly raced in this continuation; analog B and prior F319-05 provide pattern evidence, not empirical per-route proof.
- `40001` retry attempt count/SQLSTATE instrumentation not separately traced in these exact new tests, despite source-level bounded whole-transaction retry.
- WEEKLY/MONTHLY report HTTP shapes not separately raced; DAILY directly verified.
- Error/timeout cases `55P03`, `57014`, `40P01`, cancellation and pool pressure not independently provoked for these new routes.
- Export finalizer reader-first, other canonical revokers, credential rotation, session/logout and entitlement writers not re-raced.
- All 85 registered GET paths not equivalently proven; localized uncontended latency is not a before/after or stress benchmark.

No newly discovered actionable P0/P1/P2 outside these fixed targets was reported by this independent review. None of the unknowns above may be relabeled 'PASS' or 'secure' solely because source implementation is shared.
