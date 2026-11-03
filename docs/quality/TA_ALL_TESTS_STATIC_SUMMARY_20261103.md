# VAYLET Test Audit — Authored Test Declaration Registry

Immutable audit source: `f9ecebd9af85b44580771b4027515d06c0a31de4`. This is an automatically generated **static AST inventory**, not a manual approval of every test's domain contract.

- Tracked test/spec files: **2036**.
- Authored test declarations: **9420** (some parameterized declarations expand to multiple runtime cases).
- Dynamic titles or dataset declarations: **845**; these require real runner collection to measure case count.
- Files with no recognized direct test()/it()/specify() call: **0** (possible generated tests, unusual runners, or helper-only naming).
- Files with TypeScript AST parse diagnostics: **0**; see the file ledger for exact paths.
- Every declaration and file is explicitly marked `NOT_SEMANTICALLY_REVIEWED` until a human/worker verifies its invariant and unique defect-detection value.

## Lane inventory
| Existing 2026-11-03 classifier annotation | Tracked files |
| --- | ---: |
| PACKAGE_NON_POSTGRES_CANDIDATE | 828 |
| DASHBOARD_MOCK_E2E_NOT_DEFAULT_CI | 270 |
| CLASSIFIED:api-postgres-race | 266 |
| CLASSIFIED:api-non-postgres | 211 |
| CLASSIFIED:api-postgres-standard | 187 |
| CLASSIFIED:database-postgres-direct | 43 |
| CLASSIFIED:database-postgres-provision | 43 |
| SCRIPT_EXECUTION_UNVERIFIED | 35 |
| CLASSIFIED:api-postgres-compound | 28 |
| CLASSIFIED:api-postgres-issue319-private | 20 |
| CLASSIFIED:api-postgres-issue333-private | 15 |
| UNCLASSIFIED_NONPACKAGE | 14 |
| REQUIRED_DASHBOARD_RUNTIME_E2E | 13 |
| REQUIRED_EMPLOYEE_E2E | 13 |
| CLASSIFIED:api-postgres-issue215 | 12 |
| EXPLICIT_HARNESS_TEST | 11 |
| CLASSIFIED:database-postgres-issue215 | 8 |
| CLASSIFIED:database-non-postgres | 8 |
| NOT_IN_PREVIOUS_FILE_INVENTORY | 5 |
| CLASSIFIED:api-postgres-issue333-w4-private | 2 |
| DATABASE_OUTSIDE_CLASSIFIER_EXECUTION_UNVERIFIED | 2 |
| CLASSIFIED:api-postgres-issue309-browser | 1 |
| EXPLICIT_BUILD_CONTRACT | 1 |

## Interpretation limits
1. Static case declarations are **not** live executed test instances; nested loops, data-driven `test.each`, generated test titles and setup callbacks may expand cases at runtime.
2. Source signals flag candidates only. A string assertion can be a binding user contract; a fixed request count can be a required anti-N+1 budget; a snapshot can be an approved UI freeze.
3. A file without direct cases is not automatically redundant or safe to remove.
4. The previous file inventory may be older than this SHA; mismatch is surfaced rather than hidden. CI ownership must be checked by the official classifier.
5. Required PostgreSQL/Issue215/tenant/Location/MFA/payment/custody/retry tests must not be skipped or deleted based only on a numeric risk score.
6. To claim exhaustive runtime cases, reconcile this registry against Vitest/Node/Playwright collection across all approved lanes and separately identify manual/private suites.
