# W7 — Independent security and integration acceptance (provisional)

**LATEST INDEPENDENT VERDICT on exact source
`500a5f6802437370251cfba7d5eb8dbbfe51de77`:
SCOPED REMEDIATION PASS; FINAL ACCEPTANCE BLOCKED — NOT GO.**
W7 independently reproduced positive and adversarial acceptance probes for
the 093 retry/phone-change correction and the five prior security findings.
The **root protected PostgreSQL suite is not proven complete**, so this is
not a release or production approval. The former 767 source remains
superseded and explicitly not approved.

The historical original-source verdict at `6b1810d3` remains
**FIX REQUIRED**. The historical defect reproductions below are preserved;
the new exact-SHA re-review and its distinct test evidence are at the end.

| Evidence identity | Value |
|---|---|
| Repository | `yamanradwan1-rgb/valet-platform` |
| Independently reviewed source | `6b1810d38456495f3c42783f266af82a4c72cf1d` |
| Second-pass source / precise acceptance target | `767964267ac822aa032111b743c15149cb0c402c` (reviewed; scoped tests only; release BLOCKED) |
| Original feature baseline | `1ecdbeff1c4b7b011a1af00c843f7930e515cea4` |
| C0 accepted contract | `a087ad38cb249840389e5aefaefbecb47333373f` |
| Reviewer | W7 independent replacement reviewer (worker-8), not the failed original W7 agent |
| QA workspace | `/valet-platform/tmp/wa-w7-independent-review` |
| Scope | Complete feature diff, adversarial source checks and selected independent synthetic PostgreSQL/TypeScript negative tests |
| Status of follow-up fixes | Original 6b source: absent; second-pass 767 source: implemented and scoped independently retested, subject to global QA gates |
| New finalization defect | `W7-F33-R2`: historical 767 real-PG 23514 defect; migration 093 on exact 500a **PASS scoped W7 retests**, see final section; root acceptance still blocked |
| Latest W7 exact SHA | `500a5f6802437370251cfba7d5eb8dbbfe51de77`, tested from separate clean QA worktree |

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

At the **original** 6b review, Prime reported isolated, not-yet-integrated
candidate changes:

- W1 forward-only migration 090 / restricted binding INSERT: `efe00045`.
- W3 padded `wamid` accepted response: `591d51b1`.
- Prime W5 webhook padded `wamid` parser: `25c7282e`.
- Further W1/W4/W2 fixes for F33, F11 and associated weaknesses were
  still in progress at report preparation.

This is a historical checkpoint; the newer integrated remediation is
independently reviewed **below**, not substituted silently for its initial
findings.

**Current authorization boundary:** initial issuance and send switches OFF;
production sending also requires separate Owner approval, real Meta-owned
onboarding/templates, opt-in withdrawal governance, fragment-link verification,
private-key and backup-retention policy, production rollout evidence and
physical Native testing. This document does not authorize any of those actions.

**Final W7 status at `6b1810d3`: FIX REQUIRED / BLOCKED pending independently
verified integrated fixes and remaining release evidence.**

---

## Second-pass W7 independent security re-review — source 76796426

**Exact committed feature source:** `767964267ac822aa032111b743c15149cb0c402c`
on `feat/automatic-whatsapp-guest-access` at re-review (not pushed as
part of this QA). It contains prior remediation checkpoint
`3edbd9369839bf3d979b52af25fb5fee732059e0` and a new final
status-ID grammar fix. W7 switched **its own independent worktree** to
this exact commit before re-running tests; no Prime worktree or production
source files were modified. This document's follow-up commit is
documentation-only atop that source.

### Full remediation diff independently inspected

- Original vulnerable source: `6b1810d38456495f3c42783f266af82a4c72cf1d`.
- Remediation: migration 090
  `20261015009000_outbound_binding_insert_acl`, migration 091
  `20261015009100_outbound_authenticated_crash_recovery`, migration 092
  `20261015009200_outbound_phone_change_suppression`; changed runtime
  privilege provisioner/verifier; W3 Meta response classifier; W5 webhook
  parser; W2 issuer crypto and scoped tests.
- Final 767 source changes only the webhook status ID grammar and test
  relative to 3ed: status message IDs now explicitly require the
  provider's bounded `wamid.` grammar, while WABA/phone/attempt authority
  identifiers keep their prior stricter grammar.

| Original issue | Second-pass independent observation on 767 | Scoped verdict |
|---|---|---|
| **W7-P1-01** forged provider verification INSERT | Disposable real PG17 migration smoke applies **92 pristine migrations**, re-provisions restricted roles, simulates legacy table-wide INSERT then applies 090; verifies full-table grant revoked; explicit `enabled`, `provider_verified_at`, evidence, revision and timestamps rejected with SQLSTATE **42501**; safe unverified onboarding/limited configuration UPDATE succeed. | **PASS scoped**; former P1 repro denied |
| **W7-P1-02** padded Meta IDs | Independent direct Node/TypeScript call passes **3** padded/bounded IDs through both `classifyMetaReply` and `normalizeMetaStatusPayload`, including `+/==` and a 255-character edge. Rejects **8** malformed, non-`wamid` or oversized IDs across **both** parsers. | **PASS scoped**, including 767 grammar hardening |
| **W7-F33** changed Customer phone keeps queued payload | Real PG17 isolated smoke confirms immediate durable `SUPPRESSED` and ciphertext deletion for `PENDING`, `LEASED` and `RETRY_WAIT`, customer isolation, no-op edit unchanged, transaction rollback restores prior state. `DISPATCHING` stays irreversible and recovers `UNKNOWN` with envelope purge, no retry. Reviewed 092 trigger Customer-lock/order design. | **HISTORICAL scoped PASS only**; new W7-F33-R2 finalization defect supersedes full acceptance |
| **W7-F11** authenticated callback before sender crash | Real PG17 smoke confirms signed `SENT`, `DELIVERED`, `READ` evidence makes timed-out dispatch `ACCEPTED`; negative `FAILED`, fabricated timestamp, bare message ID and no proof recover `UNKNOWN`, with attempt state, purge, idempotence and no replay. Reviewed 091 checking immutable correlated provider event rather than timestamps alone. | **PASS scoped** |
| **W7-K01** private issuer PEM accepted | Independently generated ephemeral RSA-3072 key pair. Public SPKI PEM passes; private PKCS#8, private PKCS#1, and concatenated public+private PEM all fail closed with the public-only-key error. | **PASS scoped** |

### Commands and outcomes actually executed by W7 on exact 767 source

| Command / independent probe | Exit / observed result |
|---|---|
| `git rev-parse HEAD` (isolated QA worktree) | `767964267ac822aa032111b743c15149cb0c402c` |
| `node packages/database/scripts/outbound-migration-smoke.mjs` | **Exit 0**, 92 pristine local disposable PG17 migrations; actual runtime ACL, forge 42501, consent/tenant controls, F11, F33, callback/override/opt-out, purge and control OFF/OFF PASS |
| `pnpm --filter @valet/api exec vitest run --config vitest.config.mjs --project api-non-postgres whatsapp-` | **Exit 0**, **93/93 PASS** across 16 test files |
| `node --test scripts/whatsapp-ui-freeze-guard.test.mjs` | **Exit 0**, **3/3 PASS** |
| `node scripts/whatsapp-ui-freeze-guard.mjs` | **Exit 0**, `UI freeze: PASS / 125 changed paths` |
| Independent stdin `node --experimental-strip-types --input-type=module -` calling the actual provider, webhook, issuer functions on synthetic inputs | **Exit 0**: three accepted padded `wamid` across both parsers, eight rejected malformed/foreign identifiers across both, RSA3072 public allowed/three private-key variants denied |

The scripted smoke is *source-owned test logic independently invoked and
reviewed* by W7, not a wholly separate fixture implementation; the
direct TypeScript boundary probe is **W7 independently composed** and
exercised the actual application functions. DB scripts provision random
local synthetic principals/data, create a random disposable PostgreSQL
database and clean up afterwards; no real Meta, live recipients, production
DB, or transport sends. Prime had already reported the same feature smoke
and tests; W7's above results came from its **own checkout/process**.

### Remaining gaps and independent threat assessment

1. The **root full PostgreSQL and non-PostgreSQL suites**, including
   definitive protected Issue #215 fixture/owner attestation and
   pinned-baseline attribution of any failures, have **not been verified
   complete by W7**. Prime/W1/W2 results are pending. The six dedicated
   F33 multiclient race tests were reviewed but not run in this W7 pass,
   and no process-kill/real Meta simulation was independently performed.
2. Sender and webhook role isolation, server-only transport secret, signed
   webhook original-body HMAC, strict tenant callback correlation and
   never-retry `UNKNOWN` boundaries remain consistent with the reviewed
   source/smoke. New status `wamid` grammar is aligned across provider and
   webhook; WABA ID, phone number ID and callback handle have **not** been
   loosened to accept padded message identifiers.
3. Migration 090 changes grants of **all explicit non-owner INSERT
   principals** on the bindings table, not only API runtime. The allowed
   columns match the intended runtime contract; operators requiring wider
   explicit INSERT grants would need a separately defined privileged
   onboarding path. This is a **deployment/authorization compatibility
   review item**, not an independently demonstrated P0/P1 exploit.
4. Real provider onboarding/account validation, consent and withdrawal
   operations, template approvals (AR/EN), live recipient link-fragment
   preservation, production key vault/backup/destruction, production rollout,
   physical Native parity and F01–F45 complete external acceptance remain
   **NOT RUN/BLOCKED**. No claim of production Meta ownership or actual
   successful delivery is made.

**Additional P0/P1 hunt:** read-only review of all cumulative changed
production paths and migration scopes found **no newly confirmed P0/P1**.
This limited negative result is not a proof that no vulnerability exists.

### W7 provisional security verdict on exact 767 source

**Previously confirmed five W7 P1/P2 defects: historical scoped evidence PASS,
not a cumulative security sign-off; W7-F33-R2 is verified open.**
**Final release/security acceptance: FIX REQUIRED / BLOCKED / NOT GO** until root suite
evidence is complete, any root failures are attributed and dispositioned,
full intended acceptance matrix and required external/operational gates are
fulfilled, and an exact final immutable source SHA remains frozen.
No code changes, push, feature merge, PR, production deploy, recipient
message or operational enablement is authorized by this W7 report.

---

## W7 supplemental defect register — W7-F33-R2 (post-767 verification)

| Field | Evidence |
|---|---|
| Status | **OPEN / VERIFIED by W1 on real PostgreSQL; W7 source independently corroborated** |
| Severity | **P2 security/reliability release blocker** (transactional retry invariant and phone-change suppression); precise exploit severity contingent on independent final negative/race tests |
| Affected frozen source | `767964267ac822aa032111b743c15149cb0c402c` and earlier implementations with the same 086/089/092 interaction |
| Authority of observed database outcome | **W1's reported real-PG reproduction**, `OUTBOUND_NO_REQUEUE`, SQLSTATE `23514`; W7 has **not** separately run that exact PG negative yet |
| W7 independent source confirmation | Migration 086 `outbound_guard_delivery` lines 251–255; migration 089 `outbound_finish_attempt` lines 36–53; migration 092 `outbound_suppress_customer_phone_change` lines 18–34 |
| Status of correction | W1 preparing **forward-only migration 093**, W4 preparing real-PG negative and competing-race tests; neither evaluated here or accepted |

### Actual failure chain and corrections to earlier threat model

1. Migration 089's finalizer intends a bounded, legitimate
   `DISPATCHING -> RETRY_WAIT` transition if the **current** attempt has
   definitive `NOT_SENT` or `DEFINITIVE_FAILURE` transport proof and the
   retry budget/deadline permit it. It updates the attempt, then the delivery,
   retaining its encrypted envelope for the next permitted dispatch.
2. But the **still-active historical migration 086** delivery trigger
   unconditionally prohibits `DISPATCHING -> RETRY_WAIT`:
   `OUTBOUND_NO_REQUEUE`, SQLSTATE **23514**. The transition therefore
   **throws and rolls the entire finalization transaction back**, even when
   Customer phone is unchanged and the provider unambiguously did **not**
   accept the message. The legitimate safe-retry path is broken.
3. Migration 092 intentionally leaves `DISPATCHING` untouched on Customer
   phone edit because transport could already have started. After a phone
   change, a negative provider finalization hits the **same 086 guard**:
   rather than committing `RETRY_WAIT`, the attempt/delivery remains
   `DISPATCHING` pending lease expiry, ultimately entering non-retryable
   `UNKNOWN`. The former W7 hypothesis that this path immediately
   *committed* a claimable `RETRY_WAIT` is **incorrect for 767** because
   the historical 086 trigger intercepts it. The current observed failure
   is **finalization rollback/legitimate retry loss** and inability to
   durably suppress negative-confirmed phone drift at finalization.
4. The sender HMAC recheck and terminal `UNKNOWN` guard still protect
   against dispatching the stale phone in the paths inspected. These
   boundaries do **not** satisfy F33's durable suppression/purge intent
   or the proven-nonacceptance retry contract.

### Mandatory W7 re-review after exact newer feature SHA is supplied

- Verify migration **093 is forward-only**; no rewriting/weakening 086–092
  checksums or permitting arbitrary `DISPATCHING -> RETRY_WAIT`.
  Authorization must require immutable **current attempt** evidence
  of actual `NOT_SENT` or `DEFINITIVE_FAILURE`, bounded budget/deadline
  and matching lease/owner, never mere caller-supplied state.
- **Unchanged phone** + valid proved negative finalization:
  `RETRY_WAIT` commits, sealed envelope retained until next eligible
  dispatch, attempts/budgets bounded; impossible without negative proof.
- **Changed phone** while `DISPATCHING`, followed by definitive negative:
  mark terminal **`SUPPRESSED`** and purge ciphertext durably, with
  no future claim or resend. Validate relevant Customer/attempt lock
  ordering and concurrent update/finish races.
- **Signed positive callbacks** before or after HTTP completion:
  provider `SENT/DELIVERED/READ` evidence wins and preserves
  `ACCEPTED`; provider-uncertain/timeout, missing or forged proof
  remains `UNKNOWN` and can **never** reenter retry; no double-send.
- Run W4's additional actual PostgreSQL finalization case, the six
  pre-existing F33 replica races, negative callback/phone scenarios and
  93+ feature unit tests, 93+ pristine migrations, restricted-role and
  tenant/ACL checks, then root PostgreSQL/non-PostgreSQL suites against
  the **same exact final SHA**, with independently reported outcomes.
- Independently inspect the exact integrated SHA in W7's own QA
  worktree; update this register with a separate evidence table and
  a new docs-only commit. **No release GO is implied by W1's pending
  fix or a future local smoke PASS.**

**Present status: FIX REQUIRED / BLOCKED — pending exact 093-containing SHA,
W4 real-PG negative/race evidence, W7 independent re-test, full cumulative
suite outcomes and previously documented external gates.**

---

## W7 post-093 independent re-review — 500a5f68 (latest evidence)

**Frozen production-source commit independently checked:**
`500a5f6802437370251cfba7d5eb8dbbfe51de77`
(`feat/automatic-whatsapp-guest-access`). This section supersedes the
historical *open* status of W7-F33-R2 at 767 **for scoped remediation only**.
The prior source findings and dated reports above remain traceable; they
must not be used to describe an unresolved bug as fixed on 767 itself.
W7 switched its own QA worktree directly to exact 500a before evaluating
the patch. No Prime changes, operator credentials, live recipients,
provider traffic, production settings, or production databases were used.

### Independently inspected source delta and threat fence

Diff `767964267ac822aa032111b743c15149cb0c402c..500a5f6802437370251cfba7d5eb8dbbfe51de77`:
the forward-only
`20261015009300_outbound_post_result_phone_fence/migration.sql`,
`packages/database/prisma/schema.prisma` matching the new attempt
flag, W4 nine-case real-PG regression, broadened migration smoke,
and validation docs. Historical migrations 086–092 were **not rewritten**.
No new Meta transport/Guest browser/UI application surface is modified.

| Security/reliability invariant | W7 evidence at exact 500a | Result |
|---|---|---|
| **W7-F33-R2: stale `DISPATCHING -> RETRY_WAIT` SQLSTATE 23514** | 093 replaces the 086 delivery guard with a narrow exception requiring the same-tenant delivery's **current ordinal** attempt to be durably `NOT_SENT`/`DEFINITIVE_FAILURE`, no provider message ID, no positive correlated callback, and no routing-uncertainty flag. W7's PG17 smoke and W4 nine-case real PG tests confirm legitimate unchanged-phone negative outcomes commit `RETRY_WAIT` with ciphertext, while direct unproven requeue still receives 23514. | **PASS scoped** |
| **Upgrading pre-existing in-flight attempts** | 093 first adds NOT NULL `recipient_routing_uncertain DEFAULT true` so old rows fail closed, then sets column DEFAULT false for new attempts. W7 authored its own *separate* pre-093 database upgrade probe: apply **92 historical migrations**; create real synthetic attempt; apply 093; old row reads **true**, new attempt reads **false**, catalog default is `false`, and forced `true -> false` UPDATE is **denied 23514**. | **PASS independent upgrade proof** |
| **Customer phone changes during `DISPATCHING`** | 093 Customer UPDATE trigger locks linked deliveries/attempts in Customer→Delivery→Attempt order and irreversibly marks active attempt routing uncertain, without leaking canonical phone or HMAC. Proven negative `DEFINITIVE_FAILURE`/`NOT_SENT` finalization becomes `SUPPRESSED`; lease and future claim cleared, ciphertext purged. W7's PG17 smoke and nine-case W4 race suite directly confirm this. | **PASS scoped** |
| **No double-send/false acceptance from uncertain transport** | `UNKNOWN` after phone drift stays terminal, envelope purged, no retry; no-proof `DISPATCHING -> RETRY_WAIT` is rejected. Pre-existing uncertain attempts are not treated as safe retry candidates. | **PASS scoped** |
| **Signed callback-first and accepted precedence** | 093 preserves 089/091's authenticated `SENT`/`DELIVERED`/`READ` precedence, including positive callback before negative HTTP completion and terminal `ACCEPTED` with envelope purge. Invalid bare ID, forged delivery timestamp, `FAILED` and absent proof cannot create a resend. | **PASS scoped** |
| **W7-P1-01, API impersonates verified provider** | Actual PostgreSQL restricted API-runtime INSERT supplying enabled/verified/evidence/revision/timestamp rejected with **42501**; legacy full-table grant repaired by 090, safe unverified onboarding and scoped updates preserved, PUBLIC grants and sender/webhook isolation checked. | **PASS scoped** |
| **W7-P1-02 and subsequent W3-P2 Meta webhook grammar** | Independent direct TypeScript probe on exact 500a: **3** bounded padded `wamid` accepted by both provider and webhook; **8** malformed/foreign/oversized IDs rejected by **both**; signed webhook WABA and phone authority IDs stay strict. | **PASS scoped** |
| **W7-F11 callback-before-crash** | PG17 signed `SENT`/`DELIVERED`/`READ` recovery `ACCEPTED`; negative/forged evidence recovery `UNKNOWN`; purge, idempotence and no replay. | **PASS scoped** |
| **W7-F33 original queued phone-drift bug** | `PENDING`/`LEASED`/`RETRY_WAIT` phone edits immediately suppress and purge, no-op/rollback and unrelated customer isolation; after permit, no stale sender confirm. | **PASS scoped** |
| **W7-K01 issuer wrongly accepts private RSA PEM** | Independent RSA-3072 public-key success and private PKCS#8, private PKCS#1 and concatenated public+private PEM fail closed. | **PASS scoped** |

### Exact W7 commands and results (own worktree, not Prime's)

| Executed validation | Result |
|---|---|
| `git rev-parse HEAD` before tests | **500a5f6802437370251cfba7d5eb8dbbfe51de77** |
| `node packages/database/scripts/outbound-migration-smoke.mjs` | **Exit 0**: **93 pristine migrations** on unique disposable local PG17 database; restricted role ACL / forged Meta binding 42501 / tenant scope / 091 crash / 092 phone drift / **093 legal retry, drift suppression, signed callback priority, UNKNOWN, no-proof deny** / purges all PASS; OFF/OFF controls |
| `pnpm exec vitest run --config vitest.config.mjs --project api-postgres-race test/whatsapp-worker-phone-change-pg.test.ts` (from `apps/api`) | **Exit 0: 9/9 PASS**, 1 file, 23.06 seconds tests, 24.20 seconds total; includes both new definitive-negative changed-vs-unchanged phone scenarios, UNKNOWN terminal, permit/confirm and two Customer/Delivery lock race tests |
| PostgreSQL test harness cleanup | `db=0 roles=0 children=0`, independent test run `run_api-postgres-race_mq0_f5c799d65571`; safe local target `127.0.0.1:5432/valet`, synthetic database names |
| `pnpm --filter @valet/api exec vitest run --config vitest.config.mjs --project api-non-postgres whatsapp-` | **Exit 0, 93/93 PASS**, 16 files |
| `node --test scripts/whatsapp-ui-freeze-guard.test.mjs` | **Exit 0, 3/3 PASS** |
| `node scripts/whatsapp-ui-freeze-guard.mjs` | **Exit 0, 126 changed paths PASS**; manifest guard unchanged |
| W7 independent stdin `node --experimental-strip-types --input-type=module -` | **Exit 0**, provider+webhook three accepted padded IDs, eight rejected malformed IDs, two invalid padded authority IDs rejected, RSA private-key negatives PASS |
| W7 independently authored **pre-093 → 093** schema/ACL negative fixture via `node --input-type=module -` | **Exit 0**, 92 migrations + 093, **old routing flag true**, **new false**, **default false**, attempts to clear old flag **23514**; disposable database and synthetic role cleanup |

W7 reviewed and invoked the **shipped SQL smoke**; W7 also independently
authored the separate upgrade-edge and TS-boundary probes through stdin.
The **W4 nine-case PG suite was actually independently run by W7**, not
merely read from Prime's report. Its run used the repository's real
`api-postgres-race` harness with its own cluster lease on localhost
5432. The protected Issue #215 full PostgreSQL suite was **not** run
or bypassed by W7. No new confirmed P0/P1 was identified in the
post-767 delta; the absence of a discovered issue does not establish
complete vulnerability coverage.

### Final decision boundary

**Security fixes against the named W7 P1/P2 findings: independently PASS
the scoped and negative real-PostgreSQL tests on exact 500a.**
**Overall final acceptance: BLOCKED / NOT GO.** At this reporting point
there is no verified successful **full root PostgreSQL** run on exact
500a and no final comprehensive root non-PG differential acceptance
from W7. Prime reports the protected root PG run remains unresolved;
it is not replaced by 93-migration SQL smoke or 9/9 W4 focused races.
Physical Native validation, real Meta onboarding/template/recipient
fragment, consent governance, key custody/backup/restore, F01–F45 full
matrix and separate activation/deployment approvals also remain outside
this scoped QA. Do not enable sending or initial issuance, push to
production, merge/deploy or interpret this report as a GO.
