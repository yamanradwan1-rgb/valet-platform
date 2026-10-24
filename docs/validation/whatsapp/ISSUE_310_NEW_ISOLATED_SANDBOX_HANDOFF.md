# Issue #310 — Isolated Meta WhatsApp sandbox last-mile operator handoff

Date: 2026-10-24 (Asia/Amman)

**Latest classification (21:57 Asia/Amman): META_HTTP_ACCEPTED;
HANDSET_GUEST_E2E_UNVERIFIED.** One authenticated Native Check-In generated
one accepted Meta Sandbox API message, with SQL attempt count exactly 1/1.
Both environments' issue/send controls are OFF. The temporary local token
file was removed after sender unmount. Signed callback and actual handset
Guest-session acceptance are still unverified; Meta-side token invalidation
is not independently confirmed.

**Current, authoritative evidence:**
[`ISSUE_310_LIVE_SANDBOX_EVIDENCE_20261024.md`](./ISSUE_310_LIVE_SANDBOX_EVIDENCE_20261024.md).
The sections below are chronological setup snapshots. Earlier descriptions
such as “CONFIG_BLOCKED”, “not installed”, or “not sent” refer to states
**before** the final authorized test; they do not override the current report.

## Scope and code identity

- Last-mile branch: `feat/issue-310-sandbox-last-mile-authorization`, based on isolated-stack commit `d8f4d1bdd39526c568784263bfc3271739f682d3`.
- Worktree / deployment source: `D:\kndoom\valet-platform\tmp\issue-310-last-mile-worktree`.
- Compose file: `deploy/issue310/compose.yaml`; Compose project **`vaylet-wa310`**.
- Dedicated previous Issue #310 private runtime files stay outside tracked Git under `D:\kndoom\valet-platform\tmp\issue-310-isolated-wa-e2e-worktree\tmp\wa310-runtime`. The last-mile worktree has an **ignored NTFS junction** pointing to that folder; this does not duplicate the credentials.
- The old **VAYLET Test** deployment, its database, Docker assets and original Tailscale mappings were not used or modified.

## Runtime inventory

| Resource | Isolated Issue #310 identifier / endpoint |
| --- | --- |
| PostgreSQL | `vaylet-wa310-postgres-1`, PostgreSQL **17.11**, DB `vaylet_wa310`, loopback `127.0.0.1:56310` |
| MinIO | `vaylet-wa310-minio-1`, loopback `127.0.0.1:59310` |
| API | `vaylet-wa310-api-1`, `http://127.0.0.1:33110` |
| Customer App | `vaylet-wa310-customer-1`, `http://127.0.0.1:33112` |
| Dashboard | `vaylet-wa310-dashboard-1`, `http://127.0.0.1:33113` |
| Outbound worker | `vaylet-wa310-sender-1`, sending disabled |
| Networks | `vaylet-wa310_data`, `vaylet-wa310_edge`, `vaylet-wa310_maintenance` |
| Volumes | `vaylet-wa310_pgdata`, `vaylet-wa310_miniostore` |

The application endpoints above are **local HTTP only**. A separate portless HTTPS Customer origin has **not** been provisioned, so the outbound URL cannot yet be authorized.

The new build was deployed on 2026-10-24 as the local image
`sha256:c2a3e152d943ee13b5d800d98216b3248a2e6431330b4e967a3b910e4f8c4ca1`.
Only the four Issue310 application containers (API, Customer, Dashboard, sender)
were recreated. The Issue310 PostgreSQL and MinIO containers stayed running;
the existing Tailscale Serve configuration was not changed. After deployment,
both API health routes and the Customer/Dashboard root returned HTTP 200;
the API remained healthy and all six Issue310 containers were running.
Neither the API nor sender container has a Meta test access token; the API
has no sender private RSA key in its environment.

## Database scope and security

- 102/102 migrations complete; no failed migrations.
- One new test Organization: `5072955f-f323-448f-8d7d-bd0d3e6bd0b4`.
- One new test Location: `ac34adc7-1d76-42cb-af29-fef22feaa909`.
- Four distinct DB LOGIN identities: `wa310_migrate`, `wa310_api`, `wa310_sender`, `wa310_webhook`. Sender runtime has narrow SQL dispatch-function permission; no protected table SELECT, superuser, BYPASSRLS, DDL role or shared API identity.
- Both rows in `outbound_messaging_control` have `issue_enabled=false`, `send_enabled=false` for **test and production**. API issuance, sender send and sandbox activation flags are also OFF. The Meta token revoked marker is `true`.
- Provider binding: **not established/verified**. No genuine provider-verification authority has been exercised; ID unavailable.
- Template catalog version: **not approved for this new tenant**. Historical Meta UI indicates `guest_access` `ar` and `en_US` active with one BODY URL field, but it is not authenticated live-current verification.
- Company/Location messaging policy: **disabled/unconfigured**; no implicit inheritance or default enablement.
- Recipient consent: **no current VAYLET GRANT**. Meta's test-recipient verification does not imply customer permission.
- Newly added API-only SQL smoke test creates a pending binding and synthetic GRANT/WITHDRAW inside a single rolled-back transaction. It persists **nothing** and must never be represented as real consent.

## Authenticated test-only management capabilities added

- `POST /v1/staff/management/organizations/:organizationId/whatsapp-sandbox-binding-request` accepts only `{ "requestPendingSandboxBinding": true }`. It pins the known test WABA/phone, requires exact test DB/Org, all sending controls OFF, Company Admin with sensitive MFA and commercial entitlement, and creates only a **disabled/unverified** binding with an organization audit entry. It never sets `provider_verified_at`.
- `POST /v1/staff/management/organizations/:organizationId/whatsapp-test-recipient-consent` accepts `action: "GRANT" | "WITHDRAW"`, `expectedRevision`, an explicit owner-confirmation marker, and a constrained non-secret evidence reference. It selects the *one* configured authorized recipient from the API's protected environment and uses the approved versioned HMAC digest; no client phone/tenant/digest input is accepted. It requires Company Admin sensitive MFA, validates the exact test database/Org and calls the existing revisioned SQL permission change, followed by audit. GRANT additionally requires both durable environments OFF. WITHDRAW remains possible during live operation.
- Neither route is an ownership verifier or a substitute for external consent evidence. The current API env lacks the explicit Org/recipient inputs, and owner MFA/entitlement are not independently verified, so these paths **remain closed** until separate configuration and authorization are done.
- No schema migration, dependency, or guest-token semantics changed on this branch.

## Technical verification

| Check | Observed result |
| --- | --- |
| `node --test packages/database/scripts/issue310-last-mile-gates.test.mjs` | **3/3 PASS** |
| `pnpm --filter @valet/api exec vitest ... 14 targeted WhatsApp test files` | **88/88 PASS** |
| `pnpm --filter @valet/api typecheck` | **PASS** |
| `pnpm --filter @valet/api lint` | **PASS** |
| `pnpm --filter @valet/api build` | **PASS** |
| `node packages/database/scripts/issue310-last-mile-api-role-smoke.mjs` with protected runtime-dir pointer | **PASS**, real API DB principal, rollback-only |
| `node packages/database/scripts/issue310-last-mile-readiness.mjs` with protected runtime-dir pointer | **CONFIG_BLOCKED** with isolation/migrations/roles/OFF gates PASS |
| HTTP `/health/ready` and `/health/live` on :33110 | **200 / 200** |
| Customer :33112 / Dashboard :33113 | **200 / 200** |
| Existing Tailscale Serve routes | **unchanged** when inspected; old backend reachability not asserted |
| Real Meta API / real phone Guest URL / signed webhook | **NOT RUN** |
| Full exact-commit CI | **NOT RUN** |

The database smoke uses random synthetic digest and tests a stale-revision denial. Its outer transaction always rolls back; direct API SELECT of permission events is correctly denied.

## HTTPS and Meta authorization blockers

1. **Dedicated Customer HTTPS identity.** The existing `desktop-k4voran.taild797f4.ts.net` root HTTPS 443 serves another API and must remain untouched. Current node is untagged. A separate tagged Tailscale Service host, service definition, tailnet approval and phone access grant are needed to obtain a unique portless HTTPS Customer hostname. Prefer a separate tagged host over changing the existing user's node identity. The test phone was not currently proven tailnet-online.
2. **Authenticated Meta ownership verification.** Verify actual WABA `3491682417667249`, Phone Number ID `1426684017189271`, current two `guest_access` templates, one BODY URL variable and account ownership in the approved Meta portal. Obtain genuine authorized evidence through an authenticated/onboarded operator process before writing provider verification. A historic local Markdown snapshot cannot be treated as independent current ownership proof. Protected production WABA/phone IDs are never test send candidates.
3. **Consent and recipient.** Obtain the owner's explicit opt-in for the one Meta-verified recipient, with a durable evidence reference and validity period, then use the sensitive authenticated path for GRANT. Configure the exact Org and approved recipient privately in the API; put the test recipient allowlist in the sender-only configuration. Do not publish the number.
4. **Company Admin availability.** Confirm the new test admin's MFA-sensitive session and company entitlement, then create pending test binding, complete external verification using the permitted operator authority, and configure company/Location policy plus the exact approved template catalog revision.
5. **Meta test token.** **Do not request or install now.** Only after all pre-token gates PASS obtain one temporary test token directly into the sender's restricted local secret injection and record its real expiry. A physical-phone test and any public signed webhook remain independent final gates.

## Sanitized operator workflow

1. Open the existing private Issue310 runtime directory **locally on the Windows host** to retrieve test admin/employee or infrastructure credentials. Use the local operator-private inventory; never paste, log or commit its secret values. The last-mile worktree's ignored junction references the same protected directory.
2. Start/inspect only `vaylet-wa310`: `docker compose -p vaylet-wa310 -f deploy/issue310/compose.yaml --env-file tmp/wa310-runtime/compose.env ps`.
3. For repeatable read-only gates, from this worktree in PowerShell, set **only in that process** `WA310_PRIVATE_RUNTIME_DIR` to the original Issue310 private runtime directory and invoke `node packages/database/scripts/issue310-last-mile-readiness.mjs`. Its output contains no secrets or recipient digests.
4. After the HTTPS/Meta/consent blockers are cleared, verify genuine binding, current approved catalog and test-only policies, SQL sender preflight and physical-device fragment/bootstrap first.
5. Request the owner's **separate final live-send GO**. Securely inject the temporary token into the sender-only process, enable test-only DB issue/send controls and flags for **one eligible Native Check-In**, and record only redacted dispatch/provider/phone/Guest evidence.
6. Immediately disable test issuance and sending, stop sender, revoke the temporary token and verify zero unexpected extra sends. Keep production controls OFF throughout.

**Final gate now: CONFIG_BLOCKED.** No live WhatsApp acceptance, signed webhook, physical Customer session match or full CI pass is claimed.

## Follow-up: owner-side browser setup and separate Tailscale host (2026-10-24)

The owner reports that Antigravity saved these **tailnet administration**
objects: `tag:vaylet-wa310-host`, `svc:vaylet-wa310-customer`, endpoint
`tcp:443`, hostname `vaylet-wa310-customer.taild797f4.ts.net`.
This is evidence of the **admin-side definition**, not a running tagged host.
Host-side inspection independently found the existing Windows
`DESKTOP-K4VORAN` node online but untagged; no connected Issue310 tagged
host was listed. All old `tailscale serve status` mappings remained unchanged.
The new Service DNS name resolved, but HTTPS navigation to its root failed.

Two optional, tracked Issue310-only artifacts now prepare a separate host:

- `deploy/issue310/compose.tailscale-service.yaml` — a **profile-only**
  Tailscale container `tailscale-customer`, `network_mode: service:api`,
  userspace networking, `TS_EXTRA_ARGS=--advertise-tags=tag:vaylet-wa310-host`.
  Its state uses its own `tailscale_state` volume; it never changes the
  Windows Tailscale node identity.
- `deploy/issue310/tailscale-service-config/serveconfig.json` — the exact
  `svc:vaylet-wa310-customer` `tcp:443` mapping to **HTTP
  `127.0.0.1:3002`** inside the API/Customer shared network namespace.
  `docker exec vaylet-wa310-api-1 node -e ...` verified HTTP **200** from
  that same namespace. The published Windows `33112` port is an external
  loopback mirror; the sidecar must use internal port **3002**.

Tailscale's official containerboot implementation supports
`TS_AUTHKEY=file:/run/secrets/wa310-host-authkey`, so no auth-key value
is embedded in Git, Docker Compose variables, or inspectable container
environment. The secret mount points only to the ignored private runtime.
`docker compose ... config --quiet` passed with the overlay.
**No tagged-host auth-key file currently exists; the sidecar was not started.**

### Minimal owner-side Tailscale credential dependency

1. Generate a **short-lived, tag-scoped** auth key in the Tailscale admin
   console for `tag:vaylet-wa310-host`; choose expiry/reuse policy
   appropriate to this single dedicated test host. Do not paste it into
   chat, Git, shell history or reports.
2. Install it securely as the existing private Issue310 runtime file
   `tmp/wa310-runtime/tailscale-host-authkey`, with restricted NTFS
   permissions inherited from that private directory.
3. From the last-mile worktree, start **only** the optional host:

   ```powershell
   docker compose -p vaylet-wa310 -f deploy/issue310/compose.yaml -f deploy/issue310/compose.tailscale-service.yaml --env-file tmp/wa310-runtime/compose.env --profile wa310-tailnet up -d --no-deps tailscale-customer
   ```

4. On the sidecar, inspect Tailscale status, tag and Service advertisement.
   Confirm admin approval/access to `svc:vaylet-wa310-customer`, then check
   `https://vaylet-wa310-customer.taild797f4.ts.net/` from both Windows and
   the authorized tailnet phone. Check the Guest bootstrap/fragment before
   installing the origin in the sender configuration.
5. Only after live HTTPS passes, update the **Issue310-only** Customer origin,
   API Guest allowed origins and sender configuration. Rebuild/restart only
   affected Issue310 app containers. Never redirect existing Windows 443.

### Updated Meta evidence and remaining authorization

The owner also reports Meta Sandbox WABA `3491682417667249`, Phone ID
`1426684017189271`, `guest_access` Arabic template
`2003500221022564` and English template `28615795824783341`,
both approved with one BODY URL variable. One recipient is reported
Meta-verified. These facts document the owner-side portal check; they
do **not** attest a verified binding or valid VAYLET consent in SQL.
The last-mile readiness SQL still reports binding/policy/consent/template
as BLOCKED. There is no current recipient-specific consent GRANT or
authorized verified binding in this Issue310 database. Never backdate
`provider_verified_at`, use a fabricated evidence reference, or mark
the recipient opted in merely because Meta lists them as test-verified.
The API's sensitive-MFA management path and a genuinely authorized
provider onboarding/verification authority must perform those changes.

No Meta temporary access token has been generated or requested; no
single-message dispatch, phone delivery, Guest Session match or signed
webhook receipt has been observed. Issue310 remains **CONFIG_BLOCKED**
with test and production issue/send controls OFF/OFF.

## Final last-mile evidence update — 2026-10-24 (supersedes earlier pending items)

This dated update records the **current state**; the earlier entries above are
retained as historical evidence from before the tagged host and authenticated
management configuration were available.

- **HTTPS is operational:** the isolated `vaylet-wa310-tailscale-customer-1`
  uses `tag:vaylet-wa310-host` and advertises
  `svc:vaylet-wa310-customer`. The tailnet-only URL
  `https://vaylet-wa310-customer.taild797f4.ts.net/` returned **HTTP 200**
  after rebuilding and recreating the Issue310 application containers.
  `tailscale serve status` showed `/: http://127.0.0.1:3002` in the
  API/Customer shared network namespace. The Windows Tailscale node and its
  original mappings were not reconfigured. The dedicated Tailscale state
  volume preserves the mapping across a sidecar restart/recreation; do not
  reintroduce `TS_SERVE_CONFIG`, which was observed clearing the Service
  endpoints on restart. The Customer app itself returned 200, but no live
  token fragment/bootstrap was tested on the physical phone.
- **Isolated application rebuilt:** `docker compose -p vaylet-wa310 -f
  deploy/issue310/compose.yaml --env-file tmp/wa310-runtime/compose.env
  build api` succeeded, producing local image
  `sha256:38807826187279a39e55209dabb3cd5ff862821d861e67e270f396d35292f5eb`.
  The API, Customer, Dashboard, Sender and separate Tailscale sidecar were
  recreated from Issue310-only Compose files; PostgreSQL and MinIO were not
  recreated. API `/health/ready` and Customer HTTPS returned **200**.
- **Authenticated Company Admin:** a newly enrolled MFA factor was confirmed
  through the staff authentication API. A genuine MFA-assured Company Admin
  request created pending sandbox binding
  `6e76369a-3c9b-4bb4-89b1-7f3d0fdda078`; its state remains
  **PENDING_META_VERIFICATION**. The isolated Organization has a scoped local
  Dashboard entitlement. The owner-attested recipient opt-in was recorded via
  `whatsapp-test-recipient-consent` as an auditable **GRANTED revision 1**
  with reference `wa310-opt-in-owner-explicit-20261024`. No raw phone,
  recipient digest, credential or MFA factor appears in this report.
- **Catalog/policy:** Issue310 API and sender privately register internal `ar`
  and `en` for approved sandbox WABA `3491682417667249`, exact catalog
  `meta_guest_access_20261024`; outbound English resolves to Meta `en_US`.
  Organization and Location policies were prepared through authenticated
  management APIs and remain **DISABLED**. This is deliberate until the
  binding is independently verified through an authenticated Meta Graph read.
- **Live Meta authority:** the sender-only verifier reads the temporary token
  solely from `/run/wa310/meta-access-token` and checks WABA phone ownership,
  the two exact approved `guest_access` template IDs, `UTILITY` category and
  one BODY URL variable using Graph v26.0. The scoped maintenance onboarding
  operator requires a fresh bounded Graph proof **and** the existing
  Company Admin request audit before marking the binding verified, recording
  an evidence fingerprint and append-only audit event. **It has not run:** no
  sender-only temporary Meta token has been installed. A browser-side Meta
  account session was unavailable to this execution context. No Meta HTTP
  send, provider response, physical handset receipt, Guest Session match or
  webhook callback can honestly be claimed.
- **Security posture:** 102/102 migrations, restricted API/sender/webhook
  principals and exact tenant/location checks pass. Durable test and
  production issue/send controls remain OFF/OFF. API issuance,
  `OUTBOUND_MESSAGING_SEND_ENABLED` and sandbox activation all remain OFF;
  the sender credential revocation marker remains `true`.

### Final focused validation

| Command / proof | Result |
| --- | --- |
| `node --test deploy/issue310/meta-sandbox-graph-authority.test.mjs packages/database/scripts/issue310-last-mile-gates.test.mjs` | **10/10 PASS** — approval/phone/locale/template/credential negative tests |
| `node packages/database/scripts/issue310-last-mile-api-role-smoke.mjs` with the protected runtime pointer | **PASS** — forged verified binding denied `42501`; GRANT/WITHDRAW and stale revision rollback tests |
| `node packages/database/scripts/issue310-last-mile-readiness.mjs` with the protected runtime pointer | **CONFIG_BLOCKED** — 9 local positive gates PASS; binding and policy BLOCKED; external device/Meta evidence unverified |
| `pnpm architecture:check` | **PASS** (preexisting grandfathered notices) |
| `pnpm --filter @valet/api typecheck` | **PASS** |
| `pnpm --filter @valet/api lint` | **PASS** |
| Docker image build and isolated application recreation | **PASS** |
| Customer HTTPS root and API ready after recreation | **HTTP 200 / HTTP 200** |
| `docker exec vaylet-wa310-sender-1 node deploy/issue310/meta-sandbox-graph-proof.mjs` without installed token | **EXPECTED DENIAL** — failed closed before any Graph request |
| Real Meta send, physical guest bootstrap, signed webhook, exact-SHA full CI | **NOT RUN / NOT PROVEN** |

### Minimal remaining external handoff and disabled release gate

1. In the existing Issue310 private runtime directory, install the genuine
   short-lived Meta sandbox credential at `meta-access-token` without copying
   its contents into Git, a terminal command, browser storage or chat. Record
   its actual expiry in the protected sender configuration and keep the token
   restricted to the Sender. For controlled verification, mount it using
   `deploy/issue310/compose.authorized-send.yaml`; no sending flags turn ON
   merely by mounting it. Do not reuse any production Meta asset.
2. With issue/send controls still OFF, run `node
   packages/database/scripts/issue310-verified-meta-binding.mjs
   --verify-live-meta-ownership` using the protected
   `WA310_PRIVATE_RUNTIME_DIR` pointer. If Meta Graph denies any required
   phone/template fact, leave binding PENDING and stop activation.
3. Only after verified evidence, run `node
   deploy/issue310/operator-authorized-consent.mjs
   --activate-verified-policy` using the same private runtime pointer and
   repeat SQL role, recipient, catalog, location and revocation readiness.
4. Verify the *actual phone* can load the dedicated tailnet HTTPS URL. Then,
   and only with all authorizations checked, enable the smallest possible
   test-only issuance/send flags and durable test switches for the **single**
   authorized Native Check-In. Collect one sanitized Meta response and
   physical Guest bootstrap/session match. Never retry an uncertain provider
   acceptance. Disable issue/send, stop the sender and revoke the temporary
   credential immediately afterward. Production controls stay OFF.

**Release classification: IMPLEMENTED_BUT_CONFIG_BLOCKED.** The genuinely
missing dependency is a temporary authorized Meta sandbox credential in the
sender (plus physical-device Guest/session proof during the one-message test).
No real WhatsApp message has been sent and no live E2E success is asserted.
