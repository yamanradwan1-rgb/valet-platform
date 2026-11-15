# Issue 416 — U2 writer closure source diagnostic

**Status: SOURCE-ONLY, ALWAYS BLOCKED.** This tool performs no database access
and does not modify application grants, migrations, runtime provisioning, roles,
the Option A boundary or traffic. Its output is an auditable review input,
never a PostgreSQL 17 authorization acceptance or cutover permission.

Run from the repository root:

    node packages/database/issue416-writer-closure/check.mjs

Exit code **2** and JSON verdict **BLOCKED** are intentional. Exit code 0 is
never returned by the diagnostic. The repository's existing source contains
legacy direct table/column grants and weak SQL-definer EXECUTE provisioning.
For example:

- provision-runtime-role transitively re-runs MFA and other grant installers.
- runtime-table-privileges invokes Shift Force End provisioning, which
  transitively invokes onboarding and staff-management provisioning.
- The source inventory enumerates A01–A11, M01–M15, P01–P05, R01–R03 and X01,
  including the exact exclusions A10/A11/M07/R01 (read-only), M13/P05
  (bounded maintenance), M14/M15/P01/P02 (controlled/external operators), and
  P03/P04 (nonproduction fixtures).

The scanner uses a TypeScript AST to follow direct named imports/calls from the
legacy runtime provisioner's entry point, observes static SQL grant templates,
reports dynamically constructed SQL as unresolved, parses static old function
signature lists, and lexes migration SQL to distinguish real CREATE FUNCTION
declarations from comments, strings and function bodies. It fingerprints the
inventory, provisioning call graph, legacy signatures, and migration files.
These fingerprints bind evidence to the inspected tree; they do not attest a
deployed binary or deployed privilege state. Additional dynamic/indirect calls,
untracked SQL or external writers require independent manual review.

## Optional independent evidence shape validation

    node packages/database/issue416-writer-closure/check.mjs --evidence signed.json --trusted-key-file reviewer-public-key.pem --trusted-key-sha256 PINNED_SPKI_DER_SHA256

No public key or signed evidence is bundled. The reviewer key fingerprint must
be independently pinned; the signed.json Ed25519 signature covers canonical
JSON over the payload. Its runtime field must declare a PostgreSQL 17 release
audience, complete principals/overloads, migration history digest and 12 named
checks with evidence digests. Each of the **35** inventoried rows requires a
separate signed closure entry, allowed class-specific protocol, applicable
suboperation variants, source-row binding and negative/PG17 evidence references.
Every authenticated variant requires an observed SQL VAP1 prepare/execute
definition pair. P02 additionally requires external commercial writer inventory
evidence; X01 requires Shift/Task lock compatibility evidence.

**A signature verifies only the declaration's integrity**, not the truth of
attached test results, deployed role ACLs, inherited/PUBLIC grants, actual
pg_proc overloads, signer key custody, real credential provenance, or deployed
traffic fencing. Even a syntactically valid self-signed fixture cannot clear
ACTUAL_PG17_ACL_AND_CUTOVER_NOT_VERIFIED_BY_SOURCE_DIAGNOSTIC. Independent
PG17 integration, real SQL-only negative ACL tests, genuine credential ceremony
validation, approved L1/L2 evidence and reviewed release authorization must
be performed through separately controlled processes.

The source diagnostic must never be wired into a deploy decision as a positive
gate. It exists to make missing evidence and legacy authority visible and
machine-checkable without claiming a protected writer has passed acceptance.

## Focused offline tests

    node --test packages/database/issue416-writer-closure/closure-source.test.mjs packages/database/issue416-writer-closure/closure-evidence.test.mjs

The synthetic signed fixtures in these tests are **not** real PostgreSQL
evidence. Tests write only disposable OS temp fixtures; no repository source,
role, migration or database is mutated.
