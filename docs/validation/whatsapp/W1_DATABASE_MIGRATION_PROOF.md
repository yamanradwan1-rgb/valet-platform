# W1 database, SQL privilege and migration evidence

Baseline: C0 `a087ad38cb249840389e5aefaefbecb47333373f`.
Scope: isolated `/valet-platform/tmp/wa-w1` worktree, branch
`feat/wa-w1-database`. New migration heads 086, 087, 088, forward-only
089, W7 P1 binding-insert ACL hardening 090, W7 F11 authenticated crash
recovery 091, W7 F33 phone-change suppression 092, and F33 post-result
fencing 093; prior migrations 086-092 remain unchanged.

## Reproducible verification

Command from repository root:

```powershell
node packages/database/scripts/outbound-migration-smoke.mjs
```

Observed on local Windows PostgreSQL 17, disposable database:

```text
PASS: API/sender/webhook effective privileges, PUBLIC guards, envelope/custody denial.
PASS: issuer scoped customer/consent/event/control FOR SHARE helpers, forbidden direct access.
PASS: tenant FK, uniqueness, switch, consent, inherited policy permit, phone/revision fence, callback dedupe, purge.
PASS: Location override inserted after company-only issuance suppresses send.
PASS: stale DISPATCHING -> UNKNOWN, attempt fenced, envelope purged, no repeat claim.
PASS: callback after NOT_SENT/RETRY_WAIT cancels resend and purges ciphertext.
PASS: revoked consent suppresses PENDING delivery and purges ciphertext.
PASS: forward-only 090 repairs previously provisioned full-table API INSERT in place.
PASS: API Meta binding forged/explicit verification, enable, version and timestamp INSERT 42501; safe disabled onboarding and scoped edit PASS.
PASS: signed SENT/DELIVERED/READ callback crash -> ACCEPTED; FAILED/forged timestamp/bare ID/no proof -> UNKNOWN; purge, no resend, idempotent.
PASS: phone drift transactional rollback, no-op, 3 undispatched suppression/purge, in-flight UNKNOWN recovery, customer scope.
PASS: post-dispatch changed-phone definitive/NOT_SENT -> SUPPRESSED, UNKNOWN/ACCEPTED preserved, same-phone retry retained.
PASS: 93 pristine migrations on disposable PG; 12 outbound tables; control OFF/OFF.
```

The runner creates a unique local database, applies all 93 SQL migrations
in order and drops it in a finally block. It creates and drops three fresh,
no-inheritance synthetic API, sender and webhook PostgreSQL roles. Catalog
ACL checks verify PUBLIC, effective role table/function permissions and
forbidden ciphertext/custody access. Actual sender SELECT on the envelope
table returns PostgreSQL 42501. Tenant FK and unique-intent negatives return
23503 and 23505 respectively; wrong HMAC returns P0001. OFF control
prevents claiming. A good permit increments ordinal once. Consent, policy
revision, current canonical phone and callback recipient bind before send.
An effective Location override added after company-only issuance suppresses
its original intent; override creation synchronizes through a company policy
row lock. Crash recovery makes a previously dispatched but expired lease
UNKNOWN, retains its attempt ordinal, purges ciphertext and never reclaims
the uncertain send. Signed late callbacks cancel queued retries, and
withdrawn permission suppresses unsent deliveries and purges their envelopes.
Callback-first DELIVERED deduplicates; ACCEPTED retains facts and purges
encrypted envelope. No network provider calls or real recipients are used.

W7 P1 remediation adds 090 without rewriting earlier migration history:
the API runtime's legacy table-wide provider-binding INSERT (which allowed
fabricating a provider-verified, enabled binding at creation, despite the
UPDATE-only scope trigger) is removed from existing non-owner direct grantees
and replaced by INSERT on `id`, `organization_id`, `purpose`, `provider`,
`environment`, `waba_id`, `phone_number_id` and `config_alias` only. Runtime
provisioning also revokes stale table/column grants before applying the exact
whitelist; its role verification checks every binding INSERT column against
this allowlist. The disposable PG test re-grants the legacy vulnerability,
replays 090, checks the fixed ACL, and uses real `SET ROLE` statements to
prove denied verified/enabled/explicit-default/version/timestamp INSERT with
SQLSTATE 42501. Valid unverified, disabled provider onboarding and a scoped
config revision update still succeed. Operator-only verification remains
outside the API runtime role.

W7 F11 independent regression (before 091) reproduced SQL-level corruption:
after an authenticated `SENT` callback with immutable event evidence, the
delivery remained `DISPATCHING`; expired-lease recovery changed its state and
attempt to `UNKNOWN` although `sent_at` and the correlated event existed.
Forward-only migration 091 updates `outbound_cleanup_stale(integer)` to lock
each stale delivery, inspect correlated immutable event and matching attempt
for `SENT`, `DELIVERED` or `READ`, and terminally reconcile deliveries and
proven attempts as `ACCEPTED`, with `accepted_at` set and leases cleared.
It deletes encrypted envelopes and never makes a delivery retryable. Without
signed positive event the conservative `UNKNOWN` fallback remains: `FAILED`
events, a fabricated `delivered_at` timestamp, a bare provider ID without
an immutable positive event, and no callback are
explicit negative real-SQL cases. The regression executes recovery under
the restricted sender role, verifies repeated recovery is a no-op, and
never queues any recovered delivery for another send. It introduces no new
function, role or table grant.

W7 F33 was previously a Customer phone-drift leak: PENDING messages could
retain encrypted envelopes despite W4's final HMAC preflight blocking sends.
Forward-only 092 adds an AFTER UPDATE OF phone_normalized trigger gated by
OLD.phone_normalized IS DISTINCT FROM NEW.phone_normalized. Its scoped
SECURITY DEFINER function locks Customer indirectly via the owning UPDATE,
then only linked Delivery rows (same old organization and Customer), and
atomically marks PENDING/LEASED/RETRY_WAIT as SUPPRESSED, clears leases and
retry times, and purges ciphertext. A no-op leaves outbox untouched. Existing
DISPATCHING attempts are never misclassified as NOT_SENT or requeued; the
signed-evidence 091 expired-lease recovery later decides ACCEPTED/UNKNOWN
and purges. No HMAC secret, raw phone or new table grant enters SQL.

Race proof: W4's committed six-case real PostgreSQL test
`apps/api/test/whatsapp-worker-phone-change-pg.test.ts` (W4 commit
`41407274`) ran from the independent W4 worktree in read-only mode with
`W4_SQL_SOURCE_ROOT` set to W1's local migration source (including 092).
All 6 cases PASS in 93.59s against six independently disposable databases:
pre-claim PENDING, LEASED, no-op, DISPATCHING confirm/recover UNKNOWN,
held-Customer-lock vs permit, and open-claim transaction vs phone UPDATE.
No deadlock or redispatch occurred. W1's 92-migration smoke independently
asserts rollback restores state and envelopes, successful same-Customer
suppression across three statuses, other-Customer isolation, and UNKNOWN
recovery of a previously dispatched attempt.

W7 F33 post-result P2 follow-up: 092 conservatively left DISPATCHING
unchanged. A new real PostgreSQL negative test on 092 showed the 089
six-argument finalizer attempting a definitive NOT_SENT/DEFINITIVE_FAILURE
transition to RETRY_WAIT but raising PostgreSQL 23514 OUTBOUND_NO_REQUEUE
from the original 086 delivery guard. The transaction rolls back, retaining
DISPATCHING and its envelope until UNKNOWN-on-expiry. This masks the
potential post-phone-change retry and also prevents legitimate
unchanged-phone retries that 089 intended.

Forward-only 093 adds monotone `recipient_routing_uncertain` evidence to
the sender-owned `outbound_message_attempts` table (NOT NULL). Existing
pre-upgrade attempts default to TRUE because any in-flight 092-era phone
change is unknowable; the column's default is then changed to FALSE for
freshly issued, known-current attempts. A pre-upgrade definitive negative
thus fails closed rather than reusing a potentially stale recipient, even
if that conservatively forgoes one legitimate retry. The Customer phone
trigger now sets this flag for in-flight
DISPATCHING attempts while holding Customer -> Delivery -> Attempt locks,
without changing the in-flight state or retaining phone/HMAC material. The
089 finalizer's established signed-positive callback/ACCEPTED precedence
remains untouched. A definitively NOT_SENT or DEFINITIVE_FAILURE result
with the drift flag now becomes terminal SUPPRESSED, clears the lease and
purges the sealed envelope. UNKNOWN still goes terminal UNKNOWN; accepted
messages remain ACCEPTED. On an unchanged phone, the original bounded
RETRY_WAIT outcome remains supported for new, unchanged-phone attempts.

093 fixes the contradictory 086 trigger with an intentionally narrow,
**proof-backed** exception: only a DISPATCHING -> RETRY_WAIT transition
whose *current ordinal* attempt belongs to the same delivery and tenant,
has persisted NOT_SENT/DEFINITIVE_FAILURE, has no provider message ID,
has no matching positive signed callback, and has no phone-drift flag can
proceed. The immutable terminal states remain blocked. W1's actual
restricted sender role and real SQL assert both six- and seven-argument
finalization, positive/callback precedence, unknown safety, the matching
attempt requirement, a denied unproven direct retry (SQLSTATE 23514),
flag monotonicity (SQLSTATE 23514), and envelope purge. No existing role
grants are expanded and no original migration was rewritten.

Schema validation (requires a local test MIGRATION_DATABASE_URL and NODE_ENV
set to test): `pnpm exec prisma validate --schema prisma/schema.prisma`.
Observed: `The schema at prisma/schema.prisma is valid`, Prisma 7.9.1.
Offline `pnpm install --frozen-lockfile --offline` passed without edits to
the tracked lockfile.

## Frozen SQL integration interfaces

Issuer persists one intent with `company_policy_revision`, selected
`policy_revision`, one delivery and one RSA-OAEP ciphertext in the Intake
serializable transaction. Sender uses `outbound_claim_due(integer)`,
`outbound_lease_recipient(uuid,uuid)`,
`outbound_dispatch_permit(uuid,uuid,text)`,
`outbound_confirm_dispatch(uuid,uuid,uuid,text,text)` (fifth argument
is the exact canonical phone), `outbound_finish_attempt`,
`outbound_recover_expired(integer)` and
`outbound_purge_expired_envelopes(integer)`. Webhook uses
`outbound_resolve_meta_binding(text,text,text)` and
`outbound_record_provider_event(uuid,uuid,text,text,text,timestamptz,text,text)`.
These are migration-owner SECURITY DEFINER functions, available only to
the relevant provisioned role with an explicit safe search_path.
The runtime issuer additionally calls
`outbound_read_intake_customer(uuid,uuid,uuid)`,
`outbound_read_intake_permission(uuid,text)` and
`outbound_read_intake_issue_control(text)` to acquire three narrow
transactionally locked snapshots. The permission helper returns the
immutable evidence event matching the current permission revision.
Restricted PostgreSQL roles can execute these three helpers while direct
Customer/permission/control FOR SHARE and permission-event SELECT are denied.

API runtime can update company-owned policy/binding fields after the
separate Company Admin/MFA HTTP authority gate, but cannot edit global
control or provider verification evidence. Sender can never update Guest
generation or custody state and cannot arbitrarily read ciphertext rows.
Before HTTP transport it must also recompute the HMAC recipient digest from
the fetched canonical Customer phone and use the five-argument confirm.
Meta ownership evidence is null by default; both lease and send require it.

## Explicit boundaries

Not proved by this local W1 suite: W2 complete Intake rollback/lock inversion,
W4 multi-process kills and provider uncertainty at each crash point, W5
Meta signature/schema conformance with real provider, W6 physical Native
parity, migration rollouts on production, backup/private-key destroy policy,
actual recipient opt-in/withdrawal operation, approved AR/EN templates or
WhatsApp fragment preservation. Release cannot be marked production-ready
from these synthetic PostgreSQL results alone.
