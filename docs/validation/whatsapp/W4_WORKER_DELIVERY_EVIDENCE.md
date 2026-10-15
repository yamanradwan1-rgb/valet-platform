# WA-W4 — Durable WhatsApp Sender Worker

## Ownership and execution boundary

- Branch: `feat/wa-w4-worker`; isolated worktree `/valet-platform/tmp/wa-w4`.
- Starting C0: `a087ad38cb249840389e5aefaefbecb47333373f`.
- Owned code: `apps/api/src/modules/notifications/worker/*.ts`, `apps/api/src/outbound-message-worker.ts`; focused `apps/api/test/whatsapp-worker-*` synthetic tests.
- Explicit sending gate: `OUTBOUND_MESSAGING_SEND_ENABLED=true` and matching test/production mode, W1 durable PostgreSQL kill switch, current tenant/location/recipient/permission/generation/account checks in restricted `outbound_dispatch_permit`, followed by `outbound_confirm_dispatch` just before transport. Default local gate is OFF; no real messages were sent.
- The sender's injected W3 provider may call Meta only after a committed permit. A timeout, thrown provider error, malformed response or process death is unknown to transport and must never be retried automatically. No Guest authority/custody mutation is part of worker code.

## SQL interface expected from W1

Sender principal requires SECURITY DEFINER functions `outbound_claim_due(integer)`, `outbound_lease_recipient(uuid,uuid)`, `outbound_dispatch_permit(uuid,uuid,text)`, `outbound_confirm_dispatch(uuid,uuid,uuid,text,text)`, `outbound_release_lease(uuid,uuid,timestamptz)`, `outbound_finish_attempt(uuid,uuid,uuid,text,text,text)`, `outbound_cleanup_stale(integer)` and `outbound_purge_expired_envelopes(integer)`. W4's adapter calls these via bound parameters; no direct sender table updates. `outbound_dispatch_permit` must return the persisted attempt UUID/callback handle and an independently verified scope, envelope and server-clock lifetime. Config alias, tenant-specific approved template and Meta credentials must be resolved by a sender-only W3 account resolver and re-fenced by the provider.

When a distributed provider or recipient rate budget is unavailable, W4 releases only its `LEASED` claim for a conservative 30-second bounded backoff using DB wall time. An attempt is not consumed by that release. When the worker has already committed `DISPATCHING`, it can call the transport once, or leave it unchanged for W1 stale recovery to terminal `UNKNOWN`. Cleanup deletes encrypted envelope material, retaining nonsecret attempt/delivery history.

## Evidence collected locally

- Dependency setup: `pnpm install --frozen-lockfile --prefer-offline` succeeded.
- TypeScript: `pnpm --filter @valet/api typecheck` succeeded.
- Static analysis: `pnpm exec eslint apps/api/src/outbound-message-worker.ts apps/api/src/modules/notifications/worker apps/api/test/whatsapp-worker-*.ts` succeeded.
- Focused tests: `pnpm exec vitest run --config vitest.config.mjs --project api-non-postgres test/whatsapp-worker-permit.test.ts test/whatsapp-worker-bounds.test.ts test/whatsapp-worker-lifecycle.test.ts test/whatsapp-worker-postgres-repository.test.ts test/whatsapp-worker-encryption.test.ts test/whatsapp-worker-preflight.test.ts`; **38/38 passed in six synthetic test files**, rerun at 2026-10-15 23:58 +03.
- Fakes exercise late consent/recipient rejection, no socket after failed confirm, provider timeout/unknown, synthetic crash after dispatch marker, two-concurrency bound, SQL claim/digest/permit/cleanup calls, private-key OAEP label compatibility, principal privilege refusal and SIGTERM drain.
- Source-file structural check: each worker production/test TypeScript file is fewer than 300 lines.

## Follow-up: callback-first regression / migration 089 compatibility

- `apps/api/test/whatsapp-worker-callback-first-pg.test.ts` creates and drops an independent disposable local PostgreSQL database, applies every available migration and seeds a synthetic approved binding, consent, guest intent and durable DISPATCHING permit. It stores verified DELIVERED callback evidence **before** passing an HTTP `DEFINITIVE_FAILURE` result and requires zero second claims, no RETRY_WAIT, and ciphertext deletion.
- Run the focused PG test from `apps/api` against W1's still-isolated worktree by setting `W4_SQL_SOURCE_ROOT` to `/valet-platform/tmp/wa-w1` as its resolved native path and executing `pnpm exec vitest run --config vitest.config.mjs --project api-postgres-standard test/whatsapp-worker-callback-first-pg.test.ts`. **Full W1 migrations including 089: PASS 1/1 on disposable local PG17.**
- To demonstrate the pre-fix behavior, repeat with `W4_SQL_OMIT_FIX_089=true`. **Only 086–088: FAIL** with actual PostgreSQL `OUTBOUND_ATTEMPT_FENCE` in `outbound_finish_attempt` after the signed callback. Both executions cleaned their owned test DBs; no network requests or real recipient data.
- W4's SQL adapter now calls the W1 089 **7-argument** `outbound_finish_attempt` to preserve a provider-supplied Retry-After. Worker recovery calls `outbound_recover_expired` to include both abandoned-dispatch UNKNOWN recovery and consent/session suppression instead of merely `outbound_cleanup_stale`. Sender role preflight requires both corresponding function signatures.
- This one real PG regression is **not** two-replica or process SIGKILL proof. Those full W4 acceptance gates remain pending as described below.

## Remaining integrated gates

**BLOCKED — actual PostgreSQL and process-kill acceptance:** W1's migration and role provisioning are under development in a separate worktree. Docker Desktop Linux Engine was unavailable to this W4 Windows worker (`//./pipe/dockerDesktopLinuxEngine` missing). The mock SQL query tests are **not real PostgreSQL** or real two-replica proof. On a disposable W1-provisioned PostgreSQL with real sender principal, execute a cold and upgrade migration, role and function ACL checks, two-replica claim/recipient budgets, paused post-permit stop, actual SIGKILL before socket and after mock-provider acceptance, stale cleanup, callback-first and consent/generation/phone changes. Ensure zero duplicate HTTP requests for a recovered UNKNOWN. Prime/W7 must record those results on the integrated SHA; no production GO inferred from unit tests.

**BLOCKED — Prime runtime integration:** Prime must compose W1 pool/SQL and W3 approved Meta provider/template/credential resolver into `createOutboundWorkerPorts` and invoke `startOutboundMessageWorker`. Retain separate sender runtime and private key; do not load sender private key in HTTP API or Native. Verify configured `OUTBOUND_MESSAGING_WORKER_DATABASE_URL` differs from `DATABASE_URL`, migration and webhook identities. Sending must remain OFF until all external consent, Meta and release gates are approved.
