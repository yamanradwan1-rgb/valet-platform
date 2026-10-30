# Issue #374 — isolated PostgreSQL evidence target safety

## Scope and authorized contract

The Owner's Issue #374 implementation instruction authorizes a local-tool-only
fix for `apps/api/tools/issue336-evidence-summary-pg.ts`. The baseline is
`f494ed06b4ffc6c698bfabb7519acd9994d07e6e`. This changes no application database
policy, production configuration, schema, migration, business behavior or UI.
The published 24-finding verification report remains unchanged.

The tool requires `ISSUE336_PG_ACK=ISOLATED_LOCAL_ONLY` and a PostgreSQL URL
whose literal host is `127.0.0.1` and database path is `/vaylet336`. Validation
must precede pool construction and connection. Credentials and complete
connection URLs must never appear in validation errors or diagnostic output.

The focused guard accepts `postgres:` and `postgresql:` URLs without query
parameters, fragments, whitespace/control characters or malformed escapes.
It rejects query options wholesale, including host/database/port, socket,
service and nested connection-string selectors, rather than forwarding an
open-ended driver configuration language. This restriction applies only to
this disposable evidence tool. Ordinary URL credentials and explicit ports
remain supported. An omitted port uses a valid `PGPORT`, otherwise pg's
standard 5432 default; ports must be whole decimal integers in 1..65535.

The guard returns a frozen explicit host/database/port/credential/max config;
the pool receives that object, never the original URI. Thus subsequent
environment changes cannot alter the validated destination. No production
connection helper is reused or changed. Existing evidence queries, counts,
scope predicates, microsecond-order assertions and rollback remain byte-identical
from the connection call through cleanup. Runtime failures now emit only a
fixed diagnostic and retain the existing nonzero exit status, preventing an
error object from exposing a credential-bearing input.

## Root-cause evidence

An offline reproduction against installed `pg` 8.22.0 and its actual
`connection-parameters` parser confirmed that the original standard-URL
host/path guard accepts a synthetic URI whose query changes the effective
driver host to a reserved `.invalid` name, and a query can replace the port.
No connection, DNS lookup or SQL was initiated. Direct database query options
did not override the non-empty database path in this installed version; they
are rejected defensively, not described as an observed database escape.

## Verification

All final required available local checks passed. The two new test files contain
58 offline cases; the existing Issue #336 evidence-summary query file contributes
10 unchanged cases: **68/68 tests passed across 3 files**. Coverage includes
ACK/URL absence, protocols, malformed targets and credentials, override query
options, explicit/default/environment ports, actual installed-driver target
resolution, validation before pool/connection initialization, exact pool config
handoff, and redaction even when a simulated connection error contains a URL.

The pool/connection boundary is mocked only in startup-order tests. Parser tests
instantiate only the installed driver's parameter parser. All selected files
are owned by `api-non-postgres`; that lane installs the repository's real-PG
connection guard. No runtime database or migration evidence is inferred.

Exact commands below ran from the repository root unless otherwise specified.
Their final exit codes are **0**. Logs with complete arguments, working
directories, output and exit codes are in ignored `tmp/issue-374-evidence/`.

```text
# cwd: apps/api — 3 files, 68 tests passed
node ../../node_modules/vitest/vitest.mjs run --config vitest.config.mjs --project api-non-postgres --maxWorkers 1 test/issue336-evidence-target.test.ts test/issue336-evidence-startup.test.ts test/condition-photo-evidence-summary-query.test.ts

# API TypeScript, including tests and imported helper
node node_modules/typescript/bin/tsc -p apps/api/tsconfig.json --noEmit

# Explicit tool check: tools are not root entries in the API tsconfig
node node_modules/typescript/bin/tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --esModuleInterop --skipLibCheck --target ES2022 --module CommonJS --moduleResolution Node apps/api/tools/issue336-evidence-summary-pg.ts

# ESLint for all changed authored code
node node_modules/eslint/bin/eslint.js apps/api/tools/issue336-evidence-target.ts apps/api/tools/issue336-evidence-summary-pg.ts apps/api/test/issue336-evidence-target.test.ts apps/api/test/issue336-evidence-startup.test.ts --max-warnings=0

# Architecture and 300-line rule
node scripts/architecture-check.mjs

# Formatting: newly authored TypeScript files
node node_modules/prettier/bin/prettier.cjs --check apps/api/tools/issue336-evidence-target.ts apps/api/test/issue336-evidence-target.test.ts apps/api/test/issue336-evidence-startup.test.ts

git diff --check
```

The initial API typecheck found a test-only string-index typing error, corrected
with a literal tuple before the final successful check. Architecture emits only
existing grandfather warnings outside this change. Final physical line counts
are 72 (guard), 106 (CLI), 194 (target tests), and 96 (startup tests), all below
300. The existing CLI's unrelated formatting is preserved.

Full-repository tests/build and production connectivity checks were not run:
this change affects one disposable evidence tool, and the Owner requested the
focused checks above. No dependency or lockfile changed. Self-review verified
the exact five-file scope, unchanged SQL/assertion/rollback body, no schema or
production code edits, and unchanged SHA-256 of the 24-finding report. No
subagents or delegated review were used.

Real PostgreSQL smoke: **NOT RUN**. No explicitly approved disposable local
instance is available. Docker listed no running containers; no external or
unapproved database will be contacted and no instance/migration is created.
Offline parser/pool-constructor tests are not real database evidence.
