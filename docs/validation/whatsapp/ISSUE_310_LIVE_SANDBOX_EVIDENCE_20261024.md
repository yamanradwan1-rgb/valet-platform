# Issue #310 — Isolated live WhatsApp sandbox evidence

Observed on 2026-10-24 (Asia/Amman). This is the current status; earlier setup
snapshots in `ISSUE_310_NEW_ISOLATED_SANDBOX_HANDOFF.md` are historical.

**Classification: META_HTTP_ACCEPTED; HANDSET_GUEST_E2E_UNVERIFIED.** Exactly
one authenticated Native Check-In and one SQL-authorized outbound Meta attempt
were made. Meta returned acceptance with an opaque message identifier. Neither
handset delivery nor the Guest fragment exchange is independently observed.

## Exact isolated scope

| Item | Verified value |
| --- | --- |
| Compose project | `vaylet-wa310` |
| PostgreSQL | `vaylet-wa310-postgres-1`, PG 17.11, DB `vaylet_wa310`, 102/102 migrations |
| Organization | `5072955f-f323-448f-8d7d-bd0d3e6bd0b4` |
| Location | `ac34adc7-1d76-42cb-af29-fef22feaa909` |
| Provider binding | `6e76369a-3c9b-4bb4-89b1-7f3d0fdda078`, verified test-only |
| Template catalog | `meta_guest_access_20261024` |
| Approved WABA / Phone Number ID | `3491682417667249` / `1426684017189271` |
| Guest template | `guest_access`, `ar` and `en_US`, one BODY URL parameter |
| Dedicated Tailscale Service | `svc:vaylet-wa310-customer` on tagged host `vaylet-wa310-host` |
| Portless Customer origin | `https://vaylet-wa310-customer.taild797f4.ts.net/` |
| Proxy upstream | `http://api:3002` via isolated `vaylet-wa310_edge` Docker network |

Only Issue310 application containers were recreated. PostgreSQL/MinIO and the
existing Windows `desktop-k4voran` Tailscale identity/service were not changed.
The independent tagged Tailscale sidecar no longer shares the API network
namespace, so recreating the API does not reset the tailnet Service identity.
`tailscale serve status` advertises the Service as **tailnet-only**. Both the
Customer HTTPS root and API `/health/ready` returned HTTP 200 after dispatch.
The owner independently confirmed the HTTPS root opens on the physical test
phone; this confirms root reachability **only**, not Guest fragment exchange.

## Authenticated Meta, consent and binding

- Sender-only, real Graph v26.0 ownership verification checked the sandbox
  WABA, Phone Number ID, and exact Arabic (`2003500221022564`) and English
  (`28615795824783341`) template identifiers. Both were approved with one BODY
  URL field. No production Meta asset participated.
- The isolated binding was marked verified by the approved maintenance process
  after live Graph proof plus the earlier authenticated Company Admin/MFA
  pending-binding audit. No verification timestamp was fabricated.
- Company and Location policies were enabled only for the exact isolated scope.
  Authenticated Company Admin/MFA consent created a genuine auditable recipient
  `GRANT` (revision 1, evidence `wa310-opt-in-owner-explicit-20261024`). The
  recipient number, digest, admin credentials and MFA factor are not disclosed.
- Sender runtime used its restricted PostgreSQL principal and the isolated
  `vaylet_wa310` DB-name attestation, with one allowlisted recipient. No
  privileged migration credential or Meta token was supplied to the API.

## One actual Check-In and one Meta transport

1. `issue310-one-send-preflight.mjs` established the exact one-tenant/one-location
   scope, authorized employee login, no existing intents, and OFF controls.
2. `issue310-one-authorized-send.mjs --issue-one` authenticated the real test
   employee, invoked the real Native Intake API using `DIFFERENT_CUSTOMER`,
   created one session, protected Guest credential, one initial outbound intent,
   and completed Check-In to `AWAITING_PARKING` version 2. No session was
   inserted directly through SQL. Test issuance returned to OFF immediately.
3. The first dispatch window acquired a lease but created **zero** SQL attempts:
   the new verified binding lacked its required `outbound_message_budgets` row,
   so `outbound_dispatch_permit` denied it with `OUTBOUND_BUDGET_MISSING` before
   any provider transport was possible. The expired lease was independently
   checked, and sender/API HMAC keys and current authorization matched.
4. While both environments remained OFF, an exact-binding maintenance operation
   provisioned a capacity-one test rate budget. It required the expired lease,
   zero SQL attempts, genuine verified binding, and both environments OFF.
5. The same original session and intent were dispatched through the restricted
   Sender. SQL recorded exactly **one** attempt (`attempt_count=1`,
   `max_attempts=1`), final delivery `ACCEPTED`, and a non-null Meta provider
   message ID. The private identifier and Guest URL are intentionally omitted.
   The envelope was purged after acceptance (`outbound_message_envelopes=0`).
6. The one-shot operator restored durable test/production issue/send controls
   to **OFF/OFF** before recreating the disabled Sender. No second intake,
   delivery, or SQL attempt exists. The final counts are exactly 1 intent,
   1 delivery, 1 attempt, 0 retained envelopes.

**Meta HTTP acceptance is not proof of delivery to the handset.** Physical
WhatsApp receipt, opening the actual session-specific Guest link, fragment
removal, correct Guest session and authenticated signed webhook receipt remain
**UNVERIFIED**. Do not initiate another send for this intent.

## Final controls and token disposition

- Both `production` and `test` durable rows: `issue_enabled=false`,
  `send_enabled=false`.
- Sender process reports `OUTBOUND_MESSAGING_SEND_ENABLED=false`,
  `OUTBOUND_META_SANDBOX_ACTIVATION_ENABLED=false`,
  `META_WHATSAPP_TEST_TOKEN_REVOKED=true`, and no access token in its
  environment. Its mounts do not include `meta-access-token`.
- The owner-supplied temporary token file was removed from the isolated private
  runtime after the send and sender unmount. **Revocation at Meta's servers has
  not been independently verified**; the owner must revoke it in the authorized
  Meta account if the temporary token has not yet expired. Deleting the local
  file is not equivalent to Meta-side invalidation.
- The isolated approved provider binding/policy and consent history are kept
  for audit, but neither test nor production can dispatch with current controls.
- Webhook callback proof is not claimed: the tailnet-only Customer origin is
  not a public Meta webhook endpoint. No public API exposure was introduced.

## Focused test matrix

| Command / verification | Actual result |
| --- | --- |
| `node --test deploy/issue310/meta-sandbox-graph-authority.test.mjs packages/database/scripts/issue310-last-mile-gates.test.mjs` | PASS, 11/11 including new missing-budget denial |
| `pnpm --filter @valet/api exec vitest run --project api-non-postgres ...` (8 selected WhatsApp files) | PASS, 83/83 |
| `pnpm --filter @valet/api typecheck` | PASS |
| `pnpm --filter @valet/api lint` | PASS |
| `pnpm --filter @valet/api build` | PASS |
| `pnpm architecture:check` | PASS, preexisting grandfathered warnings |
| `node packages/database/scripts/issue310-last-mile-api-role-smoke.mjs` with protected runtime pointer | PASS, forged binding denied `42501`; GRANT/WITHDRAW and replay rollback-only |
| `node packages/database/scripts/issue310-last-mile-readiness.mjs` with protected runtime pointer | Local 12 gates PASS, including verified-binding budget; generic external gates remain `UNVERIFIED_EXTERNALLY` |
| `docker compose ... config --quiet` for isolated base + tagged tailnet overlay | PASS |
| Real PostgreSQL SQL permit and one actual Meta API request | PASS: 1/1 attempt, `ACCEPTED`, provider ID persisted |
| Tailscale Service status and HTTPS Customer root | PASS: tailnet-only, HTTP 200 |
| Owner's physical phone HTTPS root | Confirmed by owner; Guest token/session not proven |
| Signed Meta webhook delivery event | NOT VERIFIED |
| Full exact-SHA CI | NOT RUN |

The first unqualified Vitest invocation was blocked before running tests by an
existing multi-project `maxWorkers`/`sequence.groupOrder` conflict. Selecting
only `api-non-postgres` produced the reported 83/83 PASS without accessing any
unrelated PostgreSQL fixture or old VAYLET Test database.

## Operator handoff and remaining evidence

- To finish handset acceptance, inspect the **already accepted** message on
  the explicitly authorized test phone. Open its Guest link, confirm the
  correct session, and check whether the `#guestToken` fragment disappears.
  Record only PASS/FAIL with a timestamp; do not copy the URL/token into chat,
  screenshots, Markdown, or application logs.
- If the message never arrives, mark delivery **UNVERIFIED/FAILED** and
  inspect official Meta delivery diagnostics or signed webhook evidence in an
  appropriately authorized follow-up. Do not send another message automatically.
- Meta-side token invalidation is a separate owner-side account operation if
  the credential is still valid. The private local copy is already removed.
- No PR or merge is authorized. Do not use old VAYLET Test, production Meta
  assets, or the original Windows Tailscale Serve identity for diagnostics.
