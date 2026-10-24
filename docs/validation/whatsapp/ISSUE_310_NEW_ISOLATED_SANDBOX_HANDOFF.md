# Issue #310 — Isolated Meta WhatsApp sandbox last-mile operator handoff

Date: 2026-10-24 (Asia/Amman)

Classification: **CONFIG_BLOCKED**
No real WhatsApp message sent; no Meta access token installed. This is not production or full E2E acceptance.

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
