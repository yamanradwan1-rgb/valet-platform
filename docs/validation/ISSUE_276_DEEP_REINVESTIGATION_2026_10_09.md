# Issue #276 — reconstruction, new measurements, and focused experiment gate

Date: 2026-10-09 (Asia/Amman task date).
Status: **NO-GO — investigation advanced; production implementation remains unshipped WIP.**
This is a Phase 1–4 investigation and experiment decision packet, not completion of Phases 5–9.
No new Accepted Decision is created by this document.

## 1. Verified Git and preservation

- Protected checkout: D:/kndoom/valet-platform/tmp/issue-276-worktree.
- Branch: fix/issue-276-live-operations-staff-history.
- HEAD and live remote branch: 6545d6f036d38e77a7df695dc5ec82fc9472c6c1.
- Primary checkout main and live remote main: 698bcb6044f72844008ffa49ef085f11471f53e1.
- Initial protected status: 9 modified tracked files and 24 untracked files.
- Initial primary status: two modified Dashboard configuration/generated files, untracked package plans and supplied task text. Owner subsequently supplied the handoff file.
- No existing production, test, configuration, migration, decision, or primary-checkout file was edited by this investigation.
- No reset, clean, stash, checkout, stage, commit, push, PR, merge, deployment, migration, or Issue closure.
- Current GitHub Issue #276 was read through the GitHub connector and remains open.
- SHA-256 fingerprints of all 33 pre-existing dirty/untracked protected files were recorded for final preservation comparison.

New artifacts are this report plus task-owned diagnostic scripts/results under
tmp/issue276-reinvestigation. That tmp directory is ignored/local evidence, not a committed backup.

## 2. Sources and authority

The supplied complete handoff was read in full after the Owner copied it into the allowed project root.
Its embedded resume prompt is historical context, not new authorization.
DEC-102 and DEC-103 were read directly and remain binding; the earlier A/B/C proposal remains DRAFT.
The 62-page Founder & Product Blueprint was found under the primary checkout's reference directory,
extracted, and independently read in full by the UI/product reviewer.
The repository Blueprint bridge, source-of-truth, structure rules, Definition of Done, deployment checklist,
task-related schema/domain/security/engineering/state-machine documentation and prior reports were inspected.
Specialists reviewed the complete scope/domain/Blueprint and relevant/full security/schema documents.
The separate VAYLET_EXECUTION_WORKFLOW_PLAYBOOK.md was not found or supplied.
The complete broad implementation preflight must be finished before declaring a production design ready;
this packet deliberately does not claim READY TO IMPLEMENT.

Relevant source locations (all relative to the protected checkout):
- docs/decisions/DEC-102_LIVE_OPERATIONS_HISTORICAL_STAFF_ATTRIBUTION.md:15-71.
- docs/decisions/DEC-103_ISSUE_276_AUDIT_DISCOVERABILITY_VALIDATION.md:15-60.
- docs/08_DECISIONS_LOG.md:4266-4310: consistent summaries; no material DEC conflict found.
- docs/03_DATABASE_SCHEMA.md:1253-1269 contains older Task-persistence deferral language;
  Accepted DEC-034 and actual migration 20 govern. This lag does not imply a historical cardinality cap.

## 3. Revised root-cause analysis

### Original user-visible defect — previously known

The original session overview intentionally selects only active Tasks. The old Live table/drawer used
that active assignee as the entire staff story. A completed Parking Task disappears from that projection.
Current assignment being null is true; hiding historical responsibility under an unqualified Unassigned
label is the defect. The current WIP separates the purpose-specific Live response and history.

No ValetSession, Task, Dispatch, Vehicle, or assignment transition is required to fix this display.
Affected read entities: ValetSession, Task, DispatchEvent, AuditEvent, OrganizationMembership and viewer
StaffSession/Organization/Location/grant/subscription/MFA authority. No configuration inheritance changes.

### Physical query cost — revised by current plans

apps/api/src/modules/dashboard/operational-history-audit-discovery.ts:36-87:
- A/B/C reference discovery is necessary; discovery is not canonical validation.
- Current SQL converts session IDs to text before deduplication and sorting.
- Task-reference text comparisons inherit the database's default collation.
- Final Audit rejoin can choose a complete Audit heap scan even when C's access has changed.

The actual disposable database uses libc Windows English_United States.1252.
Both default and C collations are catalog-confirmed deterministic.
Fresh parameterized-page plans differ from the older generate_series/InitPlan benchmark:
C often reads all 4,105 parked-event candidates via a Bitmap Heap Scan and merge sorting,
while final hydration scans all 24,105 Audit rows for sparse100/dense50/dense100.
Therefore identifying C alone as the location of every global scan is stale for these plans.
Every access stage and actual parameter shape must be evaluated.

The previous INCLUDE(id) failure has an additional plausible explanation: PostgreSQL 17 documents
planner limitations with expression-index-only scans when the base expression column is not included.
Visibility-map state alone is not a complete explanation. Do not include wide metadata_json merely to
coerce index-only scans; that adds tuple-size and write-cost risk.
Source: https://www.postgresql.org/docs/17/indexes-index-only-scans.html

### Concurrency cost — source-confirmed, not measured as full HTTP load

live-history-read-authorization.ts:48-53 takes an EXCLUSIVE Organization-key advisory lock.
It is held through history (comments :101-105; live-sessions-query.ts:26-64).
Different viewers and Locations in the same Organization therefore serialize this protected portion.
Faster SQL reduces lock residence, but increasing request concurrency does not make these reads parallel.
Changing lock mode is NOT part of the proposed index experiment; writer compatibility needs separate proof.
A query-only median cannot describe this queueing delay.

## 4. New correctness findings and calibration

### F1: impossible canonical Session versions accepted — reproduced

operational-history-evidence-classifier.ts:24-25,56-57 validates only a positive safe source number and
increment equality. It does not constrain Session versions to their stored INTEGER domain or separately
validate the destination.
Actual classifier execution in memory returned PROVEN for:
- 7 -> 8: expected PROVEN (control).
- 2147483648 -> 2147483649: expected UNVERIFIABLE.
- 9007199254740991 -> 9007199254740992: expected UNVERIFIABLE; destination is not a safe JS integer.

Migration 20260808000500_valet_session_foundation/migration.sql:52 defines INTEGER.
confirm-parked-mutations.ts:35-45 and confirm-parked-audit.ts:24-35 derive versions from the real mutation.
These pairs cannot be produced by the canonical writer.
Independent adversarial review confirmed the violation of DEC-102's malformed-evidence rule.
Classification: **P2 correctness defect, release-blocking accepted-contract failure**.
Do not call it an ordinary user exploit or inflate it into a demonstrated P1 attack.
No production fix has been applied; a narrow integer-domain regression/fix is required in the candidate.

### F2: mixed evidence snapshots — structurally supported, runtime reproduction pending

operational-history-projection.ts:62-87 reads Task/Dispatch and Audit in separate statements.
postgres-transaction.ts:33 uses plain BEGIN.
Under READ COMMITTED, an anomalous runtime-authorized terminal Task update combined with a late old Audit
can let the reader assemble a triple that never existed in one committed snapshot:
old Task owner A + Dispatch A, then Task changed to B and Audit A inserted, then reader observes Audit A.
Runtime Task UPDATE and Audit INSERT privileges support this corruption model in source.
No live interleaving reproduction was performed. Classify as **P2 candidate / proof gap**, not a proven
normal-command exploit. Ordinary atomic Confirm Parked between statements instead produces a safe,
temporary UNVERIFIABLE result. A single statement must encompass Task, Dispatch, Audit AND C discovery
to close this concern. Changing the entire authorization isolation level is not assumed safe.

### Rejected suspected defect

Timestamp microsecond truncation is not a repository-schema bug here. Actual catalog confirms both
Audit and Dispatch occurred_at have precision 3; canonical writer casts timestamptz(3).
Do not report a precision-6 problem against this schema.

## 5. Fresh PostgreSQL evidence

Isolation verified against preserved manifest, pg_ctl status, listener PID 22632/process -D,
and live SQL identity before diagnostic queries:
- PostgreSQL 17.11, host 127.0.0.1, port 55449, user valet276test.
- DB valet276_dec103_w2_40c1a097d8.
- data_directory D:/kndoom/valet-platform/tmp/issue-276-disposable-pg-0d8a6d3a254e/data.
- Preserved counts: 200 sessions, 4,100 Tasks, 4,100 completion Dispatch rows, 24,105 Audits.
- Existing two DEC-103 indexes preserved. Task-ref index 335,872 bytes; entity index 57,344 bytes.
- fsync=off is the preserved disposable configuration: no production durability/write-throughput claim.
- No 5432 connection; no DDL, ANALYZE, fixture update, backfill, or table mutation.
- Queries execute inside BEGIN READ ONLY, with explicit target and identity assertion.
- Initial diagnostic aborted safely because inet_server_addr()::text includes /32; corrected to host()
  before any benchmark query. No authorization check was removed.

Each case: 2 warmups, 20 EXPLAIN ANALYZE BUFFERS JSON samples. This is warm-cache diagnostic evidence,
not a cold-cache/load/production SLA or precise tail estimate.

| Page | Exact WIP median / p95 / max ms | UUID + C diagnostic median / p95 / max ms |
|---|---:|---:|
| Sparse50 | 3.183 / 3.633 / 4.124 | 2.303 / 2.869 / 2.932 |
| Sparse100 | 16.644 / 21.397 / 25.405 | 13.950 / 16.521 / 18.198 |
| Dense50 | 57.115 / 97.613 / 104.839 | 24.730 / 26.099 / 28.583 |
| Dense100 | 75.615 / 80.028 / 80.193 | 34.090 / 37.053 / 38.077 |

The diagnostic retains session IDs as uuid for dedup/sort and compares raw taskId text with COLLATE C.
It leaves full Audit metadata and all A/B/C arms present. No production file was changed.
Four full-row parity checks passed; archived independent pair hashes matched counts 56/106/2000/4000.
This is fixture evidence, NOT a new complete independent final-classification oracle.
Runs were sequential across variants, so CPU/noise and combined-variable effects remain;
a randomized/interleaved factorial comparison is a required next experiment control.

Independent comparator diagnostic, same 4,000 Task-ID strings:
default median 15.8935 ms, p95 17.597; C median 3.151 ms, p95 3.539.
This establishes substantial avoidable comparison cost on this host, not the index's future gain.
PostgreSQL describes C bytewise ordering and deterministic equality:
https://www.postgresql.org/docs/17/collation.html

**The diagnostic still fails the no-global-Audit-scan gate. It is NOT a winning production query.**

Artifacts:
- tmp/issue276-reinvestigation/readonly-diagnostic.cjs
- tmp/issue276-reinvestigation/readonly-diagnostic-results.json (240 measured raw plans + metadata)
- tmp/issue276-reinvestigation/uuid-collation-diagnostic.cjs
- tmp/issue276-reinvestigation/uuid-collation-results.json (80 measured raw plans + SQL/parity)
- tmp/issue276-reinvestigation/blueprint-extracted.txt

Exact executed commands from the protected checkout:
- node tmp/issue276-reinvestigation/readonly-diagnostic.cjs
- node tmp/issue276-reinvestigation/uuid-collation-diagnostic.cjs
- explicit psql -h 127.0.0.1 -p 55449 -U valet276test -d valet276_dec103_w2_40c1a097d8 -X -w
  identity/catalog/count SELECTs inside READ ONLY.

## 6. Architecture decision matrix

Rankings concern what to investigate next, not selection of an accepted production architecture.
Let K be scoped Parking Tasks, D completion Dispatch facts, R implicated Audit facts, N total Audit rows.
Without maintained proofs, full accepted validation requires at least Omega(K+D+R) relevant work.

| Criterion | A: existing raw tables / physical access | A2: one-statement narrow evidence | B: normalized raw references | C: maintained per-session proof |
|---|---|---|---|---|
| Domain correctness | Existing semantics reusable | Must preserve strict types/multiplicity | Must preserve every independent raw reference | Invalidation policy is difficult |
| Discoverability | A/B/C direct | Same A/B/C required | All insert paths + legacy parity required | Every dependency mutation must invalidate |
| Fail closed | Classifier defect F1 remains | Exact invalid bits/oracle required | No fallback omission during rollout | Stale PROVEN is principal risk |
| Tenant isolation | Existing org/page restrictions | Preserve exact restrictions | Composite scope/grants required | No off-page enrichment or name cache |
| Auth compatibility | Existing locks unchanged | Existing authority separate from snapshot | Read locks still required | Cached evidence never grants authority |
| Scaling | Avoid N scan; K/R work remains | Same discovery lower bound | Raw C still resolves K Task keys | Cheap reads; potentially expensive writes |
| Full latency | Current measurements only SQL | Unmeasured | Unmeasured | Unmeasured |
| Write overhead | One revised/extra index to measure | None by itself | Multiple relation/index writes | Fan-out/recomputation |
| Migration | Index rollout approval needed | None by itself | Backfill/concurrent reconciliation | More complex backfill/invalidation |
| Operations | Lowest new burden | SQL/type adapter complexity | Extractor coverage and privilege burden | Highest repair/consistency burden |
| Maintainability | Closest to current architecture | Reviewable if narrow modules | New permanent subsystem | Highest correctness surface |
| Rollout safety | Additive index then gated app | Old reader retained | Dual-read comparison + completeness fence | No stale fallback proof |
| Evidence rank | 1: concrete comparator lead | 2: snapshot/transport hypothesis | 3: unmeasured fallback | 4: highest-risk fallback |

A2 is a distinct experiment within A, not a magically fourth persistent architecture.
A raw normalized relation does NOT eliminate thousands of Task probes.
Pre-resolving Task refs into Session IDs must additionally maintain late Task insertion and Task scope/type
changes; canonical-writer-only dual writing misses permitted anomalous Audit INSERT paths.
No architecture can honestly promise constant work over unbounded relevant history without stronger
maintained invariants. No arbitrary history cap or one-completion assumption is proposed.

## 7. Independent oracle and remaining proof design

Expected data must be authored before executing candidate SQL/classifier:
- Manifest of physical Audit IDs and separately enumerated A/B/C implicated sessions.
- Deduplicate (Audit ID, session), never erase cross-session implications.
- Independently list every Task, Dispatch completion, Audit and invalid reason per session.
- Missing/duplicate/malformed/cross-scope/nonterminal evidence dominates any convenient successful candidate.
- Latest unique coherent event -> PROVEN; none and no contradiction -> NO_RECORD; otherwise UNVERIFIABLE.
- Name projection is a separate expectation; PROVEN can have null names; active assignment remains unchanged.

Required cases include 1/40/>40 historical Tasks; old/new anomalies; tied latest vs tied older events;
duplicate physical events vs multiple arms; off-page crosslinks; entity-only, Task-only and reference-free;
wrong Location/foreign Organization; object/scalar/array JSON; string/fractional/int32-overflow versions;
uppercase, unhyphenated, whitespace, Unicode taskId variants; missing/disabled/name-incomplete subjects;
late Task insertion; terminal Task changes; statement barriers and concurrent canonical completion.

## 8. Security, UI, and tests: actual evidence levels

Independent source reviews found no additional demonstrated P0/P1 in the current MFA deferral patch
or Live-only DTO/UI delta. These are reconstruction reviews, NOT the three final release sign-offs.
The separate adversarial reviewer did not design the candidate.

- MFA patch: known MFA/Unauthorized errors deferred until locked current scope; unexpected errors propagate
  (live-history-read-authorization.ts:135-168). Real HTTP denial/oracle matrix remains unproved.
- Existing 16 race cases synthesize SQL revokers and call authorization only. They do not exercise the full
  history endpoint or all actual writers. waitForLock checks any Lock, not exact blocker relationships.
- Add actual logout/refresh/user disable/membership deactivation, different-session and controlled MFA
  recovery, entitlement/Organization changes, commit/rollback schedules, cross-tenant HTTP cases.
- CA MFA also locks the User row; do not incorrectly claim only the exact session protects recovery.
- Strict Live history names remain first/last only; Vehicles still uses its unchanged endpoint/DTO.
- Six columns and Live body portal are present. No new Live P0/P1 established statically.
- Existing 5 mounted cases do not navigate standalone Retrieval Queue.
- Narrow visual case covers AR dark only; 200% zoom, full narrow/theme/language matrix and matched
  screenshots are incomplete. Pre-existing Queue drawer-under-tbody defect is out of this narrow patch.
- LM/denial/late-success-after-denial, real pagination and cursor Organization mismatch need fuller tests.
- U-004 is PENDING; fixtures are not physical QA.

Fresh focused test command was launched:
pnpm --filter @valet/api exec vitest run --config vitest.config.mjs --project api-non-postgres
  test/live-history-read-authorization.test.ts test/live-session-overview-cursor.test.ts
  test/live-sessions-query-unit.test.ts test/operational-history-audit-discovery.test.ts
  test/operational-history-projection.test.ts
followed by Contracts and Dashboard focused commands in the same shell.
The connector returned process 61992 but then refused output access with EXEC_CALLER_UNIDENTIFIED.
**Result NOT COLLECTED; no PASS or FAIL claim. Do not relaunch solely to bypass that refusal.**
Prior 52/52, 7/7, 16/16 and 5/5 remain historical results.

| Evidence | Current status |
|---|---|
| Git/remote/WIP reconstruction | Verified |
| Disposable identity/catalog | Verified |
| 320 new read-only EXPLAIN samples | Completed |
| Four full-row/reference-fingerprint comparisons | PASS on preserved fixture |
| Impossible-version adversarial check | FAIL: current classifier returns false PROVEN |
| New complete PG classification oracle | NOT RUN |
| Expanded data/full authenticated concurrency | NOT RUN |
| Actual-writer security/HTTP matrix | NOT RUN |
| New focused unit run | Result unavailable |
| Final three independent candidate reviews | NOT RUN; no frozen final candidate |
| U-004 / physical QA | PENDING / NOT RUN |

## 9. Benchmark acceptance budget

Blueprint page 53 supplies an INITIAL general Dashboard common-action target: usually under two seconds.
That is not an endpoint p95 or an allocation of all two seconds to SQL.
No arbitrary new numerical SLA is adopted here.
Measure authenticated page/history/authorization waits, connection checkout, serialization and browser
render separately under realistic operator/viewer counts, then allocate the agreed action budget.
Record median/p95/max, failure rates and lock residence for same-org and different-org concurrency.
Require correctness first, no growth with unrelated Audit volume caused by global scans, and no
unexplained dense-tail regression. Diagnostic synthetic timings alone cannot satisfy release readiness.

## 10. Focused Owner decision — colloquial Arabic

**توصيتي: نوافق على تجربة فهرس واحدة محددة داخل نسخة تجريبية جديدة من قاعدة 55449،
قبل ما نضيف جدول مراجع أو نظام تلخيص دائم. هاي موافقة تجربة فقط، مش اعتماد حل إنتاجي.**

الفرضية: جزء مهم من تكلفة مراجع Task هو مقارنة نصوص UUID بقواعد اللغة الإنجليزية في Windows،
إضافة إلى تحويل معرّفات الجلسات لنصوص. القياس الجديد بيّن فرقًا واضحًا، لكن المسح الشامل لصفوف Audit
لسه موجود، لذلك ما في ادعاء إن المشكلة انحلّت.

التغيير المقترح الوحيد في الـDDL:
```sql
CREATE INDEX CONCURRENTLY audit_events_parked_org_task_ref_c276_trial_idx
ON public.audit_events
  (organization_id, ((metadata_json->>'taskId') COLLATE "C"))
WHERE event_type = 'VALET_SESSION_PARKED';
```

- التنفيذ فقط على child جديد محفوظ داخل نفس الـcluster المعزول 127.0.0.1:55449، بعد مطابقة
  manifest/PID/data_directory/DB/user/port. اسم child يُسجّل قبل أي كتابة.
- الفهرسان السابقان والـbenchmark database الأصلي يظلوا محفوظين؛ لا تعديل على 5432 أو أي QA/production.
- نفس raw taskId بدون cast UUID أو lowercase أو trim؛ query/index يستخدموا نفس C.
- نفصل الاختبارات: default/C × UUID/text، بتكرارات متداخلة؛ بعدها نقيس جلب Audit مرة واحدة،
  وقراءة Task/Dispatch/Audit بلقطة statement واحدة، مع إسقاط حقول تحقق ضيقة عند ثبوت التكافؤ.
- لا أعمدة/جداول/Triggers جديدة، لا تغيير writers أو صلاحيات أو locks أو semantics أو cap تاريخ.
- نوسع synthetic fixtures داخل child الجديد فقط إلى صفحات 50/100، وتاريخ 1/40/100 Task،
  مع زيادة Audit غير المرتبط بشكل مستقل، وطلبات متزامنة من نفس المنظمة ومن منظمات مختلفة.
- correctness oracle مستقل للروابط والتصنيف النهائي، مش مجرد تطابق استعلامين.
- نقيس خطط JSON كاملة، الصفوف والتقديرات/loops/buffers/heap/index probes، planning/execution،
  median/p95/max، حجم الفهرس، وكلفة الإدخال المقارنة في الـchild فقط. fsync=off لا يثبت دوام الإنتاج.
- نجاح التجربة يحتاج اختفاء المسح غير المحدود، حفظ كل anomalies، تحسن فعلي ومتكرر في المعاملة
  الكاملة بدون تراجع غير مفسر، وإثبات عدم زيادة خطر الانتظار/التزامن. لا نعتبر الرقم الأسرع وحده نجاح.
- نوقف فور اختلاف العزل، فقدان دليل، تغير التصنيف، deadlock، أو رجوع حاجة لجدول/فهرس إضافي.
- الاسترجاع: لا نلمس الأصل؛ نحفظ child والنتائج والفهارس التجريبية كأدلة، ثم نوقف cluster كما بدأ.
  إزالة أي فهرس/قاعدة أو إجراء cleanup ليست ضمن هذه الموافقة.
- إذا فشلت الفرضية، نرجع للمالك بمقارنة B مدعومة بالنتائج؛ ما ننتقل تلقائيًا لجدول جديد.
- أي migration إنتاجي، backfill دائم، تغيير lock mode أو schema، وU-004/merge/deploy يحتاج بوابته المنفصلة.

This decision is required by the current user request sections 7,11,14 and DEC-103:56;
it is not a new blanket approval flow inferred from a skill.

## 11. Implementation and release disposition

There is no defensible winning production design yet. The preferred next experiment is concrete and
measured enough to request its limited approval; normalization/materialization remain unproven alternatives.
Planned future production changes, conditional on proof:
- strict stored-version-domain validation and meaningful regression coverage;
- same-snapshot evidence acquisition preserving independent references and multiplicity;
- measured access strategy; no canonical-writer/domain changes unless separately accepted;
- existing auth/API/UI WIP reviewed together with actual runtime evidence.

Known P1 performance gate remains. F1 is an additional accepted-contract correctness blocker.
F2 requires isolated reproduction. Full transaction/actual-writer/HTTP/expanded-load/UI gates remain open.
No migration is approved; no release recommendation is possible. **Final GO/NO-GO: NO-GO.**
