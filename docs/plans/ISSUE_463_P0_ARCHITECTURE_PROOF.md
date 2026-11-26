# Issue #463 — P0 Architecture Proof and Decision Closure (v1.2)

**Verdict: NO-GO — EXACT REMAINING BLOCKERS.** Isolated P0 engineering evidence, not an implementation/release authorization. Source baseline `cc507a5b25779e12934a3ead846ceb2c8ddff16b`; prior plan `df15f30e43f0ba9ccc5e5a0a9c480da790223ce0`; frozen design `2166a6760803e1a5084c6230b15706549426d8c8`. [Master plan](ISSUE_463_GUEST_RATING_COMMENTS_IMPLEMENTATION_PLAN.md). Date 2026-11-26.

## 1. Executive disposition

The owner approved separate optional 1:1 storage, immutable numeric parent, privacy-only terminal erase and post-erase conflict; operational targets and exact protected SQL direction conditionally accepted, not production work. The major uncertainty whether the actual pinned VAYLET history/roles can support the mechanisms has materially reduced. Actual migrated PG17 experiments do not equate to one integrated implementation candidate or production authorization. OD-04 and OD-07 remain open at the precise gates below. No P1–P8, production DB/role change, CI, merge, deployment, or prototype alteration.

| Blocker | Observed P0 evidence | Residual gate |
|---|---|---|
| B-01 | Official 155/155 migrations, checksum match; actual LEGACY provision, PROTECTED promotion and verification replay; old broad provision rejected; actual nested reader ACL | Final stage-aware inventory/feature provisioner + readiness on one combined exact candidate, exact approval of OD-07. |
| B-02 | Actual migrated notice/version mechanism, atomic write and erase semantics, synthetic backup resurrection and local reconciliation | Verified independent durable disposition ledger and real restore rehearsal, legal/controller and notice/rights basis, backup residual inventory, exact privacy operational approval. |
| B-03 | Actual migrated authority rows, scoped caller and both orderings of six direct DML revokers; narrow lock guards | Complete integrated API/reader/child/erase transaction graph, exact current role/clock checks, independently reviewed candidate proof and OD-07. |

## 2. Source, isolated execution and attestation

Use only Git objects at pinned SHA, not stale main. Fresh private PostgreSQL 17.11 (server_version_num 170011), image ID `sha256:ab20e934b27ba3ff927c1b4c9ff8cf6c32f315f743efe68dd3441182a87fb085`. Docker context local desktop-linux, no production connection. Every prime run generated unique ownership label/container/database and unique credentials, tmpfs data, no existing DB/data mounts. Dynamic loopback port on official Prisma runs, network-none/no published port on socket-only experiments. Before SQL, verified target identity, exact system_identifier over Docker local socket and host TCP where applicable. Trusted non-superuser migrator is the disposable database owner, CREATEDB/CREATEROLE, NOINHERIT, no replication/bypass; pg_monitor creator membership confined to fixture. Runtime created by official provisioner, distinct credentials for staff/MFA/management writer and proof keys. Redact credentials, no real text/guest data in evidence; synthetic fixture text only. Node v24.19.0/Prisma 7.9.1 used on prime. Source archive SHA256 902b72781983fdb0667eebfad01d0a65a6b5529f75829c85250a3f4e85c5cb03.

| Successful prime target | Container ID | Label | DB / loopback port / system_identifier |
|---|---|---|---|
| Migrated LM reader | 11a98eb93540041a5ba9c728ec8359b38eb8553e1019e66c7b1f0c45f3ca4fbe | ed019add24b442f29ff91fd34e0fdd1b | p0463_prime_ed019add / 51575 / 7712302378647707689 |
| Migrated LM + notice | 43cf0696976e0b034b2f99fb3a618028270746da68cf90f34f778bff9d7d0e41 | 43c6b0eaa7fc4314b9f72634a13eb0d9 | p0463_prime_43c6b0ea / 51767 / 7712302666351775785 |

Both prime successful containers removed, absence verified. Prior failed prime runs also removed and verified. The archived source includes database package and root manifests; installed node_modules junctions used read-only (not a hermetic dependency reproduction). Commands in fresh attested target, pinned isolated archive only:
```text
pnpm --dir <isolated source>/packages/database migrate:deploy
node scripts/provision-s04-proof-key.mjs
node scripts/provision-runtime-role.mjs
node scripts/provision-staff-auth-writer-role.mjs
node scripts/provision-option-c-protected-cutover.mjs
node scripts/provision-option-c-protected-cutover.mjs
node scripts/provision-runtime-role.mjs  # expected explicit PROTECTED rejection
psql experimental SQL as attested migrator, with ON_ERROR_STOP=1
```
Environment set by script: distinct local DATABASE_URL / MIGRATION_DATABASE_URL, staff/MFA/management writer URLs and generated proof secrets, MFA_PROTECTED_WRITER_ENABLED=true, NODE_ENV=test, exact phase/role preflight. Do not reuse fixture credentials or ports. 155 _prisma_migrations completed rows and 155 exact migration-file SHA256 comparisons, including last 20261118000200. No migrate resolve, historical SQL modification, official harness bypass, or production database. Scoped custom SQL experiments are explicitly not full official test harness passes.

### Reproduction artifact inventory (local only)

Root `tmp/issue463-p0-v12/` outside docs worktree, never deploy or run against an existing database. Scripts must retain independent fresh target/cleanup checks; inspect before running. Hashes identify observed experimental files, not approved production source.

| Artifact | SHA256 / role |
|---|---|
| prime/prime-proof.py | 3bdeebc504279e5a73962961b5987e1bf0242660a4f1993c2e6a17f693abc9c1 |
| prime/prime-experiment.sql | 71913a2d81ac5bd841adaa2e284a5dd39c2cf02230738c0c44499026ae83bae |
| prime/prime-proof.log | c93742fd46731912982d1d2f1345bf18c29e2b2a75c0540ce19ff8e7e20918d1 |
| prime/prime-notice-run.py | 26dc400d613b612f7459c9c2dccd378acbe5a10d70279fd147236318f7a5adc7 |
| prime/prime-notice-combined.sql | eaab28afe5febd9a7c22974e0c6494e53199fceee418ba634ec4d4f50c9eaaaf |
| prime/prime-notice.sql | 6ca3977dc5225f9654996c84fa44593082dcc6353edc7147a16f99dc4ae1dffc |
| prime/prime-notice-run.log | cec2e55f297dafb40548f22b0d60a963ac1ae88756e94db8266f1ea0f0542d29 |
| prime/prime-http-adapter.cjs | 8f7403e7b762f8f7356b4d9754aca799d5248b969e9b43e2a0ba17b561c05311; setup failure, not a pass |
| w4/W4_P0_V12_PRIVACY_EVIDENCE.md | 01568d8fea137e944deabb59a0c4943829021e9482b8cfc34c8015edcfcdb21e; synthetic backup experiment and source/legal review |

W1–W5 final artifact/report inventories below. P0 evidence is reproducible from isolated scripts and immutable pinned migrations; no experimental executable committed to documentation branch. Logs distinguish failed setup and valid test evidence.

## 3. Actual prime outcomes and corrections

| Probe | Expected / observed |
|---|---|
| Official pinned migration | 155/155 finished and 155 exact checksums, exit 0 (both successful targets). |
| S04 proof, legacy runtime, staff writer | exit 0 each; real LEGACY boundary. |
| Actual protected cutover | exit 0, promoted atomically; replay exit 0, verifies already PROTECTED. |
| Old broad provision after protected | exit 1, exact guard message "Option C PROTECTED: ordinary runtime role provisioning cannot restore legacy Auth/MFA/Management SQL authority." Expected denial. |
| S inventory | exact original owner vaylet_staff_session_lock_owner, one function. |
| Before feature grant | dormant catalog; nested call denied before exact non-grantable EXECUTE; no raw credential, business UPDATE, schema CREATE, SET ROLE for runtime. |
| Scoped LM reader | actual R login/session_user; valid bearer/scope succeeds; foreign tenant, direct raw comment and credential access denied; legacy numeric response text-free. |
| Notice | G=M for existing two guest write function owners; P no raw comment SELECT; runtime cannot approve; monolingual not approved; exact bilingual published version, replay, republish and revocation behavior pass. |
| Representative HTTP adapter | NOT RUN to completion; Nest default driver resolution failed, explicit ExpressAdapter then missing body-parser. No shared dependency installation or test harness modification. Previous fatal TextDecoder probes are not actual HTTP. |

Failure correction record: first run console encoding error after migration returned (not counted); second actual official migration/role grants passed but cutover failed due missing MFA_PROTECTED_WRITER_ENABLED=true. Corrected flag and reran fresh. Third official baseline/cutover passed, nested ACL negatives passed but LM positive failed with fixture Location default INACTIVE; explicitly seeded ACTIVE and reran fresh successfully. W2 independently observed different DB-owner vs migration principal causes #149 (20261116000200_option_c_staff_session_lock_owner) P0001/P3009 and 148 finished + one failed; fresh owned DB with migration principal as owner corrected without modifying historical migration. W1/W2 discovered precreating runtime by superuser causes ALTER ROLE 42501 when migrator lacks ADMIN. Supported clean fixture uses actual provisioner to create runtime as migrator; do not repair production roles ad hoc. No failures overwritten as passes. Prime's experimental LM function is narrow single-row diagnostic, not final four-row projection, CA integrated API or complete stage provisioner. Notice is a narrow database mechanism, not evidence of actual notice content/consent.

## 4. Architecture decisions and complexity challenge

Retain only the necessary mechanisms; no additional generic infrastructure, no new UI.

| Mechanism | Retain/simplify and why | Residual verification |
|---|---|---|
| 1:1 private child | Retain; independent privacy erasure incompatible with immutable same-row parent. No duplication of raw text/hash after erase. | Atomic pair, old/new retry, erase races in integrated candidate. |
| Canonicalization | Retain approved exact raw and canonical scalar/byte bounds; one algorithm across TS and SQL, no normalize/counter/trim approximation. | Reuse oracle vectors; actual HTTP raw-byte route and no echo. |
| Dedicated reader F | Retain; SECURITY DEFINER effective caller is not ordinary runtime. No ownership transfer to broad writer or superuser. | Exact two routine inventory in final stage; W1's isolated one-function prototype is only proof of mechanism. |
| Nested locker | Retain one exact non-grantable EXECUTE; keep existing S inventory. No raw bearer verifier access, no second auth implementation. | Existing verifier intentionally rejects new executor until precise stage-aware amendment. |
| Inert row lock privileges | Retain per exact mutable relation; FOR SHARE needs UPDATE on at least one column. Constant validated CHECK restricts value, but same-value UPDATE still creates tuple version and may trigger side effects. Never grant business column UPDATE. | Trigger/privilege negatives and production-like contention. |
| Boundary/provisioner | Retain exact boundary-lock transaction; phase helper is small defense against accidental LEGACY grant, not a PROTECTED PREPARE/RELEASE switch. No general feature flag or repair tool. | Verify both phases, race/replay/failure and all role counts together. |
| Notice | Retain existing EN/AR surface + per-version approval receipt, not a new consent UI. Exact version protects republish/revoke; no assumed legal sufficiency. | Actual approved content and legal basis, no wrong completed-visit failure copy. |
| A/E + P | Retain two named separated operational principals and five exact P-owned routines (approve/apply/expire, approve/revoke notice); no broad operator CRUD, no new Management role. Existing separate duties not independently attested. | Actual identity, grant and lifecycle proof. |
| Retention/expiry | Deterministic rated_at +720h; bounded existing-approved job/schedule, no generic worker. Expiry hidden at read independent of purge schedule. | Deadline/holds/restore operations measured. |
| Independent disposition ledger | Mandatory for old snapshot restore; same-DB receipt useful but insufficient. Reuse certified independent service if possible; otherwise narrow metadata-only exception. | Provider and operational evidence + real restore drill, not local mock. |

### Precise transaction/ACL amendments

Use explicit migration SQL transaction: BEGIN; SET LOCAL ROLE vap1_proof_owner; SELECT exact singleton/phase FOR UPDATE; RESET ROLE; confirm same backend/XID and phase; then DDL and exact role grants; validate checks/owner counts and ACL; COMMIT. JS helper is not magically executed inside Prisma migration SQL. Prototype used actual boundary lock; combined candidate must prove same-XID and migration runner transaction semantics. Create NOLOGIN owners using trusted M; temporary public CREATE/USAGE only while installing exact owner functions, revoke CREATE and PUBLIC EXECUTE in same transaction. No grant options, no unrelated membership. PG17 observed creator ADMIN-only edge M (SET=false, INHERIT=false), separate SET-only edge (ADMIN=false, INHERIT=false), not one combined edge. G=M observed on actual fixture; if different in another approved target, exact column SELECT and inert UPDATE on both notice rows as required, or fail preflight; no broad privileges. Final role and authority/lock matrices in master §§7.2–7.4; results below identify proof scope, not grant authorization.

## 5. OD-04: independent ledger and exact privacy limits

Existing AuditEvent/account audit in the same database is rolled back with an old snapshot. `apps/api/tools/issue416-legacy/older-backup-fence.mjs` is a local HOLD-only planning diagnostic, not durable disposition authority. Private photo storage in `apps/api/src/modules/vehicle-photos/s3-private-photo-store.ts` is scoped to photo object access; source does not attest provider, WORM, object lock, separate IAM or recovery independence. DEC-104 is photo-specific. `docs/16_PRODUCTION_DATABASE_DEPLOYMENT_CHECKLIST.md` requires encryption and restore drill, not actual provider expiry/residency evidence. No independent operational ledger verified.

| Candidate | Independence / security | Recommendation |
|---|---|---|
| Same-DB audit/receipt | Atomic with disposition, but lost on pre-erase restore | Keep metadata receipt for reconciliation only; reject as sole restore authority. |
| Existing private object service | Potential independent recovery domain if separate IAM, immutable conditional create/version retention and durable monotonic checkpoint independently verified; photo bucket/credentials not appropriate | Preferred narrow reuse IF provider/operational owner can attest requirements. Separate dedicated metadata-only ledger namespace/bucket and principal; no reuse of broad photo ACL. |
| Separate managed append-only DB/event ledger | Independent admin/recovery and write-ahead/checkpoint possible; higher operational surface | Alternative only after explicit owner infrastructure approval and equivalent durability/restore proof. |
| External case system | Potential if complete machine-verifiable replay, immutable approvals, separate recovery and audited authority | Not verified; do not assume. |
| Local JSON/mock | Restores demonstration only; not independently durable | Reject for operational release. |

Required external ledger exact metadata: org/location/visit triple; case/approval/command UUID; typed HOLD/RELEASE/ERASE; approved operator ID, execution identity and timestamps; monotonic sequence; previous event hash/signature over **metadata only**; committed outcome or pending/unknown. No comment text, original digest, length, raw request or recoverable representation. Durable approved intent before SQL mutation, conditional append, independently attested signed high-water checkpoint not restored with application DB, receipt after commit. Lost-response replay reconciles exact DB receipt; gaps/out-of-order/unknown suppress affected text and prevent restore traffic, never authorize release based on local snapshot. Terminal ERASED monotonic; pending hold/erase reconciled under current legal authority; system expiry recomputed deterministically. Restore on isolated target; reconcile from independent checkpoint before any app traffic; verify no revival, repeat replay, fail closed if unavailable. Restrict read/write to appropriate operational identity; no new comment audience. Retain ledger at least until all pre-disposition recovery sources irreversibly expire, plus legally approved minimum audit duration; no inferred indefinite retention. Cost depends on actual provider and staffing, not verified. Illustrative volume at 1–2 KB metadata per record and two records per case: 10,000 cases ~20–40 MB before checkpoint/replication; provider request, retention, monitoring, restore drill and support costs require actual quotation/evidence.

**Residual backup guarantee** (conditional operational target): for every authorized logical erase committed at UTC T, latest time any recoverable copy of the erased comment survives must be <= T + 30*24h. Includes backups, snapshots, WAL, PITR, replicas, provider copies, exports and other recoverable material. Creating/copying/restoring backups does not reset T; maximum backup age by itself does not prove maximum residual lifetime. Hold lawfulness/termination and any stricter legal deadline handled separately; no claim SQL NULL implies physical eradication. If target infeasible, block collection until approved architecture/retention satisfies applicable obligation (consider scoped cryptographic erasure only with independent review and legal acceptance). Require actual provider inventory, TTL/lifecycle/PITR constraints, deletion and restore evidence, processor agreements and operational owner, plus legal deadlines. Proposed targets: 30 days active; hidden at expiry; due logical purge within 24h; approved erase within 7d subject to hold/applicable law; hold review every 30d. Numeric history unaffected. No record before 24h submission closure: keep case open and recheck; no premature erasure certification.

Conditional Jordan legal review, not legal advice/compliance finding: [PDPL No. 24/2023 official translation](https://www.modee.gov.jo/ebv4.0/root_storage/en/eb_list_page/official_translation_of_the_personal_data_protection_law_no.24_of_2023_-_stamped-2.pdf), Articles 4/5/6/9/10/12 (rights, consent/exceptions, notice, erasure, processor obligations); [2025 Security Technical and Organizational Measures Instructions](https://www.modee.gov.jo/ebv4.0/root_storage/en/eb_list_page/security_technical_and_organizational_measures_instructions_2025_-_en_%282%29.pdf), Article 2 and 7(C) address erasure of copies including backups and recipients/documentation; [official registry](https://www.modee.gov.jo/EN/List/The_law_regulations_and_instructions), including rights procedures/forms. Official indexed text reviewed; PDF screenshot retrieval returned cache miss, not visually verified. No 30-day legal safe harbor. Counsel/owner must determine deployment jurisdictions, lawful basis, actual controller/processor and rights/hold procedure, notice timing and evidence, minors/sensitive data, international transfers, erasure deadlines and provider contracts. Existing More→Privacy can render exact per-Location EN/AR published text or URL, not proof that Guest saw/read/agreed. Prefer immutable bilingual text; mutable external URL alone insufficient without archived exact content/version and approval. Missing/revoked approval => refuse entire pair and generic existing definite failure state, not false "visit incomplete", no silent stars-only downgrade. If mandatory prior notice or consent cannot be satisfied through current surface and lawful workflow, stop and request a specific owner decision; no new UI.

## 6. Worker proof matrix and coverage

_W1/W2/W3/W4/W5 final measured results and artifact hashes are consolidated below after independent review. W6 source review verified frozen hashes; W7 independent adversarial scope/limits follow._


### W1 — actual protected owner and exact ACL

Owned loopback 55673, DB issue463_w1_pg17, migrator w1_migrator; official 155/155 exact migration checksum verification, S04/runtime/staff writer and official cutover. Initial superuser-created unused runtime role had missing ADMIN edge (42501), corrected fixture only. Initial inventory assertion failed due harness count representation; separate post-grant verifier passed. Exact F attributes false for LOGIN/INHERIT/SUPERUSER/CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS; original S owns one function, no relations/schemas, experimental F owns one function/no relations/schemas; SECURITY DEFINER, search_path=pg_catalog. ACL exact S, R, F EXECUTE; no grant option/PUBLIC. No F raw verifier/ratings SELECT/session UPDATE, no R SET ROLE to F/S, no writer-reader execute. PG17 migration principal has separate ADMIN-only and SET-only membership edges. Invalid unrelated bearer gives no authority. Existing unchanged official cutover verifier explicitly rejects extra F; broad old provisioner denies in PROTECTED. This validates exact incompatibility rather than silently overriding it; F's final phase helper/two-function inventory not proven here.

Artifact SHA256:
- w1/pinned-cc507a5b.tar: 5a8a9e275973efd20ce38849e406517c9c042b44fbf714d8b8b7299afdc995a9
- w1/role-proof.mjs: ad5ac27bea284b9492df28e685dfeca1f87bd205e1fcb24143a05d1e47b31cc6
- w1/post-grant-verify.mjs: 8eaff8ea2d1d9a962822d4436c77c4bf83500f947754fbd99e3cbee9c525fae8
- w1/post-grant-result.json: 44c51816faa49d0c332ed5483878ba200ac75f8d49773f68cd3fe6b4237e93b7
- w1/replay-proof.mjs: 30f6be0b2e8fc91634ef331f28aabc2520b2c4f5205800f3a726a59e95f2970d
- w1/replay-proof-result.json: 068c03f3ec3ac7cabed17413f74d59b314574e7159d140242f8dc22fe1ae8359
- w1/checksum-result.json: f4690004119ebf2f2646b1f2c0bdb1ca4002d5df2367f354ca14787b3651c3a7

### W2 — official phase/provisioning

Actual migrated DB owner issue463_w2_migrator, container 24a1578b5d69c3917470f582a97368ec7ba5c4f210da6b1207e07ca345a41baa, port55982, issue463_w2_db, system_identifier 7712301788999794722. Pinned archive and official Prisma deploy; 155 ledger rows, missing/mismatches/badStatus empty. Ordered ledger SHA256 00bc078258b5490092f369b42058c6cde04d635c0bc8b40d9a6d992c3fb8a6c3. w2/migration-verification.json SHA256 810fe872023c25e5534502d77cd32aec005d115a267c8c9106ad62b20d3cde1c. Original failed bootstrap retained separately; fresh owned DB resolves without historical edits. S04, LEGACY provisioning/replay and staff writer, official cutover and PROTECTED verification replay passed. The final exact feature provisioner is not the original official provisioner. See final supplemental result for staged experiment/boundary concurrency.

### W3 — actual migrated guest write and canonicalization

Owned Docker network none, no ports/binds, tmpfs, owner verified; final container 232c40723049dd3e37bd153edb2afa2995c005396d0810deae83cfed2c55df8d, database w3_issue463_proof, w3_admin, PG170011 UTF8. All 155 exact pinned migration.sql files replayed in order through psql per-file connection reset; exit 0, **not official Prisma ledger/cutover proof**. Experimental private child/tombstone and 2/4arg write routines installed. Final 50 successful assertions, including aggregate differential case for 199 TS/PG vectors (not 249 independent tests; vectors counted separately). Old v1.1 JS oracle SHA256 a472f9231137499d2b8eea2f70e20d83aad23fb650f3224eae75499f43d506c0. Empty string early NULL required before split, corrected isolated SQL. Harness initial psql SET ROLE command-tag parsing false negative corrected (-q); no production code touched.

Observed: original timestamp exact retry, canonical CR/LF, changed stars/text conflict, old stars-only cannot append, old2 against commented pair conflicts, browser/legacy 4arg same pair, wrong/null intended UUID denied, revoked/expired/incomplete deny, bidi invalid no insert, 5 TS surrogate/NUL-only rejects, five malformed PG byte sequences rejected, rollback removes parent and child, erase idempotent noncontent tombstone/no child text, every 2/4arg browser/legacy replay conflicts, raw child and erase execute denied. Two real connections show lock waiting: differing pair one winner/one conflict, identical both OK with same timestamp, credential expiry during FOR UPDATE wait denied, legacy/browser completion 24h crossing while blocked denied, writer/erasure contention no resurrection. All W3 owned containers removed and absence verified. Experimental erasure privileged synthetic operator, not full A/E/notice/hold/protected phase/HTTP proof. Experimental separate tombstone table is a proof variant, not authorization to change final proposed retained ERASED child design.

Artifact SHA256:
- w3/run_proof.py: 3047f852f2722b6a8b4708a480a5d3b76840ea8f9e5e1351b899361993a2ecda
- w3/w3_experimental.sql: e9086ba94b9146c5839784ddb5bbe7984972fd8cc848236dba06460569c19c15
- w3/w3_test.py: bff3f4cd524c653619c4900dc67ad1430b3eefdf1539cbe75fb1482ac4e48aee
- w3/result.json: a5edd24f057994c349bcf20154cc0982e9efbb3f8d85b4fa28bcefb691ee3756
- w3/pinned-migrations-manifest.json: c56f57cf030b5b4ca75a3c2fde3e05d72906b1e5f55f2af7454e76ef4e1e4384

### W4 — restoration/rights

Synthetic owned network-none PG17.11, no host ports, disposable anonymous volume removed. Pre-erase pg_dump custom format SHA256 b986a034736e6515bb1d4d49b7af1841b143ee7519e2fc065476dd73a12510b9; source ERASED at 02:29:48.658Z, restored stale text observed 02:29:50.021Z, local mock reconcile completed 02:30:24.840Z (34.819 seconds observed stale row, no API traffic). Terminal trigger and repeat replay prevent reintroduction, rating preserved. Mock independent-looking local file is not actual independent operational durability, and no 30d residual or recovery SLA proven. Report in w4/W4_P0_V12_PRIVACY_EVIDENCE.md. Additional real migrated P lifecycle experiment recorded separately below; do not conflate with synthetic restore.

### W5 — actual migrated authority and locking

Owned container dc8314ec1baea7f778faf074946013120047ff7e602a562ac219847ef46b8356, run a4886e4216dd, loopback55657, DB vaylet_w5_a4886e4216dd, postgres17.11, actual pinned Prisma 155/155. W5 fixture used local superuser migration, not non-superuser equivalence (prime separately proves that). Experimental w5_proof.authorized_feedback owner NOLOGIN, exact nested EXECUTE, actual migrated authority rows, narrow SELECT/UPDATE(inert) and SHARED locks. Not actual official PROTECTED cutover or final text projection. **72/72 latest assertions** across 43+13+16, each distinct run result; earlier failed harness attempts retained.

Six actual revoker-first transactions (organization status, subscription.dashboard_access_enabled, membership role, Location status, LM grant delete, MFA factor retire) yielded 55P03 under row NOWAIT. Six corresponding reader-first authorized then actual writer blocked in pg_blocking_pids, completed only after reader commit. CA company/location, LM location positive; foreign bearer/member/org, LM company, non-RC, business UPDATE negative 42501; committed role/entitlement/factor revoke denies. User disabled first waits then denies 42501; reader-first writer blocked. Two LM shared readers and direct role revoker remained blocked after first committed, completed after second. Corrected assertion expecting simultaneous blocker count=2; PG observed immediate blocker=1. Actual management_location_stop_intake canonical lifecycle both orders (55P03 or blocked writer); session revocation both orders; post-wait credential expiry at org advisory lock ->42501. Immutable guest_ratings actual UPDATE/DELETE denied 55000; no baseline comment column. Constant guard nonzero 23514; same-value UPDATE rewrites tuple; tested org/location updated_at and revision unchanged, MFA retired factor guard update accepted, four actual BEFORE UPDATE triggers enumerated. Retired factor reactivation fixture failed by existing invariant; fixed fixture only. No blanket no-side-effect guarantee: verify final exact grants and trigger behavior.

| Matrix scope | Observed | Remaining |
|---|---|---|
| Staff user/session advisory + row locks | disable/revoke both orders and session expiry during org wait | actual application preflight/CA touch same XID, MFA assurance expiry races, membership status and integrated variants |
| Org advisory + exact membership/org/sub/loc/grant/factor row locks | all six direct DML both orders, canonical Location stop intake, shared readers | remaining canonical writer/API graph, real deadlock rollback and lock timeout budget |
| Child locks / erase | W3 writer vs erase race; separate W4 lifecycle/restore | integrated text reader vs hold/erase and child lock ordering, four-row projection numeric/ordering parity |
| Guest visit/browser | W3 same/different write, expiry and completion 24h after wait | actual HTTP credentials/CSRF/marker + final role/stage integration |
| Privilege/trigger | W1/W5 effective denies, inert check and observed tuple rewrites, prime G=M | final whole role inventory and non-grantable ACL, exact stage and combined triggers |

Artifact SHA256:
- w5/attestation.json: 974cc56556893921902421977e7f4a79be3ff4f3934d614881bb606311c45719
- w5/reader-proof.sql: 7e98019caca55e6924ad6183d2ee79d52577ff753109d5586820f619c6ea33e6
- w5/run-proof.mjs: c8a47e5e1e815508c2909d3868837967fd8be44f35b659cacf2fb920e76d790d
- w5/run-extra.mjs: 2199b8c67d041caf2dcf590287eb80b1cf357dbaf71fd0ee515b3dcabc043b56
- w5/run-tail.mjs: 32a251043e5b25a509778f71a891068abb87100d36793811405086928f5b841e
- w5/test-results.jsonl: 878d4045b9318ebe3b256c7126ab6d7c754cbf6ce0e96d9be8689b8cda6b8cfb
- w5/extra-results.jsonl: ee1bf2e02dfa85d627478a02f21be0ea906638c3196e1c6abe5f65c88e47c10c
- w5/tail-results.jsonl: 025144ac2830a6819130d7fa717fc52b912f2a52783ab9da8f8875bbef1b79f1
- w5/trigger-definitions.json: 7447f9d09a1f75986a780fab3443ca79b2a00244dc15bd7daf50f672b8408e57

### W6 — frozen design and complexity

Source-only independent evaluation, no runtime tests. Verified all 14 frozen artifacts at 2166a676; Guest ZIP SHA256 cc661d944479060647064811ea0c5a194ae177a155f7fbb4a10171ddf0c88da5; Dashboard ZIP SHA256 3c30464310194e1c636865277aaedaff758d8629d3126340c4965ac7244e280d. No prototype changes, no new UI approval needed. Identified existing notice surface only, no actual consent/read attestation, exact generic failure needed when notice invalid. Prefer phase helper as defense in depth, no broad feature flag; preserve least privilege, A/E separation, existing deployment schedule. See §4 challenge.


## 7. Supplemental executed phase and privacy proofs

### W2 continued: actual boundary and feature-stage mechanism

Observed official cutover replay wait: owner held real Option C singleton FOR SHARE, concurrent cutover requested FOR UPDATE, waiter PID431 blocked by PID418 (Lock/transactionid), replay exit0 after commit, phase remained PROTECTED. Before/after catalog identical SHA256 05b43a2a4782148606367c3494494e6c6951ebb02db365fe00e441d5c265a4ff after expected broad legacy provision refusal. Forced disconnect in actual uncommitted staff locker EXECUTE revoke: before=true, inside=false, after aborted connection=true. No persisted ACL change.

Isolated stage script uses pinned lockOptionCBoundary and assertSameCutoverTransaction; experimental boolean probe (not final F projection/phase helper). On PROTECTED, PREPARE and PREPARE replay both committed, runtime probe and F nested EXECUTE false; test stage and replay both committed, runtime probe and F nested EXECUTE true, runtime guest_ratings SELECT false throughout. Invalid LEGACY stage and missing release approval deliberately denied/rolled back. Initial CREATE ROLE without separate SET-only edge failed SET ROLE (PG17 ADMIN-only creator edge), corrected fixture and reran; no prior failure counted. This proves stage mechanics only, not actual production RELEASE permission or complete final inventory, and not both feature PREPARE orderings against actual initial LEGACY cutover. Actual final role verification, production release attestation and runtime readiness remain open.

| Artifact (w2/) | SHA256 |
|---|---|
| concurrent-lock-proof.json | 01f5e845e886b51f3b140581e9e266c6309833ab8e18efa3cabcae1b8b01e71b |
| interruption-proof.json | 280cf95e7a3bd7671c5379f72c55f0859b691ff8b8b8b33de3e9046adc23148a |
| stage-provision.mjs | 2313bcace0ff39d2d9b2dd31e86d32c8cfecebce189ac30342cfb6fd552960c2 |
| stage-prepare.json | 9c2f33bbaed64a31be60d4d0a63d5e4a956c9983067fc759bdeaae43b8352eb5 |
| stage-prepare-replay.json | ecc138c32462089d7e100e9c574000879c0cf6c4982b8078839af6dbc612eddd |
| stage-test.json | 6a3785225a7b8f5e73eeb33f9c2786d3c51a0cc67e4a0f51858dfcf3b0dd6978 |
| stage-test-replay.json | ec48bf482d46802a44d12996e07433b3ae65f73284a6c8980d01f7b158a28a99 |
| stage-invalid-legacy.json | 24ed743f77c6b845c4fb8fd194199b7e68377d3e7cacbdcda988214981a48875 |
| stage-invalid-release.json | 05b2898201e94c9310112d1d6c565ec18038a2a53654c434d1f275b3a1ff0033 |

### W4 continued: actual migrated privacy mechanism

Fresh W4-owned container issue463-w4-v12-realpg17-7c9d, ID a1905d4951eecc6a4938f51401bdfd63c3f36975f42f5ef4b33fe431af5dd87f, exclusive loopback55749, database w4_actual_155, pinned prime source archive copied to W4 isolated path. Official Prisma 7.9.1 migrate deploy succeeds 155/155 finished, zero failed. Experimental w4_privacy schema only (no changes to original migration files); 5 synthetic real valet_sessions and guest_ratings, 2 child comments. P SECURITY DEFINER owner lacks SELECT(comment_text) (catalog and actual denied query); P restricted UPDATE(comment_text) for clear, A can approve/hold/release but not apply; E applies/expires but cannot approve; PUBLIC apply denied. Results exit0: HOLD=HELD; approve during hold HELD; RELEASE=RELEASED_PENDING; approve=APPROVED; erase/replay ERASED; pending expiration EXPIRED, apply and approval denied after expiration. NO_RECORD recent (before 24h) twice returns NO_RECORD_WAIT, case nonterminal/no receipt; old >24h closes/replays NO_RECORD_CLOSED with exactly one receipt. All five original scores preserved. This is actual migrated parent/visit compatibility with an experimental case workflow; not final proposed exact five P functions/signatures/state transition, actual legal hold authority, independent write-ahead ledger or combined protected feature provisioning.

| Artifact (w4/v12_real_migrated/) | SHA256 |
|---|---|
| w4_privacy_experiment.sql | 3aac458fa0554bc3991ca3134a031ae867e19a30fab9ef3994be5cb04f518217 |
| w4_actual_fixture.sql | dd6babe3e8c2610b85b109823bc48fee80ec0ba7b6bbe801a5a239c3a8db7e2c |
| w4_acl_and_lifecycle_cases.sql | 75c82fa403cd52af6e9362742e8ec289e748a659445b2b83d24ed07b98d52a06 |

### Final artifact and cleanup references

W1 report w1/W1_P0_V12_ROLE_ACL_REPORT.md SHA256 1d98622f374bef697c8445fa611f5b590c689798484e641335b31c9631c0fdda; W1 container/anonymous volumes removed and five credential files deleted, absence verified. Cleanup Go-template precheck failed once; exact-name removal proceeded (reported safety defect, no evidence of any other target removal). W3 report w3/W3_EXECUTABLE_PROOF.md SHA256 6bb7e4db6d7f788a88678ec4c928fb90bfbdceaf858f1197fd250f7242e9d909. W3 independent Nest attempt blocked by same missing body-parser dependency; no HTTP pass. W5 report w5/W5_P0_V12_EXECUTION_REPORT.md SHA256 e44ccf286d5b0b4c09c0f6e737bfdb567fdbbe13a20b3fb4fe2f81adde6f9af3; manifest.json SHA256 c8d5f59d277b803bef2c0f1a93b5bc8d14be426554bb210dbcfac4db5c9ab80f; cleanup.json confirms own container absent, port released and secret file absent. W5 actual trigger changes not ruled out universally; preserve future migration review. Some supplemental probes used administrator SET LOCAL ROLE; primary 43 invoked limited test runtime LOGIN.

## 8. Exact remaining decision package and acceptance

| Gate | Not yet closed | Required closure evidence |
|---|---|---|
| B-01 / OD-07 | Existing official verifier incompatible by design; prototypes do not constitute the exact final F/P/G/M/R/A/E inventory or readiness | One combined attested fresh and upgrade target, both phases, boundary-lock DDL and grant transaction, exact final owner/ACL, PREPARE denied, TEST restricted to disposable proof, simulated RELEASE attestation, interrupted/repeated/concurrent cutover and negative inherited/tampered grants, readiness and preserved old ABI. Explicit owner security amendment, no broad repair. |
| B-02 / OD-04 | Independent operational ledger unverified, actual provider retention/erasure and legal rights/notice basis unknown | Owner names accountable operator/provider and legal counsel/controller/processor, signs exact notice/rights/hold/retention policy and independent ledger solution or narrow exception; attested actual old-backup replay and missing/inconsistent ledger fail closed; measurable residual copy lifetime and legal acceptance. Actual narrow A/E case workflow and expiry/erase hold races. |
| B-03 | Actual isolated authority lock/writer races pass; integrated feature lock graph not yet proven | Exact four-row numeric snapshot+child scope projection, same-XID CA activity and final authorization, direct/runtime credential negatives, MFA time/membership status, all relevant canonical writers, child read vs hold/erase including NOWAIT timeout/deadlock/rollback; prove no broader DML and validate side effects. |
| Guest HTTP | Isolated Nest attempts fail at dependency bootstrap | Reproduce valid pinned isolated dependency graph, actual rawBody route raw-byte malformed/valid tests and strict legacy/new ABI, no telemetry, exact visit/switch behavior. |
| Frozen design | Source artifacts unchanged; no implementation candidate | No additional design approval, future P7/P8 real browser/device and exact frozen acceptance only after authorized implementation. |

P0 remains open pending final evidence/decisions. The next authorized step is to close those precise P0 gaps, not P1–P8. Preserve prior work, do not repeat completed independent mechanism tests without relevant change, but do not substitute them for a combined exact candidate. No final release authorization.


## 9. Independent review and evidence integrity

W7 independently read both actual draft documents and the relevant sanitized evidence, without DB execution or edits. 29/29 initially declared artifact hashes matched the local files. Confirmed prime actual official 155/155 migration/cutover, W1 ACL proof, W3 50 assertions +199 vectors (psql history, not Prisma ledger), W5 72 isolated assertions, W2 supplemental stage JSON and W4 synthetic backup resurrection. W7 flagged missing explicit creator SET-only grant in the initial W2 script; corrected W2 stage script and passing outputs independently rechecked, not an outstanding defect. W7 verdict: NO-GO for implementation/production release, strong P0 feasibility uplift, no unified feature candidate. Exact final residual gaps: combined non-superuser migration/protected feature-stage inventory and revised verifier/readiness; same-XID CA activity/final authorization + bounded latest-four numeric/text projection + all child/lifecycle/race cases; actual HTTP adapter (dependency startup failed); independent disposition ledger and recovery/provider/legal notice/rights evidence. W7 did not rerun SQL; hash integrity does not certify correctness. W4 supplemental actual lifecycle is narrower than final five-function proposed contract; no new hold or retention legal approval. Preserve all v1.1 corrected boundaries. No production action authorized.

The frozen master-plan section was compared against the immutable v1.1 Git blob and is identical after newline normalization. No approved prototype changed. All additional execution is isolated P0 diagnostic work. Any further proof uses fresh exclusively owned disposable resources and independently reviewed scope.


### Final W2 and W4 supplemental observations

W2 final runtime LOGIN invoked only the dummy probe during TEST; direct rating SELECT denied 42501. TEST replay catalog fingerprint identical b510ffab65358314f4fe3f6ab51891e6fa5565437be7a21400ff9960e000bed0. Stock protected verifier rejected active experimental grant with "Staff session lock EXECUTE inventory is unsafe"; cleanup-test revoked only experimental EXECUTE, actual runtime dummy and rating SELECT both denied 42501; stock protected cutover verification then passed again. Phase remained PROTECTED. The W2 cleanup-test JSON SHA256 is ed730be82f6747d7bcd469836f69ccfb5096cad2730fbf32c7e379ce8b720199. Real role grant incompatibility is a required narrow amendment, not a defect to bypass.

W4 concurrent apply test recorded both executor results ERASED (w4/v12_real_migrated/w4_concurrency_results.txt SHA256 34acf614dbd848982c52dc1e549d0d2b7c055cb4564a6ddcfc4ef31624cb2045; wrapper SHA256 05fb3e16be917536747b28427a6edb3af7b894c74928d476e0a2ef8517e08838). This is case-level idempotent apply, not integrated comment reader/erase serialization proof. No additional production policy approval or backup assurance follows.

W4 final migrated negative checks (exit 0) established expired approval cannot apply; recent NO_RECORD_WAIT remains open even on expiry, direct resurrection and original rating UPDATE denied 55000; six cases: ERASED=2, EXPIRED=2, NO_RECORD_CLOSED=1, NO_RECORD_WAIT=1; exactly three terminal receipts (two ERASED, one NO_RECORD_CLOSED); five of five stars intact, both erased comments NULL. Two independent executor connections returned ERASED for same case with exactly one receipt; test-only delayed locking wrapper removed. Final negative SQL SHA256 1fe4e9dca80f2a8cb5d33544a5db5f6e7ef62364b60ad08e7e5351996a2485cc. Still no combined exact protected feature or independent operational ledger proof.
