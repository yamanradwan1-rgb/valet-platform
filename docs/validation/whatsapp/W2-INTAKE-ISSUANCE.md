# Stage C / W2 — Intake and initial Guest credential

Status: W2 isolated code delivery; integrated PostgreSQL validation requires G1 W1 migration + runtime grants. No production activation or real outbound message was attempted.

## Transaction contract

- Existing `createIntakeSessionCommandExecutor()` retains `SERIALIZABLE`, three 40001 attempts, tenant/location authorization, request fingerprint, and exact-operation replay. Hook executes only after insertion of a new session, before the caller's COMMIT. The replay path returns before the hook.
- The first token uses the existing validated 32 CSPRNG bytes / 43-character base64url token / `sha256:v1:` verifier; generation `0 -> 1`, 24-hour bootstrap clock measured with PostgreSQL `clock_timestamp()` after recipient locks. Guest version/physical custody transition is unchanged. Manual staff issuance/revocation remains available and invalidates the queued generation via the session gate.
- No phone or no verified current opt-in grants zero issuance and retains the disabled Intake placeholder. Returning Customer authority comes from the locked same-Organization row. The typed Organization policy and Location override, enabled provider binding, current append-only GRANT revision, expiry, issuer env fence, and durable `outbound_messaging_control.issue_enabled` must all pass. No employee-entered phone is treated as a grant.
- Outbox inserts one `INITIAL_GUEST_ACCESS` intent, PENDING delivery and RSA-3072 OAEP/SHA256 encrypted short-lived envelope. Canonical OAEP label uses ordered `OutboundEnvelopeAAD` with tenant/location/session/customer/intent/generation/HMAC recipient/expiry. HMAC digest is versioned `hmac:v1:<43 base64url>`; no plaintext phone, raw bearer, link, provider data, or ciphertext enters response or audit. Issuer sees public key only.
- Intent expires 30 minutes after issuance; Guest bootstrap expires 24 hours after issuance. A failed UPDATE, outbox insert or audit rejects and rolls back the caller's whole Intake transaction. No nested transaction or network/KMS operation is introduced.

## Local evidence

- `pnpm install --frozen-lockfile --offline`: PASS, lockfile unchanged.
- `pnpm --filter @valet/api exec vitest run --config vitest.config.mjs --project api-non-postgres test/whatsapp-credential-crypto.test.ts test/whatsapp-intake-issuance.test.ts test/whatsapp-intake-eligibility.test.ts`: **PASS 17/17, 3 files**. Includes OAEP label/ciphertext tamper, 2048-bit rejection, HMAC validation, disabled configuration, verified Grant/withdrawal/no phone/override/binding/kill switch gates, expiration after locks and outbox-failure propagation.
- `pnpm --filter @valet/api exec eslint src/modules/valet-sessions/guest-access-command.ts src/modules/valet-sessions/guest-access-token.ts src/modules/valet-sessions/intake-session-command.ts src/modules/valet-sessions/intake-session-types.ts src/modules/valet-sessions/initial-guest-issuance.ts src/modules/notifications/issuance test/whatsapp-*.ts --max-warnings=0`: PASS.
- `pnpm --filter @valet/api typecheck` and `pnpm --filter @valet/api build`: see command output in worker handoff for final verdict.

## Integration gate

The W2 branch deliberately excludes W1-owned migration 086. `test/whatsapp-intake-postgres.integration.test.ts` supplies new/saved/no-phone, exact replay, revoke, concurrent retries, and forced atomic rollback checks against independent migrated synthetic PostgreSQL. It is guarded by `WHATSAPP_W1_MIGRATED=1`; on the integrated candidate run the API PostgreSQL test project with that variable after W1 migration/ACL provisioning. A mocked issuer suite is not a substitute for proof of transaction isolation, real FK/trigger behavior, role grants, and concurrent PG barriers. Native physical, live provider, backup/key-custody and production activation gates remain unrun.

## Integration contract

`createIntakeSessionCommandExecutor(pool)` auto-installs the optional issuer only when `GUEST_ACCESS_AUTO_ISSUE_ENABLED=true` and `OUTBOUND_MESSAGING_MODE=test|production` match deployment mode with valid RSA public-key and recipient HMAC config. Default OFF. Prime owns `.env.example` and bootstrap. Required configuration names: `GUEST_ACCESS_TRANSPORT_PUBLIC_KEY_PEM`, `GUEST_ACCESS_TRANSPORT_KEY_VERSION`, `OUTBOUND_RECIPIENT_HMAC_KEY_BASE64`, `OUTBOUND_RECIPIENT_HMAC_KEY_VERSION`. Sender's isolated private-key opener must use the canonical OAEP label bytes and validate immutable scope/generation/expiry independently. Do not send until actual verified opt-in and all other Stage C release fences are met.
