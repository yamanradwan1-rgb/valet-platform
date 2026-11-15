# Option C follow-up — Physical Resource actor-UUID T5 blocker

**Disposition: CONFIRMED SQL-boundary vulnerability; FIRST-CUSTOMER LAUNCH HOLD.**

This finding is distinct from Option C's approved S01 Staff Auth, S02 MFA,
S03 Staff Management/Onboarding and S04 anti-abuse remediation. Do **not**
silently widen the approved five-function Management writer boundary, disable
physical resource routes, or claim this issue closed by the S01–S04 cutover.

## Reproduction and scope

Worker56 independently tested a disposable, loopback-bound PostgreSQL 17.11
container, with 140/140 official migrations, isolated synthetic tenant data,
runtime role `issue416_w56_runtime`, and verified PostgreSQL system identifier
`7708431398241222691`. The verification followed an actual synthetic Staff
logout, leaving no live session and no MFA assurance. A **new ordinary-runtime
SQL connection**, with neither a raw Staff bearer nor a trusted API request,
executed all four public `SECURITY DEFINER` functions successfully:

- `management_physical_resource_create_key_slot` (6-argument variant)
- `management_physical_resource_create_key_slot` (7-argument variant)
- `management_physical_resource_create_parking_zone`
- `management_physical_resource_create_parking_spot`

All four returned `changed=true`, `result_code=OK`. The database committed two
key-slot rows, one parking-zone row, one parking-spot row and four audit events
attributed to the still-active Staff membership ID. Ordinary runtime direct
table INSERT and PUBLIC function EXECUTE were denied. Inactive membership and
disabled linked User controls each denied all four functions with SQLSTATE
`42501`, with no new rows or audit events.

This is **not** proof of an unauthenticated external HTTP route bypass. The
attacker must already be able to execute arbitrary SQL using ordinary runtime
DB authority (e.g., a SQL injection or a compromised ordinary connection) and
know eligible organization, membership and location IDs. The compromised SQL
principal can then create configuration and misleading audit attribution even
after the purported actor has logged out.

## Source-level transfer to integrated Option C

Independent Git blob comparison confirmed the four relevant migration/grant
sources are **byte-identical** between the tested branch and integrated
Option C head `39ef45e9`:

| Source | Git blob |
| --- | --- |
| `physical-resource-runtime-privileges.mjs` | `911ae678be1f9816436276016ccdd9a9ddaedd38` |
| Migration `20260929004600_mgt_232_physical_resource_creation` | `ae60aef69f5a3b5c87e3ef8bac150da1e6047e1c` |
| Migration `20261001004800_mgt_236_parking_zone_creation` | `956699f47015e27b2cb272cf69eda4c94e9aa1e9` |
| Migration `20261020009700_issue304_key_slot_label` | `1459ddf4863485cf75f97f66d4d5fb4366a68ed0` |

The shared SQL authorizer validates active membership, linked active User,
organization, subscription, location and Location Manager access. It **does
not validate a currently unrevoked, unexpired Staff session, raw access token
or MFA assurance**. Runtime provisioning explicitly restores EXECUTE on all
four functions. The approved Option C cutover revokes the separate legacy
Staff Management/Onboarding actor-UUID entries; these four physical resource
signatures are outside its retired-function list and remain available.

The actual PG17 reproduction used 140 migrations; it was **not** a mounted
HTTP replay on integrated 147 migrations. Byte-identical function/permission
sources strongly support persistence, but do not substitute for final-SHA
PG17/HTTP acceptance. No main, production or shared database was changed.

## Narrowest viable remediation options (not yet approved)

1. **Purpose-bound protected resource commands (preferred for compatibility):**
   introduce forward-only SQL overloads that accept a real session ID, User ID
   and **raw bearer** rather than trusting an actor UUID or app-computed token
   hash. Recheck the bearer digest, session freshness/revocation and membership
   ownership in the same transaction as the existing idempotent/audited
   resource mutation. Preserve SENSITIVE MFA for Company Admin CREATE and
   existing Location Manager policy. Retire legacy function EXECUTE for
   ordinary runtime, PUBLIC and inherited principals, including repeated
   provisioning and protected cutover; require genuine mounted positive and
   post-logout/cross-tenant negative HTTP/SQL tests. Extending the existing
   Management writer beyond its exact five authorized commands requires a
   distinct Owner scope/privilege approval. A separate resource writer is a
   larger, alternative boundary.
2. **Fail-closed deferral:** retire all four ordinary-runtime EXECUTE grants and
   disable the corresponding create routes/commands coherently until a
   protected replacement ships. This interrupts legitimate physical resource
   setup and cannot be treated as a transparent fix.

**Do not just REVOKE EXECUTE without a matching legitimate API replacement or
an explicitly accepted feature deferral.** No production cutover, main merge,
security-gate waiver or first-customer launch is authorized by this report.

## Remaining acceptance

Owner scope decision; implementation of selected narrow change; immutable
forward-only migration if required; real isolated PG17 fresh+upgrade,
provisioning twice, SQL-only logout impersonation denial, legitimate
Company Admin/Location Manager create and audit/idempotency, cross-tenant
negatives and identical-final-SHA CI/Security CI review.
