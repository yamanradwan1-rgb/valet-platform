# W1 database, SQL privilege and migration evidence

Baseline: C0 `a087ad38cb249840389e5aefaefbecb47333373f`.
Scope: isolated `/valet-platform/tmp/wa-w1` worktree, branch
`feat/wa-w1-database`. New migration heads 086, 087, 088 and follow-up
forward-only 089 and the W7 P1 binding-insert ACL hardening 090; the existing
85 baseline migration files and 086-089 remain unchanged.

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
PASS: 90 pristine migrations on disposable PG; 12 outbound tables; control OFF/OFF.
```

The runner creates a unique local database, applies all 90 SQL migrations
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
