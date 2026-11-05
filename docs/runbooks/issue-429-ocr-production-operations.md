# Issue #429 — OCR operating and UNKNOWN recovery runbook

Status: **Historical shared-admission/recovery procedures; not the current direct
OCR request path.** DEC-074 §24 (2026-11-06) supersedes this runbook for new OCR
requests. Do not run OCR operator provisioning/activation as a prerequisite for
direct Plate Recognizer. Retain historical database state; this document does
not authorize a migration, rollback, deployment or paid request. The live path
requires normal Staff `DATABASE_URL`, HTTPS `PLATE_OCR_ENDPOINT`,
`PLATE_OCR_TOKEN`, and optional score/timeout settings. Only the existing
Organization/Location `ocrAssistEnabled` policy enables assistance after Staff
and Shift authorization. Rate protection is per API process, not a spending
quota across replicas.
Source: Accepted DEC-074 (2026-11-05 historical amendment; §24 supersession).

## Preconditions before *any* production change

1. Confirm real provider account cycle, lookup-unit billing definition, verified
   provider completion/drain evidence, HTTPS/TLS trust, egress, privacy/retention,
   human operator identity, incident response and alert ownership. Do not assume
   `HTTP 2xx` or local abort proves the provider stopped processing/billing.
2. Confirm isolated PostgreSQL and multiple-API-process migration/role tests,
   security/tenant negatives, adversarial crash/UNKNOWN/restart tests and CI.
   Check ordinary Check-In paired latency P50/P95/P99 confidence intervals and
   eligible-with-headroom NOWAIT false-denial bounds independently. Inconclusive
   or missing measurements are **not** a PASS.
3. Confirm Native automated camera/ROI/EN-AR/Light-Dark visual freeze evidence.
   Phase 7 physical-device QA was removed from this execution: mark actual
   Android/iOS physical proof **NOT RUN**, not passed.
4. Secure a separate Owner approval for deployment, production migration,
   restricted operator/maintenance identities and **production OCR activation**.
   This implementation branch and its review push approve none of them.

## Database and runtime privilege separation

- API runtime uses only its existing restricted `DATABASE_URL` identity, with
  EXECUTE on the two narrow `ocr_admit` and `ocr_settle` routines. It never
  receives unrestricted OCR table DML, operator history, or maintenance grants.
- The migration/bootstrap identity exists solely for controlled deployment.
  Never reuse it as an operator, API, or maintenance identity.
- Provision a distinct individually attributable PostgreSQL LOGIN for every
  authorized VAYLET operator; assign only the `vaylet_ocr_operator` NOLOGIN
  capability through the reviewed, separately approved grant procedure. The
  database must derive actor identity from authenticated `session_user`, not a
  caller-supplied actor string. Company Admin, Location Manager and employee
  accounts cannot administer OCR cost limits.
- Provision a separate restricted maintenance LOGIN with execute-only
  `ocr_detect_expired(integer)`. No generic queue, API-request scheduler,
  runtime credentials or migration credentials may be used for the sweep.
- Supply credentials only through trusted secret management as
  `OCR_OPERATOR_DATABASE_URL` or `OCR_MAINTENANCE_DATABASE_URL`, each with
  enforced TLS and independently authorized network access. Do not echo,
  export into logs, commit, paste in a ticket or give the API child their values.

## Operator control invocation (after separate authorization)

From the repository root, `tsx` is available in the existing API toolchain.
The CLI validates action-specific flags, exact revisions, idempotent operation
UUIDs and the current restricted database principal. Run the following command
shape only in an approved, audited operator execution context:

```text
corepack pnpm --filter @valet/api exec tsx tools/ocr-control.ts <action> --operation-id <fresh-uuid> --reason-code <UPPERCASE_CODE> [action-specific flags] [--evidence-ref <nonsecret-reference>]
```

Supported actions and required additional flags:

| Action | Required flags | Outcome |
| --- | --- | --- |
| `provision-period` | `--account-alias`, `--starts-at`, `--ends-at`, `--quota-units` | Stage one explicitly bounded UTC period, refusing overlapping account periods. Does not activate it. |
| `set-org` | `--organization-id`, `--expected-revision`, `--enabled true\|false`, `--concurrency-cap` | Versioned Organization kill/cap control, default OFF. |
| `allocate` | `--period-id`, `--organization-id`, `--expected-revision`, `--quota-units` | Versioned per-period Organization lookup-unit allocation. |
| `set-platform` | `--expected-revision`, `--enabled true\|false`, `--account-alias`, `--concurrency-cap` | Versioned platform kill/cap/account alias. Default OFF until approved activation. |
| `activate-period` | `--expected-revision`, `--period-id` | Activates only an approved current account period; unknown old-period exposure blocks it. |
| `resolve-attempt` | `--attempt-id`, `--organization-id`, `--expected-revision`, `--proof-code`, **`--evidence-ref`** | Audited, guarded resolution only after verified remote evidence and fencing. |

Use new operation UUIDs for separate intentions; replay a *previously accepted*
operation with the same exact values only when safely recovering from an
ambiguous CLI response. Never recycle an operation ID for different values.
Inspect the approved target scope and current revisions using separately
authorized read-only administration; the operator LOGIN cannot read private OCR
tables arbitrarily. No customer media, plate, provider secret or token is a
valid `evidence-ref`.

## Recovery and fail-closed behavior

The API must perform known-committed atomic Admission A before at most one
HTTPS request, then attempt bounded scoped settlement S. Every committed
Admission consumes exactly **one immutable lookup unit** against its original
global period and Organization allocation, including `NO_MATCH`, failure,
timeout, cancellation and proven no-send. Never refund, borrow, silently reset
or roll over unused units. Unknown COMMIT means **no paid dispatch**.

Only a provably never-invoked request can settle `NOT_SENT`; a fetch that may
have been invoked remains `UNKNOWN` even after a complete HTTP response unless
real independent remote completion evidence exists. `SEND_POSSIBLE` and
`UNKNOWN` occupy global/tenant/identity concurrency and persist across
restarts, local timeouts and new periods. A local deadline alone never releases
them; failure to prove completion leaves affected OCR unavailable. Manual Plate
and No Plate Check-In remain usable without OCR.

An external off-path scheduler **may** invoke exactly one maintenance sweep at
an approved 30-second cadence (no scheduler is installed by this feature):

```text
corepack pnpm --filter @valet/api exec tsx tools/ocr-maintenance-sweep.ts
```

The maintenance procedure attempts one nonblocking PostgreSQL advisory lease
across replicas, processes at most ten due attempts per sweep and only
classifies stale `SEND_POSSIBLE` work `UNKNOWN`. It cannot send to a provider,
issue new quota, refund debit or clear remote capacity. Alerting, independent
operator review and actual scheduler ownership are separate operational setup
requirements.

For an `UNKNOWN` attempt, independently verify the exact tenant, attempt,
account/period, admission timestamp, owner nonce/revision, prior send state,
remote billing/completion facts and all possible late local sender processes.
Fence old local send capability and validate the authorized reconciliation
evidence. Only then may a restricted operator invoke `resolve-attempt` with
`REMOTE_COMPLETED_FENCED` or `REMOTE_NOT_SENT_FENCED`, the expected revision,
exact Organization and a bounded nonsecret evidence reference. If remote
completion cannot be proven, do **not** resolve, retry or release capacity.
Both successful controls and failed attempts should have scoped, redacted
operational diagnostics with no guessed billing assertions.

## Emergency response and rollback

On provider/budget/store uncertainty, enforce the platform or Organization
kill switch through a *new authorized versioned operator action* and record
reason/evidence. Manual/No Plate Check-In continues. A kill switch prevents
**new** OCR Admission; it does not prove an already invoked remote request
stopped, erase spent units, delete attempts or reconcile `UNKNOWN`. Restore
OCR only after independent evidence, repair, measured requalification and
separate Owner approval. Production SQL history and applied migrations are
never rewritten or dropped to simulate recovery.
