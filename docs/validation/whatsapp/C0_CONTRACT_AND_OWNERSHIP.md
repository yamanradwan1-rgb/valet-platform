# WhatsApp Guest Access C0 — frozen contracts and ownership

Status: C0 frozen for Stage C disabled/mocked implementation, 2026-10-15.
Base: `1ecdbeff1c4b7b011a1af00c843f7930e515cea4`.
Authority: committed ASTRA plan §1–53; Owner WA-D01–D12; DEC-105 limited encrypted-envelope amendment; DEC-064, DEC-069, DEC-087 narrow WA-D09 amendment and DEC-025.
Scope: no merge, real Meta calls, live migrations, deployment or forbidden UI change.

## Frozen invariants

- Only a successfully committed **new** authorized Intake may create a first Guest generation and one outbound intent; no replay, recovery, manual rotate, SMS fallback or browser action creates it.
- Session Guest verifier/Browser Session remain hash-only, fresh CSPRNG 32 bytes, generation 1 for fresh issuance, 24-hour initial bootstrap. Only at-most-30-minute DEC-105 RSA-OAEP-SHA256 public-key sealed transport material is recoverable by isolated sender private key. Canonical associated data is all fields of `OutboundEnvelopeAAD`. Reject any scope/generation/recipient/time/key mismatch. Recipient digest is versioned keyed HMAC, not plain hash.
- All records have authoritative Organization plus exact Location/session/customer where applicable; scoped foreign keys and controlled transitions. Only W1 authors migrations and privileges. Runtime/migration/sender/webhook roles are distinct; no sender custody/Guest updates.
- Lock order: existing Location/operation/history locks before session, customer, policy+permission, delivery, provider budget then recipient budget. Validate ordering with real PG; no network inside Intake or eligibility transactions. DB wall time after locks defines expiration. One logical intent per Organization/session/purpose; callback tenant inferred from immutable stored attempt+binding.
- Delivery: PENDING -> LEASED -> DISPATCHING -> ACCEPTED / UNKNOWN / RETRY_WAIT / PERMANENT_FAILURE. Non-dispatch states may become SUPPRESSED/EXPIRED; no requeue after DISPATCHING crash/UNKNOWN. Dispatch permit consumes one of four ordinals, never reused. 30-minute absolute expiry, 30s lease, 10s provider timeout, 10 claim batch, 2 concurrent per process, 100 cleanup batch. Only explicit documented provider definite nonacceptance may retry. UNKNOWN purges envelope; no automatic resend.
- Webhook: verify exact original bytes with `X-Hub-Signature-256` HMAC before parse; bound 256KiB payload; correlate only immutable account+attempt/message ID/recipient; monotone independent SENT/DELIVERED/READ/FAILED facts. Never mutate physical custody or issue Guest access.
- Company default -> Location override typed language `ar|en`, approved template/version/binding; every company requires its own sending phone Number ID. Connection is truthful and provider-secret-free. Global durable kill switch, per-company policy, verifiable recipient evidence and send-time withdrawal fence are all required. Missing consent means OFF; staff entry alone never grants opt-in.
- No raw token, fragment URL, plaintext phone, provider response body, Meta key, envelope ciphertext or unredacted digest in audit/log/telemetry/UI. Only finite reason codes. Native Intake request/response byte shape unchanged.
- Deployment: `GUEST_ACCESS_AUTO_ISSUE_ENABLED=false`, `OUTBOUND_MESSAGING_SEND_ENABLED=false`, durable issue/send control default OFF. Real activation requires separate opt-in/provider/template/fragment/key+backup/retention/physical/live test evidence and explicit authorization.

## Interface authority

Prime owns immutable TypeScript interfaces under `apps/api/src/modules/notifications/contracts/`: `outbound-provider.ts`, `outbound-intent.ts`, `outbound-lease.ts`, `outbound-events.ts`, `outbound-policy.ts`, `outbound-envelope.ts`.
Workers must submit a CONTRACT_CHANGE request instead of modifying these interfaces.
W1 owns a single forward-only schema, composite tenant integrity and restrictive SQL. W2 calls transaction-local issuance after the new session insert. W3 implements one Meta call per worker request, no transport retries/redirects. W4 persists permit before I/O and suppresses all uncertain replays. W5 authenticates and deduplicates callbacks. W6 owns narrow Dashboard settings only. W7 owns independent tests and the UI guard.

## Exact ownership ledger

Every worker begins on the C0 SHA and uses a distinct `tmp/wa-wN` worktree/branch `feat/wa-wN-*`. Never edit another checkout. Exclusive paths:

| Worker | Allowed edits | Forbidden scope / review | Required proof |
|---|---|---|---|
| W1 | `packages/database/prisma/schema.prisma`; NEW `packages/database/prisma/migrations/*outbound*/migration.sql`; `packages/database/scripts/outbound-*.mjs`, `provision-outbound-*.mjs`; `runtime-table-privileges.mjs`, `runtime-feature-privilege-verification.mjs`, `verify-runtime-table-privileges.mjs`; `packages/database/src/outbound-*.test.ts`; `docs/03_DATABASE_SCHEMA.md`; `docs/validation/whatsapp/W1-*.md` | No old migrations, app/worker/provider, UI. Prime reviews SQL/ACL/FK | Real disposable PG, role and migration proof |
| W2 | `apps/api/src/modules/valet-sessions/intake-session-command.ts`, `intake-session-persistence.ts`, `intake-session-types.ts`, `guest-access-command.ts`, `guest-access-token.ts`; NEW `initial-guest-*.ts`; NEW `apps/api/src/modules/notifications/issuance/*.ts`; `apps/api/test/whatsapp-intake-*.test.ts`, `whatsapp-credential-*.test.ts`, `whatsapp-issuance-fixture*.ts`; `docs/validation/whatsapp/W2-*.md` | No schema, Main/Intake service bootstrap or UI. Prime reviews authority/token and atomic rollback | Existing replay/saved/no-phone + transaction tests |
| W3 | NEW `apps/api/src/modules/notifications/providers/*.ts`, `config/*.ts`; `apps/api/test/whatsapp-provider-*.test.ts`, `whatsapp-provider-fixture*.ts`; `docs/validation/whatsapp/W3-*.md` | No worker/webhook/schema; Prime reviews HTTP security | AR/EN mocks, UNKNOWN, external spec evidence |
| W4 | NEW `apps/api/src/modules/notifications/worker/*.ts`, `apps/api/src/outbound-message-worker.ts`; `apps/api/test/whatsapp-worker-*.test.ts`, `whatsapp-worker-fixture*.ts`; `docs/validation/whatsapp/W4-*.md` | No shared bootstrap, provider or W1 schema; Prime reviews lease/fencing | Real PG, 2 workers/process kill, retry caps |
| W5 | NEW `apps/api/src/modules/notifications/webhooks/*.ts`; `apps/api/test/whatsapp-webhook-*.test.ts`, `whatsapp-webhook-fixture*.ts`; `docs/validation/whatsapp/W5-*.md` | No main.ts, provider or W1 schema; Prime reviews raw-byte tenant correlation | Signature negative, duplicate/out-of-order tests |
| W6 | NEW `packages/employee-client/src/whatsapp-compat-*.test.ts`, `apps/valet-native/test/whatsapp-compat-*.test.ts`, `whatsapp-compat-fixture*.ts`; exact `apps/dashboard/src/features/administration/settings/settings-page.tsx`; NEW `apps/dashboard/src/features/administration/settings/whatsapp-*.tsx`, `whatsapp-*.ts`, `whatsapp-*.module.css`; NEW `apps/dashboard/src/features/administration/settings/whatsapp-*.test.tsx`; `docs/validation/whatsapp/W6-*.md` | No other Dashboard route/page, shared UI, translations, Native production, Employee/Customer UI. W7 reviews visual freeze | Existing parity + Company Admin isolation, settings functionality |
| W7 | NEW `apps/api/test/whatsapp-adversarial-*.test.ts`, `whatsapp-e2e-*.test.ts`, `apps/api/test/fixtures/whatsapp-qa-*.ts`, `scripts/whatsapp-ui-freeze-guard.mjs`, `scripts/whatsapp-ui-freeze-guard.test.mjs`; `docs/validation/whatsapp/W7-*.md` | No W1–6 source/Prime ownership; Prime reviews independent verdict | F01–F45, frozen manifest exact-path exception, GO/FIX |

## Frozen UI exception

Manifest `docs/plans/AUTOMATIC_WHATSAPP_GUEST_ACCESS_UI_FREEZE_MANIFEST.tsv` remains unchanged. The **only** existing protected production UI path allowed to differ is `apps/dashboard/src/features/administration/settings/settings-page.tsx` for displaying the company-admin WhatsApp settings section. New `whatsapp-*` sibling components/styles/API-client/tests are bounded within the same settings folder. No route, integrations page, shared UI, baseline snapshot, image or i18n file may change. W7 guard reads this separately published exact list; all other protected paths remain frozen.

## Engineering gates and known blockers

W1 migration head 085; W1 reserves the next free forward-only timestamp. Work against synthetic, task-owned DB only. Consent evidence cannot be inferred from employee input or historical Customer phone. Meta template/Graph version and fragment compatibility require direct official evidence. W6 connection management must reflect actual authoritative status; no fake `connected` or browser-exposed key. A missing provider onboarding ceremony is reported as a gated integration. The full mandatory lint/typecheck/architecture/non-Postgres/Postgres/build gates and W7 exact-SHA verdict are required for CODE DELIVERY GO. Physical Native, recipient-device, and production gates remain separate.

## Addendum — browser worker startup failure and narrow ownership recovery

Three assigned worker sessions (W5, W6 and W7) failed before receiving a composer; the worker runtime reports `failed` and `revivable=false`. They produced no source changes or independent review. Prime temporarily performed their approved work in the **existing** `tmp/wa-w5`, `tmp/wa-w6` and `tmp/wa-w7` isolated worktrees, retaining the same task branches, exclusive path restrictions and task identifiers. These are explicitly Prime-authored patches, not worker-completed reports. W7's acceptance remains **BLOCKED** until an independent reviewer validates the integrated SHA.

Prime's already-owned `notifications.module.ts` is extended with new, dedicated `apps/api/src/modules/notifications/whatsapp-settings-{controller,service,validation}.ts` to implement typed authorized Dashboard settings. Those exact three additional paths are Prime-exclusive. The existing protected Dashboard change remains the sole specified `settings-page.tsx` file plus new sibling WhatsApp components. No other UI exception is authorized.
