# W7 — Independent security and integration acceptance (provisional)

**Verdict: FIX REQUIRED / BLOCKED. No independent GO.**

| Evidence identity | Value |
|---|---|
| Repository | `yamanradwan1-rgb/valet-platform` |
| Independently reviewed source | `6b1810d38456495f3c42783f266af82a4c72cf1d` |
| Original feature baseline | `1ecdbeff1c4b7b011a1af00c843f7930e515cea4` |
| C0 accepted contract | `a087ad38cb249840389e5aefaefbecb47333373f` |
| Reviewer | W7 independent replacement reviewer (worker-8), not the failed original W7 agent |
| QA workspace | `/valet-platform/tmp/wa-w7-independent-review` |
| Scope | Complete feature diff, adversarial source checks and selected independent synthetic PostgreSQL/TypeScript negative tests |
| Status of follow-up fixes | **Not integrated into the reviewed SHA; not retested or accepted here** |

This report records findings on the **original** reviewed SHA only. It is intentionally
separate from Prime's evidence ledger and does not reproduce a claim of independent
acceptance from the original, unavailable W7 worker. Work on this report changes
documentation only; production source, migrations and fixed baseline are untouched.
Real WhatsApp sending, production databases, merge, PR and deployment were excluded.

## Independent findings requiring resolution

| ID | Severity | Affected boundary | Reproducible observation on `6b1810d3` | Required re-review |
|---|---|---|---|---|
| W7-P1-01 | **P1 confirmed** | Restricted API PostgreSQL role / provider verification | API runtime can INSERT an **enabled, purportedly verified** Meta binding with arbitrary evidence | Deny supplied verification/activation columns in INSERT, verify the actual restricted role, and preserve safe onboarding |
| W7-P1-02 | **P1 confirmed** | Meta accepted response and signed delivery callback parsers | A syntactically bounded `wamid` with `==` padding is classified `UNKNOWN/MALFORMED_RESPONSE`; an equivalent status callback throws `META_WEBHOOK_INVALID` | Both provider and webhook parser accept actual bounded Meta IDs; rejection and callback correlation remain safe |
| W7-F33 | **P2 confirmed** | Canonical Customer phone change / pre-dispatch cancellation | After changing authoritative phone, a queued message remains `PENDING` with encrypted envelope and can be leased | Permanently suppress the stale intent and purge ciphertext without permitting replacement/misdelivery |
| W7-F11 | **P2 confirmed** | Callback-before-crash recovery / delivery evidence | Signed `DELIVERED` evidence exists, but expired `DISPATCHING` recovery changes state to `UNKNOWN` | Preserve positive signed callback evidence through crash recovery and forbid replay |
| W7-K01 | **P2 configuration/custody gap** | Issuer private-key exclusion | Issuer's `createPublicKey()` accepts private RSA PEM, so the API silently accepts a private key in its public-key configuration | Reject private PEM as an issuer input and verify sender-only private-key custody |

Severity reflects observed scope and exploit preconditions; these are independent
release defects, **not** claims that a production compromise or actual misdelivery
occurred. The default initial-issuance/sending gates remain OFF in this source.

### W7-P1-01: fabricated Meta verification through API runtime INSERT

- Source: `packages/database/scripts/outbound-runtime-privileges.mjs:16-20,54-56`
  grants table-wide INSERT on `outbound_provider_bindings`; migration
  `20261015008600_outbound_messaging_foundation/migration.sql:2-20`
  allows explicit `enabled`, `provider_verified_at`, and
  `provider_evidence_reference` on initial INSERT. UPDATE-specific column
  restrictions and the configuration UPDATE trigger cannot restrict INSERT.
- Independent **real PostgreSQL 17** proof: created a uniquely named disposable
  localhost database, applied all 89 migrations, provisioned synthetic
  API/sender/webhook principals with the shipped provisioning helper, inserted a
  synthetic Organization, and executed the following as the restricted API role:

```sql
SET ROLE "<synthetic_API_runtime_role>";
INSERT INTO outbound_provider_bindings
  (organization_id,environment,waba_id,phone_number_id,config_alias,
   enabled,provider_verified_at,provider_evidence_reference)
VALUES
  ('<synthetic_org_uuid>','test','1234567890','12345678901',
   'w7-synthetic',true,clock_timestamp(),'fabricated-confirmation')
RETURNING enabled,provider_verified_at,provider_evidence_reference;
```

  Outcome: **SQL succeeded** and returned
  `{"enabled":true,"provider_verified_at":"2026-10-15T22:13:00.771Z","provider_evidence_reference":"fabricated-confirmation"}`.
  Disposable database and principals were dropped after verification.
- Security consequence: the API principal can manufacture the database's
  Meta-verification evidence boundary if that principal is compromised or reused.
  This violates the intended least-privilege and provider-onboarding contract.
- Prime-assigned remediation is reported as W1 forward-only migration 090,
  commit `efe00045`; its correctness and integration are **UNVERIFIED** here.

### W7-P1-02: rejecting padded Meta message identifiers

- Source: `apps/api/src/modules/notifications/providers/meta-cloud-result.ts:20-31`
  accepts only `/^wamid\.[A-Za-z0-9._:-]{1,250}$/`;
  `apps/api/src/modules/notifications/webhooks/meta-webhook-events.ts:17-20,50-60`
  likewise rejects `=` inside a provider status ID.
- Independent actual TypeScript function execution, using a synthetic
  Meta-shaped body and the representative ID
  `wamid.HBgMOTE5ODE0MDA0ODkzFQIAERgSNDdEOUQ5NUI0Q0E0ODdDM0YwAA==`:

```text
classifyMetaReply(200, successBodyWithPaddedWamid, null)
  -> {"kind":"UNKNOWN","reason":"MALFORMED_RESPONSE"}
normalizeMetaStatusPayload(deliveredStatusWithSameWamid)
  -> throws META_WEBHOOK_INVALID
```

  A third-party WhatsApp partner API example has the same padded
  `waMessageId` form: LINK Mobility,
  [WhatsApp Message API, p.58](https://a.storyblok.com/f/151608/x/54bd9f56fb/whatsapp-message-api-ver1-4-13.pdf).
  This is compatibility evidence, **not** a claim of controlled live Meta
  validation. No real Meta account or callback was exercised.
- Consequence: a provider-accepted request may be retained as `UNKNOWN`,
  while a corresponding signed delivery callback cannot be persisted. This
  impairs F11/F14/F15/F39/F45 delivery reconciliation. `UNKNOWN` itself
  remains protected against automatic replay in the observed code.
- Prime reports W3 provider fix `591d51b1` and Prime-owned W5 webhook
  fix `25c7282e`. Neither was in this reviewed source; **both require an
  exact-final-SHA re-run**, including accepted response, callback and malformed
  injection negatives.

### W7-F33: phone-change suppression and ciphertext disposition

- Sources: `packages/database/prisma/migrations/20261015008900_outbound_callback_and_suppression_fences/migration.sql:154-191`
  omits current Customer phone/HMAC mismatch from `outbound_suppress_ineligible`;
  `apps/api/src/modules/notifications/worker/outbound-postgres-repository.ts:63-73`
  returns `SUPPRESSED` from the in-memory dispatch preparation without
  persisting a terminal delivery state.
- Independent disposable real PG proof: seed valid synthetic authorized
  Organization/Customer/ValetSession, current grant, provider binding,
  company/location policy, pending delivery and envelope; change
  `customers.phone_normalized` to another canonical E.164 value before
  dispatch; run `outbound_recover_expired(100)` and `outbound_claim_due(10)`.

```text
F33_REPRO {"cleanup":0,"state":"PENDING","envelopes":1,"claim":true}
```

  The HMAC check prevents the old-intent send in the tested implementation,
  but state and envelope retention breach the plan's F33 and DEC-105
  suppression/purge intent. Need a restricted SQL proof that changed phone
  is terminally suppressed without plaintext phone retention or an unsafe
  grant to sender.

### W7-F11: signed delivery callback precedes crash recovery

- Sources: `20261015008900_outbound_callback_and_suppression_fences/migration.sql:58-120`
  records positive callback while delivery is still `DISPATCHING`;
  `20261015008800_outbound_webhook_recovery_functions/migration.sql:116-151`
  marks an expired `DISPATCHING` lease `UNKNOWN`.
- Independently seed a valid synthetic committed `DISPATCHING` attempt
  (no HTTP transport), call the DB callback function with exact binding,
  immutable callback handle, recipient digest and `DELIVERED`; expire the
  synthetic lease and invoke recovery:

```text
F11_CALLBACK_BEFORE_CRASH {
  "callback":true,
  "before":{"state":"DISPATCHING","delivered_at":"2026-10-15T22:19:48.581Z"},
  "recovered":1,
  "after":{"state":"UNKNOWN","delivered_at":"2026-10-15T22:19:48.581Z"}
}
```

  This preserves the delivery timestamp but loses the stronger resulting
  delivery status. No second send was demonstrated; retry prohibition is
  preserved by `UNKNOWN`. Re-review requires signed-evidence-aware recovery
  with a real crash-point/regression test.

### W7-K01: issuer accepts a private key in public configuration

- Source: `apps/api/src/modules/notifications/issuance/initial-guest-crypto.ts:78-92`.
  The call to Node `createPublicKey(publicKeyPem)` derives a public key from
  private PEM instead of rejecting the wrong secret class.
- Independent synthetic test generated a 3072-bit RSA private PEM and passed
  it to `createInitialGuestEnvelopeSealer(privatePem, "w7-key")`.
  Observed: `ISSUER_ACCEPTS_PRIVATE_PEM true` (exit 0).
- No leaked live key was observed. This is a fail-closed deployment key-custody
  gap relative to DEC-105's issuer-public/sender-private separation.

## Threat matrix — controls checked and limits of evidence

| Threat surface | Independently examined mechanism | Evidence / open question |
|---|---|---|
| Guest bearer confidentiality | RSA-OAEP-SHA256, canonical scope AAD, 43-character bearer, hash-only Guest verifier, 30-minute envelope | Crypto/unit suite passed; wrong-key-class acceptance W7-K01; production secret/backup policy unverified |
| Cross-tenant/misdirected recipient | Composite tenant FKs; Customer canonical phone read; HMAC and per-tenant intent binding | Restricted-role and SQL scope smoke passed; phone-change cancellation fails F33 |
| Intake atomicity and replay | SERIALIZABLE intake transaction, existing operation fingerprint, same-transaction generation/intent/envelope/audit | W2 focused unit tests pass; Prime previously reported nine real PG intake tests; no W7-authored HTTP→PG atomicity matrix run |
| SQL `SECURITY DEFINER` and ACL | Restricted principals, revoke PUBLIC, search_path, current consent/policy/credential | Local 89-migration real PG smoke passed, but adversarial INSERT W7-P1-01 bypasses evidence boundary |
| Lease, UNKNOWN and two workers | Committed permit/attempt, bounded retries, SQL lease/phone recheck, callback-first | Existing smoke positive; W7-F11 negative; full process-kill and 2-replica W7 execution not performed |
| Meta Graph, template and fragment | Pinned fixed host/version, bounded transport, WABA template registry, HTTPS `#guestToken=` payload | Synthetic W3 tests pass; padded `wamid` fails; no approved live template, callback echo, or fragment preservation verified |
| Signed webhook | Original request HMAC before parse, bounded input, binding/handle/message/recipient correlation | Unit tests pass; padded ID rejected; real Meta signature and account subscription untested |
| Company Admin policy settings | Session authority, tenant/company scope, sensitive MFA, revision compare-and-swap, audit, typed/no-store DTO | Prior Prime PG 4/4 report and source inspected; W7 independently ran API non-PG suite only |
| Consent and withdrawal | Evidence revisions; expiry; before-send rechecks and suppression | Real PG smoke positive for withdrawal and denial; consent collection/withdrawal governance and authorized operator tooling not live-validated |
| Frozen UX and privacy | Restricted Dashboard Settings insertion; client freeze manifest; no Native or Customer application code touched | Independent freeze guard PASS; physical Native parity, logging/telemetry canary and browser click-time behavior unverified |

## Validation actually executed by W7 on source `6b1810d3`

| Check | Actual result | Fidelity |
|---|---|---|
| `node packages/database/scripts/outbound-migration-smoke.mjs` | **PASS** 89 migrations; PUBLIC/role tests; consent, late override, callback, purge, opt-out, UNKNOWN | Real PostgreSQL 17, unique disposable localhost database |
| `pnpm --filter @valet/api exec vitest run --config vitest.config.mjs --project api-non-postgres whatsapp-` | **PASS 88/88**, 15 files | API non-PG mocks and contract tests |
| `node --test scripts/whatsapp-ui-freeze-guard.test.mjs` | **PASS 3/3** | Pinned manifest/allowlist tests |
| `node scripts/whatsapp-ui-freeze-guard.mjs` | **PASS / 115 changed paths** | Static diff/UI freeze guard |
| Independent restricted-role binding INSERT | **FAIL security invariant** (SQL unexpectedly succeeds) | Actual isolated PG role and INSERT |
| Independent F33 changed-phone scenario | **FAIL expected suppression** | Actual synthetic PG and queued intent |
| Independent F11 delivered-then-crash scenario | **FAIL expected delivery state** | Actual synthetic PG callback and recovery |
| Padded Meta provider/webhook ID | **FAIL interoperability input** | Actual TS functions, synthetic Meta-shaped values |
| RSA private PEM accepted as issuer public config | **FAIL key-class input validation** | Actual Node crypto with ephemeral RSA-3072 |

Every independent database probe created only its own random local database
and synthetic roles and dropped them in a `finally` block. No production
connectors, real customer numbers or Meta sends were used. The reviewed
worktree remained source-clean before preparing this documentation.

The global Postgres suite `pnpm test:postgres` was not independently executed
by W7 under the protected Issue #215 cluster ownership guard. Prime's
separate cumulative results must be attached to the final SHA before
acceptance; prior owner reports do not establish independent W7 coverage.
The plan's **F01–F45** matrix remains **partially tested**: the named F11
and F33 cases above FAIL, selected unit/SQL happy paths pass, and
unexecuted live/physical/crash/restore rows remain **NOT RUN/BLOCKED**.
Do not turn a suite-level PASS into forty-five claimed scenario passes.

## Integration and release hold

Prime reported isolated, **not-yet-integrated** candidate changes:

- W1 forward-only migration 090 / restricted binding INSERT: `efe00045`.
- W3 padded `wamid` accepted response: `591d51b1`.
- Prime W5 webhook padded `wamid` parser: `25c7282e`.
- Further W1/W4/W2 fixes for F33, F11 and associated weaknesses were
  still in progress at report preparation.

These commit identifiers are tracking inputs only. **No source revision
after `6b1810d3` has been accepted or retested by W7**. On the integrated
commit, verify exact `git rev-parse HEAD`, review the full delta from
`6b1810d3`, repeat all five focused negatives, rerun the real role/DB
smoke and feature suites, and reconcile every failed F-row and blocker
against actual observed output. Then update the reviewed-SHA field,
findings, command evidence and verdict in **this file**.

**Current authorization boundary:** initial issuance and send switches OFF;
production sending also requires separate Owner approval, real Meta-owned
onboarding/templates, opt-in withdrawal governance, fragment-link verification,
private-key and backup-retention policy, production rollout evidence and
physical Native testing. This document does not authorize any of those actions.

**Final W7 status at `6b1810d3`: FIX REQUIRED / BLOCKED pending independently
verified integrated fixes and remaining release evidence.**
