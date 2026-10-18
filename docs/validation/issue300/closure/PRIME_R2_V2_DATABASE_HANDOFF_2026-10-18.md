# Issue #300 R2 — independent V2 database acceptance handoff

**Date:** 2026-10-18, local test-only environment. **Latest reviewed source correction:** `e55a13a3064d9c02275fbe0404d2b82201c3a69e` (descendant of original approved `a0a6fb1c`). Database schema/migration source unchanged between those revisions. **Overall acceptance remains NOT READY.**

## Independently verified actual database results

W6 exclusively created and provisioned `issue300_r2_w7_acceptance_v2_pg17`, an **entirely new Docker PostgreSQL 17.10** instance, labelled `com.vaylet.task=issue300-r2-w7-acceptance-v2`, with volume `issue300_r2_w7_acceptance_v2_pgdata`, bind `127.0.0.1:58387`, 384 MiB Docker memory cap and 0.7 CPU. The intended database is `issue300_r2_w7_acceptance_v2`, migration owner `issue300_r2_w7_owner_v2`, ordinary runtime role `issue300_r2_w7_runtime_v2`. Its ID starts `fb29dc4f`; W6 checked the complete Docker ID. No existing human PostgreSQL instance or LM session was used.

W6's actual canonical Prisma fresh-0→96 migration command **succeeded**, taking approximately 31 seconds, after fixing the earlier **PowerShell Hashtable interpolation** P1000 bootstrap defect in its entirely new task-owned provisioning flow. W6 also ran the existing canonical ordinary role provisioner and reported actual separate runtime-role login, denied evidence UPDATE/DELETE/trigger function execution, and permitted operational Task/Session mutations.

**Prime's independent read-only recheck** on the exact Docker container (not W6's report alone) verified:

| Actual `BEGIN READ ONLY; … ROLLBACK` result | Observed |
| --- | --- |
| Container, label and localhost port `58387` | Exact identity matched |
| `current_database()` | `issue300_r2_w7_acceptance_v2` |
| `current_user` | `issue300_r2_w7_owner_v2` |
| `server_version_num` | `170010` |
| `_prisma_migrations` total / finished / distinct names | **96 / 96 / 96** |
| Birth-XID columns / enabled birth triggers / enabled immutable triggers | **6 / 12 / 6** |
| Live function-body SHA256 calculation | **3 functions, 64 hex characters** |
| Separate runtime login `current_user/session_user` | Both `issue300_r2_w7_runtime_v2` |
| Runtime Audit SELECT / UPDATE / DELETE | **true / false / false** |
| Runtime Task UPDATE / Session UPDATE | **true / true** |
| Runtime `_prisma_migrations` SELECT, schema CREATE, provenance trigger function EXECUTE | **false / false / false** |

The guard function fingerprint is obtained from actual `pg_get_functiondef()` and `sha256(convert_to(...))` under PostgreSQL 17; this **proves support for the fingerprint SQL**, not a completed same-OID tampering experiment or a signed live API certificate.

Prime also independently connected with the **ordinary runtime role** inside this exact labelled disposable PostgreSQL and ran a second read-only transaction. The resulting privilege vector matches the expected limited runtime: read Audit, update operational Task/Session, no evidence mutation, no migration-ledger visibility, no schema creation and no direct EXECUTE privilege on the birth-marker preservation function. This strengthens the actual-role W6 proof; it does **not** itself demonstrate authenticated HTTP or later grant revocation.

## Still not proven

**Integration blockers found in independent W12 review, requiring test-harness repair before real execution:** `scripts/issue300-w13-owned-target.mjs` currently expects an attestation under `tmp/issue300-r2-w7-v2-owned`, but the signed certificate issuer writes immutable `.json` and detached `.sig` under `tmp/issue300-r2-w7-acceptance-v2-owned`. The W13 verifier must use the issuer's **exact canonical path**, reject symlinks, and independently validate the **pinned Ed25519 signature** over raw certificate bytes; never copy arbitrary unverified JSON as an attestation. W13 also needs independent CA/LM active membership/Location evidence, exact HTTP denial categories rather than any non-200, and required TASK_PARENT S0→S1/quality deltas. W8's first portable load harness was independently found vulnerable to false-fast `EXPLAIN` on empty Search results, empty HTTP200 samples, weak mount/source-writer/cold identity checks; corrections are required before any performance PASS. These are **review findings**, not claims of observed runtime failure.

- **U05-R04/R05 and T65:** fresh 0→96 plus least-privilege runtime subset now has **actual PASS evidence**, but populated 93→96, controlled interruption/unknown COMMIT, two competing runners, online lock/writer races and complete rollback/compatibility remain **GAP**. Do not promote the full matrix rows.
- The separate task-owned private `pg-private-v2.json` (passwords/connection strings) is ACL-restricted and Git-ignored. The sanitized W6 resource handoff `pg-resource-v2.json` is **not** the final Owner-signed certificate and contains an earlier provisioning candidate SHA. No private values are copied into this report.
- Exact final candidate API bundle/build, resource manifest and independent fixture-scoped Owner Ed25519 signature must be issued **after** subsequent reviewed source/test edits are committed. A stale SHA must fail closed. The ordinary API must preserve its indirect 503 and must never consult this test-only proof.
- Real isolated CA/LM password+TOTP authentication, same-cohort signed HTTP 200 versus ordinary 503, two-page/held-writer S0→S1, one Playwright canary and remaining 34 cases, 100k/1m performance and 20 cold trials have **not** been demonstrated here.

**Resources preserved:** human Dashboard `:3114`, human API `:3165`, human PostgreSQL `:57285`. No production, push, PR, merge, deployment or Issue closure.
