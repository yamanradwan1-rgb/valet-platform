# Issue #310 — Meta Sandbox sender readiness and live-test runbook

Status: **implementation candidate; test activation blocked on external evidence**.
This document describes *test-only* operation. It does not authorize production
WhatsApp sending, a live test request, or a public API/Funnel deployment.

## Tested source contract

- Worker bootstrap: `apps/api/src/outbound-message-worker-run.ts`.
- Sandbox resolver: `apps/api/src/modules/notifications/worker/outbound-sandbox-sender.ts`.
- No production provider path exists in that assembly. The exact authorized
  WABA is `3491682417667249`, with phone-number ID `1426684017189271`.
- SQL functions `outbound_dispatch_permit` and `outbound_confirm_dispatch`
  own current tenant, Location, binding, consent, lifecycle, revision,
  delivery, budget and durable send gates. The sender rechecks SQL confirmation
  at provider resolution and restricts every attempt to one explicit test
  Organization and Location.
- The only allowed Meta template is `guest_access`, with one BODY text URL
  parameter and Meta locale `ar` or `en_US` (policy locale `ar` or `en`).
- API custody and Guest credential semantics do not change. No plaintext token
  is stored by this worker. A crash after the committed dispatch marker cannot
  make an uncertain provider call retryable.

## Observed local pre-activation inventory (2026-10-24)

- Main at discovery: `e8c747f50cead1360ed151582c767a9bec1d1014`.
- Tailscale is online. Existing hostname 443 proxies API to 3001; Customer
  Dev is HTTPS 8443 -> 3002, QA Customer HTTPS 10004 -> 3102, QA API HTTPS
  10003 -> 3101, and QA Dashboard HTTPS 10005 -> 3113. Preserve all mappings.
- Application backends were not listening; tested existing HTTPS routes gave
  HTTP 502. Do not claim Customer HTTPS acceptance until backends recover.
- No distinct portless Customer origin is provisioned. An additive Tailscale
  Service hostname and virtual IP on HTTPS 443 is a candidate, **after** tailnet
  administrator definition/host approval/access-policy grant. The QA Customer
  target would be 127.0.0.1:3102; do not replace existing host 443.
- The Windows loopback PostgreSQL database has six Organizations and nine
  Locations, and is **not proven to be the designated sandbox database**.
  It has 93 completed migrations (WhatsApp 086–093); the current repository
  contains 102. Existing provider bindings, messaging policies and consent
  records are empty. Both test and production issue/send controls are OFF/OFF.
- The `vaylet-test-postgres` Docker container is stopped/unpublished, while a
  running Photo QA PostgreSQL container belongs to a separate test scope.
  No Organization UUID, Location UUID or binding ID has been authorized for
  Issue #310. Do not mutate or migrate either database without scope attestation.
- No approved operator command currently exists for independently verified
  Meta binding activation or consent evidence collection. Existing SQL
  `outbound_permission_change` is a privileged primitive, not a substitute
  for an authenticated, auditable consent ceremony.

## Required environment — never commit populated secret values

| Process | Variable | Required when enabled |
|---|---|---|
| API and sender | `NODE_ENV` | `development` or `test`; production is denied by sandbox |
| API and sender | `OUTBOUND_MESSAGING_MODE` | `test` |
| API | `GUEST_ACCESS_AUTO_ISSUE_ENABLED` | Keep `false` until live gate |
| Sender | `OUTBOUND_MESSAGING_SEND_ENABLED` | Keep `false` until live gate |
| Sender | `OUTBOUND_META_SANDBOX_ACTIVATION_ENABLED` | Keep `false` until live gate |
| Sender | `OUTBOUND_MESSAGING_WORKER_DATABASE_URL` | Dedicated LOGIN principal and scoped test DB |
| Sender | `OUTBOUND_META_TEST_ORGANIZATION_ID`, `OUTBOUND_META_TEST_LOCATION_ID` | Actual, independently attested sandbox UUIDs |
| Sender | `OUTBOUND_META_TEST_DATABASE_NAME` | Attested sandbox DB name, matching the sender database URL |
| API | `DATABASE_URL` | Separate restricted API principal and same intended test DB |
| Migration job only | `MIGRATION_DATABASE_URL` | Dedicated migration principal; never inject into sender |
| Webhook (when enabled) | `OUTBOUND_MESSAGING_WEBHOOK_DATABASE_URL` | Dedicated webhook principal |
| API and sender | `GUEST_ACCESS_TRANSPORT_KEY_VERSION` | Same explicitly versioned key pair |
| API only | `GUEST_ACCESS_TRANSPORT_PUBLIC_KEY_PEM` | RSA >=3072-bit public key |
| Sender only | `GUEST_ACCESS_TRANSPORT_PRIVATE_KEY_PEM` | Corresponding private key |
| API and sender | `OUTBOUND_RECIPIENT_HMAC_KEY_BASE64` | Matching independent >=32-byte key |
| API and sender | `OUTBOUND_RECIPIENT_HMAC_KEY_VERSION` | Current `vN` revision |
| API and sender | `OUTBOUND_APPROVED_META_TEMPLATES_JSON` | Exact authorized Org UUID, test WABA, actual catalog version, `ar` and `en` |
| Sender | `META_WHATSAPP_GRAPH_VERSION` | `v26.0` |
| Sender | `META_WHATSAPP_TEST_CONFIG_ALIAS` | Exact independently verified test-binding alias |
| Sender | `META_WHATSAPP_TEST_ACCESS_TOKEN` | Sender-only secure injection |
| Sender | `META_WHATSAPP_TEST_TOKEN_EXPIRES_AT` | Actual UTC token expiry, full ISO timestamp |
| Sender | `META_WHATSAPP_TEST_TOKEN_REVOKED` | Explicit `false` only while confirmed current |
| Sender | `OUTBOUND_META_TEST_RECIPIENT_E164` | One explicitly consented Meta test number |
| Sender | `GUEST_ACCESS_MESSAGE_ORIGIN` | Clean HTTPS Customer App origin with no port |
| Customer deployment | `API_ORIGIN` | Actual internal API server origin for same-origin proxy |
| Guest API | `GUEST_AUTH_ALLOWED_ORIGINS` | Include the exact new Customer origin |
| Employee/Native links | `NEXT_PUBLIC_CUSTOMER_APP_ORIGIN`, `EXPO_PUBLIC_CUSTOMER_APP_ORIGIN` | Same tested Customer origin at the applicable build/release |
| Webhook when used | `META_WHATSAPP_APP_SECRET`, `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Separate secret-only webhook process; public callback separately approved |

The sender checks the approved registry against the exact persisted tenant,
WABA, catalog and policy language. An absent/mismatched token, expiry, origin,
recipient, alias, template approval or sandbox switch fails closed.
Inject the sender's private key and Meta credential through a dedicated
sender-process secret environment, **never through the shared root API
`.env`**. Give the API only the RSA public key. Do not pass sender secrets to
the Customer, Dashboard, Employee or Native build process.

## Provisioning and preflight (all controls remain OFF)

1. Identify and attest the exact Issue #310 isolated database, Organization
   and Location. Confirm that it contains no production records; do not
   substitute UUIDs from the shared Windows PostgreSQL instance or Photo QA.
2. Apply the repository's unapplied forward migrations to **that isolated DB
   only** using the approved migration workflow. Confirm complete migration
   history, then create separate API, sender, webhook and migration LOGIN roles
   with no unsafe memberships/ownership.
3. Use `node packages/database/scripts/provision-outbound-principals.mjs`
   only once distinct principal URLs are securely set and the test DB is
   attested. It enforces narrow SQL EXECUTE and zero broad table privileges.
   Verify the sender startup privilege preflight passes.
4. Complete authenticated, independently evidenced *test WABA/phone-number
   ownership verification*. The current repo lacks its approved operator
   ceremony/CLI, so provision and enable the binding only after that path is
   reviewed. Never set `provider_verified_at` merely to satisfy a guard.
5. Resolve the actual approved catalog version, register both Meta languages
   for the exact Organization/WABA, and establish the company default plus
   chosen Location override via Company Admin with sensitive MFA/audit.
6. Record the specific phone's valid, unexpired consent GRANT and immutable
   history through an approved consent-management workflow; Meta test-list
   verification alone is insufficient. Confirm the WITHDRAW path.
7. Keep `outbound_messaging_control.issue_enabled=false` and
   `send_enabled=false` for both environments. Restore QA app backends;
   provision and test a separate portless Customer HTTPS hostname while
   retaining the API's current 443 mapping and all existing Serve URLs.
8. Confirm exact `/#guestToken=` fragment handling and API bootstrap on the
   authorized test phone in the tailnet. Scrub any raw URL from evidence.

## LIVE SANDBOX TEST — requires a separate final owner go-ahead

1. Generate a temporary sandbox credential in Meta's test application and
   install it directly into the **sender-only** protected environment. Set its
   real expiry and the explicit non-revoked marker; never paste it into chat,
   Git, CI artifacts, screenshots or normal logs.
2. Take a sanitized snapshot of the test tenant/Location, verified binding,
   current consent, template approval, delivery budgets, role preflight and
   both durable control rows. Recheck Customer HTTPS/fragment on the phone.
3. Authorize the isolated test scope, set the *test* durable issue/send
   controls through the reviewed operator path, and explicitly enable the API
   issuance and sender sandbox flags. Production flags/controls stay OFF.
4. Complete exactly one eligible Native Check-In against the authorized test
   Organization/Location and consented recipient. Confirm one durable intent.
5. Observe a single approved `guest_access` WhatsApp template on that phone.
   Open its one-time Guest fragment URL; confirm it resolves the same visit,
   exchanges into the accepted Browser Session, then scrubs the fragment.
6. Record only hashed/redacted attempt IDs, safe state transitions, sanitized
   Meta response classification and optional signed webhook evidence. A Meta
   HTTP mock PASS is not delivery proof. Do not record raw tokens, phones,
   ciphertext, OAuth secrets, full URLs or full provider bodies.
7. **Immediately return test issue/send controls and both environment flags to
   OFF**, stop the sender, revoke the temporary Meta token and independently
   verify no later dispatch occurred. Retain only sanitized proof.

Live delivery, webhook/receipt, physical-device Guest validation, backup/key
restore policy and full exact-commit CI acceptance remain separate gates.
