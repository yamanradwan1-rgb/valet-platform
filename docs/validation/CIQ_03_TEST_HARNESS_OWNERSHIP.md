# CIQ-03 — test-harness ownership invariant

Scope: test classification and its regression checks only. This task does not
change the PostgreSQL harness, project profiles, database schema or application
behavior. The accepted Issue #215 protected project/manifest and target
attestation remain authoritative.

## Baseline defect

`scripts/test-harness/classification.test.mjs` asserted an exact number of
`database-postgres-direct` and `database-postgres-provision` suites. Adding a
legitimate direct PostgreSQL test for Issue #363 increased direct ownership
without changing its safe classification, making the fixed-count assertion
fail even though the discovered tests were still assigned.

## Required proof

- For API and database, compare the **complete normalized discovered filename
  set** with the complete owned filename set. Both must match, with no repeated
  owners or omitted files; do not rely on matching counts alone.
- Keep representative PostgreSQL-direct, provisioning and non-PostgreSQL
  membership assertions, and preserve the exact Issue #215 protected manifest
  assertion and the existing negative tests for unregistered mutation fixtures.
- Prove with synthetic temporary files that adding new direct, provisioning
  and non-PostgreSQL database tests preserves unique ownership and routes each
  case into the intended project without updating a fixed suite count.

These checks establish classification ownership, not successful CI execution or
actual PostgreSQL isolation. They require only Node's test runner and temporary
local files; no database connection is needed.
