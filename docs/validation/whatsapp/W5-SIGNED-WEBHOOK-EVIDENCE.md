# WA-W5 — Meta WhatsApp signed callbacks

Scope: Stage C synthetic adapter, with no live webhook endpoints exposed until the Prime imports the module. Original worker-5 browser launch failed. Prime authored this W5-scoped code in the pre-created isolated W5 worktree.

- Raw-byte `X-Hub-Signature-256` HMAC-SHA256 and timing-safe constant-length digest comparison must pass before JSON parsing.
- Strict bounded Meta status parsing: object, WABA, sending Phone Number ID, message ID, recipient and approved status/time only. No untrusted tenant ID used.
- A separately configured, restricted webhook database principal is required; runtime, sender, migration and webhook credentials must differ. Authenticated callbacks map WABA/Phone ID to immutable persisted binding and link status to attempt only through privileged `outbound_record_provider_event`; unknown account or message cannot select tenant by phone.
- Store only normalized event facts and HMAC recipient digest, never original payload, token, URL or raw phone. PostgreSQL handles dedupe and monotone facts. A failed transaction receives 503, not a successful ACK.
- Dedicated GET verification token supports bounded numeric subscription challenge; GET is not POST authentication.
- Meta direct technical verification, real receiver callback, precise retry horizons and end-to-end PostgreSQL proof remain separate activation gates.

Tests: `pnpm --filter @valet/api exec vitest run --config vitest.config.mjs test/whatsapp-webhook-signature.test.ts test/whatsapp-webhook-persistence.test.ts`. Record fresh results on the integrated candidate; unit/mock outcomes do not claim real Meta acceptance.
