# Issue #416 Option A operations and concurrency review

Status: Independent design review. DECISION REQUIRED.

## Review target and evidence

Reviewed the working draft `issue-416-option-a-authentication-provenance.md`
against feature HEAD `350d88b090c9dbe1f8d7fa29d6390e28afa9ae19` and inspected
source at that HEAD. The proposal is uncommitted at review time. This review
covers legacy authority, rollout, key operations, uncertain commits and lock
compatibility. It does not approve the earlier audit reservation as an
authentication architecture.

Checked AGENTS.md, source-of-truth and structure rules, canonical DEC-023/025,
and focused DEC-072/075/076/078/079/080/081. The Owner selected Option A's direction.
The command protocol, key custody, legacy transition and lock migration are
proposed internal decisions.

No PostgreSQL operation, impersonation reproduction or authentication-provenance
test was executed for this review. Evidence below is source inspection.

## Findings

### MAJOR O-01 — Management lock order is summarized incorrectly

Location in the reviewed draft is the management row at line 188.

The row says management is org-first. The normal Company Admin entrypoint in
`apps/api/src/modules/management/management-authorization.ts:108` calls
`requireMfaAssuranceInTransaction` before the Organization advisory lock at
line 113. That assurance helper calls the session/User row-lock helper.
The sensitive Location Manager path similarly takes assurance before the
Organization lock in `staff-management-authorization.ts:77` and `:83`.
SQL management functions can also be invoked through other entrypoints with
their own ordering. An organization-only summary loses that distinction.

An incomplete source graph could guide an incompatible lock migration despite
the draft's explicit U2 blocker. Correct the row to name the exact API and
SQL-only entrypoints, their full acquired-resource prefixes, and the downstream
factor locks. Preserve U2 until the complete call graph is reviewed.

Acceptance requires a source-verified matrix per entrypoint and real two-connection
tests for both orderings. Each competing transaction must commit and roll back
in separate cases. Lock timeout/deadlock results must retain bounded errors and
leave protected state consistent.

### MAJOR O-02 — The legacy trust bootstrap needs an explicit authority baseline

Locations in the reviewed draft are lines 150–154 and 207–213.

The draft correctly says a new password login cannot cure untrusted policy and
defers factor provenance. The rollout then specifies legacy-session revocation
and conditional factor preservation without defining how existing identity,
membership, Organization and entitlement state becomes trusted after closure
of their former writers. Closing a writer prospectively does not establish the
origin of state it previously created.

Extend U2 to require a legacy trust inventory for each authority-bearing object.
For each class, identify the accepted retained trust source, any controlled
validation or replacement ceremony, and the policy when provenance is unavailable.
Do not automatically label every existing row authentic, or silently rewrite
historical business/security data. A forced login and MFA alone must not close
that inventory.

Acceptance requires independent review of the selected legacy policy, a
representative existing-data migration fixture, and tests showing that
pre-cutover state lacking the required provenance cannot acquire reset authority.
The rollout remains blocked until the policy is explicit.

## Operations assessment

The drained cutover is a defensible proposal. It requires approval because it
revokes existing sessions and affects Staff sign-in availability. The draft
truthfully labels it PROPOSED.

| Area | Assessment and required closure |
| --- | --- |
| Mixed versions | Migration, privilege provisioning, API replicas, background consumers and operator tooling must be version-inventoried. No old replica may resume after restrictive ACL cutover. Test stale binary startup and stale provisioning against the final schema. |
| Legacy sessions | Revoke exact legacy sessions and clear their active push endpoints atomically or under a documented drained migration contract. Resolve O-02 before selecting which factors, codes and business-authority rows survive. |
| Key custody | U1 must name the provisioning operator, protected app injection, SQL-owner access, backup access and at-rest controls. A private SQL table's ACL does not prove backup or storage confidentiality. |
| Key rotation | Define which transaction selects keyId, how replicas learn signing-key retirement, and how stale replicas fail. The proposed 30-second overlap must derive from enforced proof expiry and clock policy. A key must never be resurrected during rollback. |
| Key outage | Preserve the proposed infrastructure-failure behavior. Explicitly distinguish failure before mutation from a lost acknowledgement after commit. Recovery must reread protected receipt/state through the approved command boundary. |
| Rollback | The draft correctly requires a proof-capable rollback target. Disabling reset alone cannot make a pre-cutover authentication binary compatible with revoked DML rights. If no compatible version exists, the selected secure-outage/fix-forward policy must be approved and rehearsed. |
| Deadlines | The ordinary pool enforces three-second statements and two-second lock/idle limits. The proposed 30-second proof lifetime grants no longer transaction budget. Validate abandoned challenge cleanup after timeout, disconnect and process loss. |
| Secrets | Receipt reconciliation may return approved nonsecret facts. It must not redisclose reset links or recovery codes. Ephemeral login/refresh candidates and committed-but-lost responses need purpose-specific handling under U2. |

## Current source and race acceptance matrix

The following table records source behavior and missing proof. It selects no new
locking mechanism. All rows are UNRESOLVED U2 for the proposed migration.

| Transactions A and B | Current sequence and authoritative objects | Interleaving to resolve and required acceptance |
| --- | --- | --- |
| Login and password reset/disable | Login verifies Argon2 outside its transaction, then User-security advisory and User row in `staff-user-security-lock.ts:25`. Reset/disable also depends on that global User boundary. | B may change password/status after A's initial verification. A must recheck the exact verified password version under the compatible boundary before creating a session. Commit rejects stale proof, rollback permits a fresh valid decision, uncertain B commit requires authoritative reread. |
| Refresh and refresh | `staff-auth.service.ts:189` takes User-security before refresh/session/User rows and consumed-lineage checks. | Preserve DEC-072's single rotation winner and consumed replay-family revocation. Receipt retry must not convert the existing replay behavior into a second successful rotation. Include lost COMMIT acknowledgement and process loss. |
| Refresh and logout | Refresh takes User-security then refresh/session/User. Logout in `staff-auth-logout.ts:16` takes refresh/session rows before push updates. | Map rows and wait edges for both command entrypoints. A rotation must not revive a revoked parent or make an old refresh usable. Commit/rollback winners must preserve exact family semantics and push terminalization. |
| MFA and logout/disable | MFA takes session/User rows, then mfa-user advisory, factor and optional recovery rows. Disable takes User-security then User/sessions/push. | An assurance proof verified before revocation must be rechecked at its protected write. No committed revoke can be overwritten by delayed assurance. Test factor/session lock competition, both rollback branches and acknowledgement loss. |
| MFA and controlled factor recovery | `tools/mfa-recovery/persistence.ts:49` locks User, then mfa-user, then factor. MFA similarly uses row and advisory locks, with exact session assurance. | Factor retirement must invalidate proof tied to the old factor. A stale operation cannot reactivate retired material or advance assurance. The controlled operator path needs explicit compatibility and provenance rules. |
| Management and MFA/factor lifecycle | API assurance locks session/User before Organization; nested SQL may then lock memberships/admin factors. See O-01. | Map each API and direct function chain. Prevent a new factor-first/Organization-first cycle. Revalidate role and factor at the proposed linearization point. Exercise former entrypoints after their EXECUTE grants are removed. |
| Onboarding/activation and reset | Onboarding uses email, sorted User-security locks, Organization, then membership/User/invite. Activation calls `staff_onboarding_lock_identity` before Organization. | No second membership can commit between sole-company validation and reset mutation. Preserve all-status counting and allow many Location grants. Cover commit, rollback, and target identity changes. |
| Push registration and reset/logout | `staff-push-registration.service.ts:90` rechecks under User-security/session locking, then takes sorted registration keys. Revocation disables active registrations and clears provider tokens. | No active registration may survive a committed reset through a delayed register/confirm. If registration wins, revocation must include its new row. If revocation wins, the old parent must fail current session proof. |
| Key retirement and command execution | Candidate proof binds keyId, challenge, backend and transaction. Final key-state checks and lock ordering are not yet specified. | Define whether an already verified in-flight command may commit after emergency retirement. Exercise retirement commit/rollback and stale replica behavior. The proposed immediate-invalidity statement needs a precise database boundary. |
| Receipt retry and unknown commit | `postgres-transaction.ts:40` sends COMMIT. A COMMIT error marks outcome UNAVAILABLE and destroys the connection at `:44` and `:65`. | This is uncertainty classification, not proof of rollback. Specify per-command reconciliation from a new connection with fresh authorized proof. Do not issue replacement secrets or choose a new operation identity automatically. |

U2 must define the full resource ordering, guarded-write predicate and
linearization point for each row. Actual tests must cover competing commit,
competing rollback, timeout/disconnect and client uncertainty. A uniqueness
constraint or transaction wrapper alone does not prove these outcomes.

## Verdict

No operational implementation is approved by this review. The candidate's
explicit BLOCKED status is appropriate. O-01 needs a factual correction and O-02
must become explicit U2 acceptance work. U1 and U2 remain material decisions.
Their closure requires another independent design review before source changes.

The audit reservation review and its PostgreSQL tests provide evidence only for
the reserved event append policy. They do not satisfy the authentication,
key-custody, migration, concurrency or browser gates.

DECISION REQUIRED.
