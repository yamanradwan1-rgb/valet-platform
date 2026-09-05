# VAYLET — Current Project Status

> Operational handoff snapshot only. This file is not a binding product/domain contract.
> For current repository facts, GitHub wins. For accepted behavior, use the authority order in `AGENTS.md`, the Founder & Product Blueprint v1.0, binding docs, and Accepted decisions.

## Employee Native Program

The canonical Employee Native order, scope, gates, evidence, and status plan is
[`docs/20_EMPLOYEE_NATIVE_EXECUTION_PLAN.md`](20_EMPLOYEE_NATIVE_EXECUTION_PLAN.md).

- Native synchronization: **2026-09-06**. The v2 rebaseline application baseline
  remains `6c965a17fcc1a699270a189c38c52ec67079099a`; current merged `main` is
  `1cca7a4a40bb604dc0fcbe208bfd51feff42170d` after MOB-028 implementation and its
  focused lifecycle/visual repair.
- Plan v2 preserves MOB-001–027 and MOB-010A history, splits remaining work into
  bounded children, and adds MOB-028 production shell and MOB-029 queue closure.
- MOB-001–004 policy/architecture work is historical baseline. MOB-005–010A
  have merged implementation: Expo, portable client, Native auth, operational
  tasks, QR, intake/returning, shared presentation and assistive OCR repairs.
- MOB-010B non-device reconciliation remains recorded from
  `codex/mob-010b-native-evidence-closure`, audited from
  `7e9b888b385e7081d0afad1363034df0e600857d`. The owner has now closed the G0
  baseline physical checklist using a Development Build on device `V2302A`, Android
  10, build `X690B-H691DE-Q-GL-220215V356`, against reviewed SHA
  `932dee4f6867ff609d0446e41ce0084e9a2215b8`, launched through
  `corepack pnpm mobile:poc`. The required G0 physical checklist is owner-reported
  PASS. This closes G0 physical evidence; it does not promote later signed-release,
  full-device-matrix, soak, or production evidence.
- MOB-028 — Production shell, access and context routing — is merged. Initial
  implementation commit: `29ae0a8a239751afdb3d4d6e00143b4348a8f14f`; focused
  lifecycle/visual repair and current merged main: `1cca7a4a40bb604dc0fcbe208bfd51feff42170d`.
  Independent GitHub review passed after the repair, and owner physical verification
  passed. Final reported local validation was employee-client 147/147 tests,
  valet-native 418/418 tests, both lint/typecheck suites green, architecture check
  green with only existing grandfathered warnings, targeted Prettier green and
  `git diff --check` green. No API, DB, schema, migration or dependency change was
  part of MOB-028.
- Remote CI is **not verified green**. Push CI run #307 at `932dee4...` and push CI
  run #308 at `1cca7a4...` both completed with conclusion `failure`. No failure cause
  is inferred here. MOB-028 therefore remains **IMPLEMENTED — EVIDENCE OPEN** with
  CI VERIFIED as its named remaining evidence; G1 is not complete.
- Production OCR remains fail-closed under DEC-074 until an accepted shared/durable
  cost-guard implementation exists; manual/no-plate remains available.
- Next application-code slice: **MOB-029 — Production task queue and foreground
  attention**. **MOB-015A — Production Shift start and active-Shift presentation**
  remains separately required with MOB-029 before G1 can close.
- The older product checkpoint below retains its own verification date and
  historical database count; it is not the current Native baseline (31 migrations).

## Last Verified

- Date: `2026-09-02`
- Repository: `veletpro0-lgtm/valet-platform`
- VAL-008H base: `bf4e7965770ec352be79776ae165fda7cb5637eb`
- Completed product phases: **Phases 1–5 COMPLETE**
- Phase 6 provider-neutral Core A–H: **COMPLETE / LOCALLY VERIFIED**
- Current checkpoint: **PHASE 6 CORE = PROVIDER_READY**
- Real digital payment provider: **NOT YET ACTIVATED**
- Digital Payments production/MVP completion: **NOT CLAIMED**
- Database baseline: exactly **28 forward-only migrations**
- Latest accepted migration: `20260816002800_phase6_payment_collection_operation`
- Prisma schema: unchanged by VAL-008H
- Next deferred payment task: **VAL-008I**, only after an explicit provider-selection gate

## Current Product Checkpoint

The backend has completed the Foundation, Core Check-in, Operations, Retrieval,
Maps/task-scoped tracking, and provider-neutral Phase 6 financial core.

Phase 6 Core now composes and locally proves:

- typed Company-default -> Location-override financial policy;
- one canonical Payment projection per ValetSession;
- CUSTOMER and VENUE service responsibility;
- NONE, FULL, and PARTIAL Validation history;
- guarded pre-collection corrections and tip freeze;
- append-oriented cash receipts/corrections;
- immutable Shift Cash Expected / Cash Reported reconciliation snapshots;
- provider-neutral outbound collection identity and dispatch fencing;
- authenticated normalized provider-event reconciliation;
- cash and provider-neutral digital Refund core;
- exact financial release guarding at the existing complete-handoff command;
- Guest/staff-safe financial projections;
- tenant/Location authorization, idempotency, concurrency, audit atomicity,
  runtime-role least privilege, and sensitive-data boundaries.

The successful checkpoint is exactly:

```text
PHASE 6 CORE = PROVIDER_READY
REAL DIGITAL PROVIDER = NOT YET ACTIVATED
```

This means VAYLET's financial core is ready for a selected provider adapter. It
does not mean a real card, wallet, 3DS, callback, settlement, or digital-refund
network flow is active in production.

## Phase 6 Sequencing

Completed provider-neutral core:

```text
VAL-008A  Effective Financial Policy + Payment Core
VAL-008B  Validation + Tips + Guarded Pre-collection Corrections
VAL-008C  Cash Collection + Cash Reconciliation MVP Boundary
VAL-008D  Provider-Neutral Digital Boundary + Outbound Operation Identity
VAL-008E  Provider Event / Normalization / Reconciliation Foundation
VAL-008F  Refund Core
VAL-008G  Financial Release Guard + Safe Financial Projections
VAL-008H  Phase 6 Core API / Integration / E2E / Security Gate
```

Deferred real-provider completion:

```text
VAL-008I  Selected Provider Activation / Hosted or Tokenized Checkout
VAL-008J  Real Provider Callbacks, Settlement/Failure & Digital Refund Wiring
VAL-008K  Real Digital Provider E2E / Security / Production Gate
```

VAL-008I must not begin until the Project Owner explicitly approves the
provider-selection gate. No provider is selected or activated by Core A–H.

Only successful VAL-008K may establish:

```text
PHASE 6 DIGITAL PAYMENTS = MVP / PRODUCTION COMPLETE
```

## Database / Migration Baseline

Exactly **28 forward-only migrations** are present. Migrations 1–28 are
immutable.

The latest accepted migration is:

```text
28  20260816002800_phase6_payment_collection_operation
```

VAL-008H adds no schema, migration, runtime privilege, dependency, lockfile, or
provider-specific persistence change.

## Current Security Boundary

The provider-neutral core preserves:

- server-derived tenant, exact Location, actor, money, currency, provider, and
  historical correlation authority;
- non-disclosing cross-tenant and wrong-Location failures;
- append-oriented financial history and same-transaction AuditEvents;
- retry/concurrency protection for cash, outbound collection, provider events,
  Refunds, and final release;
- an unconfigured fail-closed production provider registry;
- no raw PAN/CVV, provider secrets, Authorization material, or raw callback
  payload in financial persistence, AuditEvent metadata, safe errors, or client
  projections;
- least-privilege runtime database access with no broad financial mutation,
  delete, truncate, ownership, DDL, or SECURITY DEFINER bypass added by VAL-008H.

Real-provider signature algorithms, merchant/acquirer onboarding, credentials,
hosted/tokenized checkout, callback routes, provider status mapping, settlement,
wallet/3DS behavior, and outbound digital Refund execution remain VAL-008I/J/K.

## Still Deferred / Not Claimed

The project does **not** currently claim:

- a selected or activated production digital provider;
- real hosted/tokenized checkout or 3DS/wallet payment;
- real provider callback or status-reconciliation wiring;
- real digital Refund network execution;
- digital Payments MVP/production completion;
- full Dashboard implementation;
- Reliability/offline synchronization framework;
- Venue Client persistence;
- POS/PMS integration;
- payment orchestration across multiple live gateways;
- accounting ledger, venue settlement, or tip payroll;
- chargeback management platform;
- V2/Enterprise payment intelligence.

## Exact Next Step

The next payment task is **VAL-008I**, but only after explicit provider
selection and approval. Dashboard remains the next normal Blueprint product
phase after Payments; however, VAL-008I/J/K remain mandatory before Phase 6
Digital Payments can be called MVP/production complete.
