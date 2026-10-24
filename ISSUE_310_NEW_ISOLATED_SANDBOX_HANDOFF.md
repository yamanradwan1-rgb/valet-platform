# Issue #310 — New, isolated WhatsApp sandbox operator handoff

Date: 2026-10-24. Scope: `feat/issue-310-isolated-whatsapp-e2e`, based on
`fe546c277c6d80d4bdccd80cbea8ddfcd50fd712`.

**Release classification: IMPLEMENTED_BUT_CONFIG_BLOCKED.** The dedicated
Docker runtime, real employee Native Check-In, restricted PostgreSQL roles,
storage, and safe sender startup are operational. No real Meta send or
handset/Guest E2E delivery has occurred. The independent Meta authorization
ceremony and a distinct, portless HTTPS Customer hostname remain blocked.
Production sending and both test issue/send controls remain OFF.

## Deployment identity

| Property | Verified value |
| --- | --- |
| Host checkout | `D:\kndoom\valet-platform\tmp\issue-310-isolated-wa-e2e-worktree` |
| Compose project | `vaylet-wa310` |
| Compose definition | `deploy/issue310/compose.yaml` |
| Container prefix | `vaylet-wa310-` |
| PostgreSQL | `vaylet-wa310-postgres-1`, PostgreSQL **17.11** |
| Dedicated database | `vaylet_wa310`, 102/102 migrations applied |
| Storage | `vaylet-wa310-minio-1`, bucket `wa310-condition-private` |
| App services | `vaylet-wa310-api-1`, `vaylet-wa310-customer-1`, `vaylet-wa310-dashboard-1` |
| Worker | `vaylet-wa310-sender-1`, test-only, sending OFF |
| Networks | `vaylet-wa310_data` (internal), `vaylet-wa310_edge`, `vaylet-wa310_maintenance` |
| Named volumes | `vaylet-wa310_pgdata`, `vaylet-wa310_miniostore` |
| API | `http://127.0.0.1:33110` |
| Customer | `http://127.0.0.1:33112` |
| Dashboard | `http://127.0.0.1:33113` |
| PostgreSQL diagnostic port | `127.0.0.1:56310` |
| MinIO diagnostic port | `127.0.0.1:59310` |
| Dedicated Customer HTTPS | **NOT PROVISIONED** |

All published Docker ports are bound only to host loopback. The API, Customer,
and Dashboard share an internal loopback network namespace for the existing
same-origin Next.js API proxy. PostgreSQL and MinIO use the isolated data
network plus an Issue310-only maintenance bridge needed for loopback-published
migration/storage diagnostics; they do not join the API/sender edge bridge.
This deployment uses newly generated credentials, databases, objects,
network names, and persistent volumes. No old VAYLET Test database, MinIO,
Organization, Location, network, volume, container, or Tailscale Serve mapping
was reused or modified.

## Operational tenant

| Property | Result |
| --- | --- |
| Organization UUID | `5072955f-f323-448f-8d7d-bd0d3e6bd0b4` |
| Location UUID | `ac34adc7-1d76-42cb-af29-fef22feaa909` |
| Admin login identity | `admin@wa310.vaylet.invalid` (credentials private) |
| Employee login identity | `employee@wa310.vaylet.invalid` (credentials private) |
| Roles | `ORG_ADMIN`, `VALET_EMPLOYEE` with explicit Location access |
| Operational setup | Active Location, one zone, spot, key slot, employee shift |
| Synthetic customer | Created without WhatsApp consent |
| Native test ValetSession UUID | `cd721cec-e6a5-410c-a543-9a8e113803f2` |
| Native test state | `AWAITING_PARKING` after completed Check-In |
| Initial outbound intents | **0**, expected while consent/issuance OFF |
| Provider binding UUID | **NOT CREATED**; evidence not yet verified |
| Template catalog version | **NOT REGISTERED**; approval version requires evidence |
| Company/Location WhatsApp policy | **NOT ENABLED** |
| Explicit recipient consent GRANT | **ABSENT**, deliberately |
| Test durable issue/send controls | OFF / OFF |
| Production durable issue/send controls | OFF / OFF |

One real Native employee login, shift start, Check-In intake, condition
completion and Check-In completion passed against the new API and PostgreSQL.
This tests operational readiness, **not** WhatsApp issuance, Meta transport, or
real device Guest authentication. No provider verification timestamp, recipient
consent evidence, or external ownership assertion was invented.

## Credential custody and retrieval

The only secret-bearing runtime material is under the *ignored*, ACL-restricted
local folder:

`D:\kndoom\valet-platform\tmp\issue-310-isolated-wa-e2e-worktree\tmp\wa310-runtime\`

An authorized local Administrator can inspect the following files locally with
a trusted editor; do not send their contents in chat or copy them into tracked
documentation:

| Local filename | Secret scope |
| --- | --- |
| `operator-private.json` | Test admin and employee identities/passwords and UUIDs |
| `compose.env` | Unique bootstrap, migration, API, sender, webhook DB and MinIO credentials |
| `api.env` | API-only runtime configuration, recipient digest key and anti-abuse secret |
| `sender.env` | Restricted sender runtime configuration, no Meta token |
| `transport-public.pem` | API public key |
| `transport-private.pem` | Sender-only RSA-3072 private key |
| `native-smoke-evidence.json` | Local smoke stages/IDs, no access bearer |

Access is restricted with `scripts/issue310/harden-private-acl.ps1` to the
current Windows owner, local Administrators and SYSTEM. The script grants
explicit access before disabling inheritance. Regenerated secret material
must be hardened again before service startup. `tmp/wa310-runtime` is Git
ignored; never stage that directory. **No Meta token exists in this handoff.**

## Restricted PostgreSQL authorization

Four runtime/provisioning principal URLs are distinct:
`wa310_migrate`, `wa310_api`, `wa310_sender` and `wa310_webhook`.
The one-time fresh-cluster `wa310_bootstrap` superuser is never assigned to
an application container. Migration role is a DB/schema owner for controlled
migrations; API/sender/webhook are not superusers, CREATEROLE, CREATEDB,
BYPASSRLS, schema creators, or DB creators. The sender has scoped SQL function
EXECUTE and no direct SELECT on `outbound_message_intents`.
The protected photo lock function retains a NOLOGIN owner after one-time
provisioning. Sender startup ran its actual SQL privilege preflight.

`node scripts/issue310/run-private-task.mjs dbPosture` verifies the four
connection identities, host/port/database, least-privilege checks,
102 completed migrations, one tenant/Location, no binding/consent,
and both environments' OFF/OFF durable controls. This intentionally fails once
the authorized live Meta binding or GRANT is created; update that diagnostic's
readiness expectation through review before using it after authorization.

## Existing Meta sandbox policy

| Item | Pinned value |
| --- | --- |
| Sandbox WABA | `3491682417667249` |
| Sandbox Phone Number ID | `1426684017189271` |
| Graph API version | `v26.0` |
| Approved template name | `guest_access` |
| Internal language | `ar` or `en` |
| Outgoing Meta language | `ar` or `en_US` |
| Body parameters | Exactly one session-specific Customer HTTPS URL |

These identifiers are *configured policy*, not proof of present Meta ownership
or consent. The sender will reject production mode/assets. Its template,
recipient, tenant, Location, binding, credential alias, expiry, SQL dispatch
permit and reconfirmation checks are already implemented on the base commit.
The dedicated `deploy/issue310/compose.authorized-send.yaml` overlay exists
for later, authorized sender-only Meta token file mounting. It is deliberately
absent from the default Compose startup and changes no OFF switches.

### Local configuration inventory

| Process | Variables | State |
| --- | --- | --- |
| DB Compose | `WA310_BOOTSTRAP_PASSWORD`, `WA310_MIGRATION_PASSWORD`, `WA310_API_PASSWORD`, `WA310_SENDER_PASSWORD`, `WA310_WEBHOOK_PASSWORD` | Configured privately |
| MinIO Compose | `WA310_MINIO_USER`, `WA310_MINIO_PASSWORD` | Configured privately |
| API | `NODE_ENV`, `DATABASE_URL`, `PORT`, `ANTI_ABUSE_HMAC_SECRET_B64URL`, `GUEST_ACCESS_TRANSPORT_PUBLIC_KEY_PEM`, `GUEST_ACCESS_TRANSPORT_KEY_VERSION` | Configured; API readiness PASS |
| API/Sender | `OUTBOUND_RECIPIENT_HMAC_KEY_BASE64`, `OUTBOUND_RECIPIENT_HMAC_KEY_VERSION`, `OUTBOUND_MESSAGING_MODE`, `OUTBOUND_META_TEST_DATABASE_NAME` | Configured |
| Sender | `OUTBOUND_MESSAGING_WORKER_DATABASE_URL`, `GUEST_ACCESS_TRANSPORT_PRIVATE_KEY_PEM`, `META_WHATSAPP_GRAPH_VERSION` | Configured privately; sender runtime starts |
| API | `GUEST_ACCESS_AUTO_ISSUE_ENABLED` | OFF |
| Sender | `OUTBOUND_MESSAGING_SEND_ENABLED`, `OUTBOUND_META_SANDBOX_ACTIVATION_ENABLED`, `META_WHATSAPP_TEST_TOKEN_REVOKED` | OFF, OFF, TRUE |
| Sandbox sender | `OUTBOUND_META_TEST_ORGANIZATION_ID`, `OUTBOUND_META_TEST_LOCATION_ID`, `OUTBOUND_META_TEST_RECIPIENT_E164` | Intentionally missing pending verified recipient and scope |
| Sandbox sender | `META_WHATSAPP_TEST_CONFIG_ALIAS`, `META_WHATSAPP_TEST_ACCESS_TOKEN`, `META_WHATSAPP_TEST_TOKEN_EXPIRES_AT` | Intentionally missing |
| API/Sender | `OUTBOUND_APPROVED_META_TEMPLATES_JSON` | Intentionally missing pending actual verified catalog |
| Sender | `GUEST_ACCESS_MESSAGE_ORIGIN` | Missing clean private HTTPS origin |
| Guest API | `GUEST_AUTH_ALLOWED_ORIGINS` | Final Customer HTTPS origin not yet added |
| Customer/Dashboard | `API_ORIGIN` | Configured as same-namespace `http://127.0.0.1:3001` |
| Native links | `NEXT_PUBLIC_CUSTOMER_APP_ORIGIN`, `EXPO_PUBLIC_CUSTOMER_APP_ORIGIN` | Requires final dedicated HTTPS URL/rebuild |
| Webhook | `META_WHATSAPP_APP_SECRET`, `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `OUTBOUND_MESSAGING_WEBHOOK_DATABASE_URL` | Not activated; no public endpoint |

No production credentials or endpoint are configured in the sender.

## Tailscale and HTTPS blocker

Windows host `desktop-k4voran` was online in Tailscale during discovery.
The pre-existing Tailscale Serve hostname HTTPS 443 routes to an unrelated API,
and additional ports have their own unrelated services. They remain unchanged.
An additive attempt to serve this Customer App as
`svc:vaylet-wa310-customer` at local `127.0.0.1:33112` returned:

`service hosts must be tagged nodes`

No new Serve endpoint was installed. The tailnet administrator must configure
an approved tag on the intended host, define/authorize that Tailscale Service
in the tailnet policy, and ensure the owner's test phone has tailnet access.
Only then may the operator retry the **additive service** and validate a unique
`https://<dedicated-customer-host>/` origin with valid TLS, no port,
Customer root routing, same-origin Guest API requests and fragment scrubbing.
Do not repoint existing hostname 443, use Tailscale Funnel, or expose the API
to the public internet without explicit new authorization.

The test phone has not completed HTTPS or real Guest-session acceptance.
Private Tailscale HTTPS cannot receive Meta's public webhook callbacks; any
public callback needs a separately authorized narrow route with signed raw
body validation. **Webhook acceptance has not been demonstrated.**

## Validation evidence

| Check | Actual result |
| --- | --- |
| PostgreSQL engine and new Compose service | PostgreSQL 17.11, dedicated container healthy |
| Migrations | **102/102 applied**, none failed |
| Role SQL posture | PASS: distinct roles and sender function-only authority |
| Storage | PASS: isolated bucket created, HEAD/list empty |
| Docker compose | PASS: new six-service stack starts; default sender remains OFF |
| API `/health/ready` | HTTP **200**, ready |
| Customer root | HTTP **200** locally |
| Dashboard root | HTTP **200** locally; interactive admin login not separately verified |
| Real Native employee login/shift/Check-In | **PASS**, genuine test tenant session `AWAITING_PARKING` |
| WhatsApp-focused API Vitest | **17 files, 120/120 PASS**, mocks only |
| Customer Guest-token/fragment Vitest | **3 files, 14/14 PASS**, mocks only |
| API typecheck and ESLint | PASS |
| Architecture check | PASS with existing grandfathered warnings |
| HTTPS Customer on phone | BLOCKED: distinct tagged Service host not configured |
| Verified Meta binding, real GRANT and catalog | BLOCKED: external evidence/authorized ceremony missing |
| Real WhatsApp dispatch and handset receipt | **NOT RUN** |
| Real signed webhook callback | **NOT RUN** |
| Full CI on pushed SHA | **NOT RUN** |

Commands used (from the new worktree):

```powershell
node scripts/issue310/run-private-task.mjs dbPosture
node scripts/issue310/verify-native-checkin.mjs
pnpm architecture:check
pnpm --filter @valet/api typecheck
pnpm --filter @valet/api lint
pnpm --filter @valet/api exec vitest run --config vitest.config.mjs --project api-non-postgres test/whatsapp
pnpm --filter @valet/customer exec vitest run src/features/auth/guest-token-adapter.test.ts src/features/session/guest-bootstrap-flow.test.ts src/app/document-bootstrap-script.test.tsx
docker compose --project-directory deploy/issue310 --env-file tmp/wa310-runtime/compose.env -f deploy/issue310/compose.yaml ps
```

Avoid running generic PostgreSQL test suites on this persistent new database:
some create/drop disposable databases or temporarily toggle durable controls.
Do not claim SQL dispatch-positive or withdrawal E2E acceptance until the
actual verified binding and consent ceremony exists.

## Safe lifecycle

In the **dedicated new worktree**, the default OFF stack is independently
managed with:

```powershell
docker compose --project-directory deploy/issue310 --env-file tmp/wa310-runtime/compose.env -f deploy/issue310/compose.yaml up -d --no-build
docker compose --project-directory deploy/issue310 --env-file tmp/wa310-runtime/compose.env -f deploy/issue310/compose.yaml stop
```

Never use bare `docker compose down -v`, prune, or global Docker
stop/restart commands: the dedicated volume preserves this tenant. The new
runtime can be restarted without manipulating legacy Test containers.

## LIVE SANDBOX TEST RUNBOOK — controlled final gate

1. Tailnet admin approves the **new** tagged Service host, then an operator
   verifies the clean Customer HTTPS root and Guest API bootstrap on the
   authorized Tailscale-connected test phone. Record only redacted host evidence.
2. Establish genuine Meta ownership/Phone Number ID and current
   `guest_access` Arabic/English approval/catalog evidence. Complete the
   authenticated, audited provider binding for **only** this Organization.
   The existing repository does not yet offer an approved operator ceremony
   for forging neither provider verification nor consent. Escalate that narrow
   governance dependency if it remains unavailable.
3. Confirm the owner's **exact one** Meta-verified test recipient and
   auditable explicit VAYLET opt-in. Create the GRANT through the approved
   consent-management process, with revision, current validity, no withdrawal,
   and isolated tenant/location policy and template registry.
4. The owner obtains a short-lived Meta sandbox token locally. Store it at the
   ignored `tmp/wa310-runtime/meta-access-token` with restricted ACL,
   never in source, logs, chat, or API environment. Record its real expiry
   **without exposing the token**. Only after owner-reviewed activation use
   `deploy/issue310/compose.authorized-send.yaml` as an additive second
   `-f` file; it mounts the token to the sender process alone.
5. Recheck the sender's own restricted database privilege preflight, exact
   `OUTBOUND_META_TEST_DATABASE_NAME=vaylet_wa310` identity and independently
   verified container/database scope, phone allowlist, matching policies,
   signing/encryption key versions, unique approved Customer origin and
   provider credential alias. Confirm production durable controls still OFF.
6. Through reviewed, authorized **test-only** controls, temporarily enable
   SQL `issue_enabled` and `send_enabled`, API
   `GUEST_ACCESS_AUTO_ISSUE_ENABLED`, sender
   `OUTBOUND_MESSAGING_SEND_ENABLED` and
   `OUTBOUND_META_SANDBOX_ACTIVATION_ENABLED`. Set token revoked flag
   false only while verified current. Fail closed on any missing dependency.
7. Log in as the authorized test employee and complete **one new eligible**
   Native Check-In for that one consented test recipient. Verify exactly one
   new protected outbound intent and single SQL-confirmed Meta acceptance.
   Do not trigger an automatic retry after unknown external acceptance.
8. Have the owner confirm receipt on that real test phone, open the
   automatically generated session-specific `#guestToken=` URL and verify
   the exact same session, Guest bootstrap and fragment scrubbing.
   Collect only sanitized identifiers/status evidence. Prove webhook status
   separately if an authorized public signed callback endpoint exists.
9. **Immediately** return both test SQL issue/send controls and all process
   activation flags to OFF, stop the sender, and revoke/remove the temporary
   token. Verify no second message/dispatch, no plaintext Guest URL or number
   in evidence, and no production-state change.

Final remaining owner inputs: (a) a tailnet administrator's separate tagged
service policy/host approval; (b) actual Meta sandbox provider/template proof
and an approved authenticated binding procedure; (c) one Meta-verified
consenting recipient with auditable VAYLET GRANT; (d) a short-lived sender-only
token entered locally. No customer secret, phone number, full Guest URL, or
private key is recorded in this document.

## Security review and release limitations

- **P0:** No known introduced P0 in the isolated provisioning diff; real
  delivery remains disabled.
- **P1 / external gate:** Provider verification and consent cannot be marked
  as passed without the corresponding authorized evidence and workflow.
- **P1 / infrastructure gate:** Clean Tailscale HTTPS identity requires the
  tagged Service host authorization; the pre-existing HTTPS 443 remains intact.
- **P2 / coverage:** Positive SQL issuance/dispatch, withdrawal races, signed
  webhook validation, real-device Guest acceptance and exact-SHA full CI have
  not been exercised on this new tenant.
- **P3 / operations:** This is a local, single-purpose sandbox with manually
  retained encryption keys and dedicated credentials. No production backup,
  public ingress, token rotation or durable secret manager is claimed.

The review confirmed the API container has only the public RSA key, sender
only the private key, Meta token overlay is sender-only and opt-in, no broad
sender SQL table read, no production sender activation, no real customer
consent fallback, no old Test state mutation, and no automatic uncertain-send
retries added by the deployment. Independent review and exact pushed-SHA CI
remain release prerequisites.
