# Issue #429 COS ownership and execution ledger

This ledger records **observed** execution assignments and evidence, not
completion or permission to activate the production feature. Update status
and reviewed commits as work arrives; no worker may edit another worktree.

- Initial COS run: `3a5ecd6c-2b03-42a1-92ca-4ffc52c96623`; later resumed run:
  `26e7af10-0496-40eb-84f6-1bf322a99407`; Prime identity: `prime`.
- Fetched baseline `origin/main`: `ac758ffff7181efa6cad1311c40aca731171770e`.
- Fetched planning `origin/plan/issue-429-production-ocr-admission`:
  `95ea194099c0e48c417a90956a89fdd22048d79f`.
- Prime import baseline: `b0eb726777dd765568253e19fa1b09e9cba37a31`.
- Prime integration branch: `feat/issue-429-ocr-mvp-prime`;
  worktree: `tmp/issue-429-ocr-prime`.

| Worker | COS ID | Assignment | Branch / worktree suffix | Owned files | Dependencies | Commit | Independent reviewer | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `worker-1` (COS startup failed; Prime substitute) | Phase 0 decisions/docs | `feat/429-w1-dec-docs` / `issue-429-ocr-w1-docs` | Focused DEC-074, decision log, Schema, Security, Traceability, plan matrix | Source-of-truth and Owner instruction | `d93c962d`, whitespace correction `9c38b7a5` (Prime authored) | W2 independent read-only **CLEAN** | Phase 0 accepted, docs-first gate complete; actual W1 COS launch failed |
| 2 | `worker-2` | Shared PostgreSQL schema, Admission SQL/settlement, restrictions and private test prelease | `feat/429-w2-db` / `issue-429-ocr-w2-db` | New six-table migration, Prisma representation, scoped grants and private PG17 test fixture/target | Phase 0 and W3/W5 SQL contracts | `f120f072`, `b2938901`, `f3e83172`, `12d486bc`, `d8170aab`, `725890e0`, `206d9ed5`, `c821b4e0` | W3 + W5 original SQL fixes **CLEAN**; W8 exact final tests/profile corrections **CLEAN** | Real isolated PG17 private suite **7/7 PASS** twice, including integrated Prime; private resources cleaned, no owned leftovers. Cross-process production smoke/P1/P2 NOT RUN |
| 3 | `worker-3` | One combined Staff authority + Admission and immediate one-use permit | `feat/429-w3-admission` / `issue-429-ocr-w3-admission` | Private Admission executor, authority checks, sealed permit and focused tests | W2 SQL A interface | `c7690039` | W4 independent read-only **CLEAN** | Integrated; 16/16 focused Vitest PASS; real transaction tests NOT RUN |
| 4 | `worker-4` | Authenticated OCR API/provider and truthful Management readiness | `feat/429-w4-api` / `issue-429-ocr-w4-api` | Service/guard/controller, provider HTTPS/abort observation, cost guard and tests, management status | W3 permit, W5 settlement | `7abc1e54`, `1c6922c3`, `4ec21f9c`, `7ad9890a`, `b9404974` | W3 original permit/NODE_ENV fixes CLEAN; W8 final module-provider expectation CLEAN | Integrated; focused non-PG 69/69, integration mock 36/36, full API 1740 PASS/6 SKIP; two-process PG HTTPS NOT RUN |
| 5 | `worker-5` | Guarded S/UNKNOWN and restricted operator/maintenance CLI | `feat/429-w5-recovery` / `issue-429-ocr-w5-recovery` | Settlement, authenticated restricted CLI, bounded off-path detector, associated focused tests | W2 typed SQL and ACL contract | `378f7e1e`, `175cc863`, `12f7cb13` | W2 independent read-only **CLEAN after two security corrections** | Integrated; 71/71 focused Vitest PASS; real PostgreSQL, remote proof and operator account provisioning NOT RUN |
| 6 | `worker-6` | Native deliberate Capture and frozen appearance | `feat/429-w6-native` / `issue-429-ocr-w6-native` | Native code/tests and English/Arabic dictionaries only | Phase 0, existing OCR union | `7df57894` | W7 independent read-only **CLEAN** | Integrated; 260 Native files and 1881 tests PASS (15s per-test timeout), TypeScript/lint/style freeze PASS; physical-device QA **NOT RUN**, Phase 7 removed |
| 7 | `worker-7` | Independent synthetic TLS, multi-process QA and registered latency/NOWAIT harness | `feat/429-w7-qa` / `issue-429-ocr-w7-qa` | `scripts/test-harness/issue429-qa-*` QA/provenance modules and tests only | W2 SQL/ACL and real isolated PG17, approved representative load | `aa3bce89`, `e3436845`, `9f81a7a1`, `d62c9dd0`, `29df7878`, `004a99e5`, `3e5f6ec2`, `ee99f6e5` | W5 source-to-dist MAJOR resolved by W6 CLEAN; W8 privileged Git/fsmonitor MAJOR resolved and independently re-reviewed **CLEAN for source integration** | Final integrated Node tests 38 PASS/1 SKIP (OpenSSL), source/child/lease/fsmonitor negative cases PASS. Real two-process PG HTTPS smoke/P1/P2 **NOT RUN**, load approval absent |

Phase 0 complete; Phases 1–4 source implemented, reviewed and integrated.
Phase 5 source/local static, isolated PG17 7/7 and Native automated checks
have evidence, but two-process HTTPS/identity/egress proof remains blocked.
Phase 6 paired ordinary
Check-In and eligible-headroom NOWAIT benchmarks remain `NOT RUN`, with no
confidence bounds or credible performance verdict. Phase 8 integrated source
review corrected W7 source provenance under trusted local runner assumptions.
Phase 7 was removed by Owner; physical-device evidence `NOT RUN` and remains
mandatory pre-merge under DEC-074. Docker recovered and the dedicated private
PG17 suite passed with strict prelease/exclusive ownership. Production
account, period, provider cost/privacy,
operator identities and activation require independently approved setup.
No PR, merge to `main`, deployment, live database migration, paid provider
traffic or production OCR activation has occurred at this ledger revision.
