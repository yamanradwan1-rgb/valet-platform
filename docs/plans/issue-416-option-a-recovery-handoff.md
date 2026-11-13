# Issue #416 — Option A recovery, Owner decisions and implementation handoff

Status: **PROPOSED DESIGN / OWNER REVIEW ONLY**. This record does not authorize
authentication, reset, migration, runtime-grant, deployment or PR work.

## Recovery evidence and provenance

| Item | Verified result |
| --- | --- |
| Repo / target | `yamanradwan1-rgb/valet-platform`, `feat/issue-416-company-admin-password-reset` |
| Previous feature local and remote | `62d0a3d3f97a4186d2dd85642212efc7b4f35d42`, identical before recovery |
| Main comparison | `origin/main` `bfb4fdccf9d557c371313c9e357faa52e0a71014` at inspection; local `main` was older and unchanged |
| Legacy original | `2323544bc41be2b99bc2f79dd25910e6ad5f30a7`, `docs/416-legacy-closure`, `D:/v416ops` |
| Lock original | `29cfadcb9b64d4fb96787379765c16ededef84d8`, `docs/416-lock-closure`, `D:/v416locks` |
| Commit dependency | Both original commits have the same parent, previous feature HEAD `62d0a3d3`; both add one distinct Markdown file, no source or migration |
| Recovered legacy integration | `06cc29e0` (`git cherry-pick -x`); original cutover file bytes identical after integration |
| Recovered lock integration | `940cc907` (`git cherry-pick -x`); original locks file bytes identical after integration |
| U1 original / integrated | `7ff44a115a15a75c77f838ff343aadd0948b77e3` / `1682c5ab`; only `docs/plans/issue-416-option-a-key-custody.md`, source-backed 237-line contract, original bytes retained |
| U2 original / integrated | `e78638bb90fa2a83cea586124951ec0ef734844d` / `327b2f04`; only `docs/plans/issue-416-option-a-writer-inventory.md`, source-backed command/writer/SQL inventory; integration changed three Codex-local lock document path mentions to repo-relative paths for portability |
| Other pre-existing draft | `D:/v416writers` contains an untracked `issue-416-option-a-writer-sql-index.md`; leave that separate worktree/draft unchanged and treat as evidence only after inspection |
| Unrelated local state | Root `main` contains two unrelated untracked runbooks; preserve unchanged |

The recovered documents are
[legacy admission and cutover](issue-416-option-a-cutover.md) and
[lock/retry closure](issue-416-option-a-locks.md). The additional
[U1 key custody](issue-416-option-a-key-custody.md) and
[U2 typed writer inventory](issue-416-option-a-writer-inventory.md) are
now integrated as documentation. Their conclusions are
**proposed and source-inspected**, not Owner-accepted or executable proof. Prior
[Auth](issue-416-option-a-review-auth.md),
[SQL](issue-416-option-a-review-sql.md) and
[Ops](issue-416-option-a-review-ops.md) reviews are historical reviews of an
earlier draft. A new review must cite the final revised aggregate commit.

## Scope and security invariant

Option A — **authenticated narrow SQL writers** — is the selected direction.
Current opaque `vsa1`/`vsr1`, Staff Login/Refresh/MFA failure and replay
semantics, current exact Company Admin/tenant/entitlement/5-minute MFA proof,
15-minute reset link expiry, copy-once disclosure, accepted audit scopes and
migration 112 remain binding. SQL authority over existing session IDs, access
hashes, factor rows, memberships or entitlement rows cannot fabricate a valid
issuer or verification ceremony. No future reset API or UI exists yet.

**Important proposed internal-design difference from approved Issue #416 v9:**
v9 specifies raw Staff bearer verification by a narrow SQL definer **subject
to real log confidentiality proof**, and says to retain existing narrow runtime
session/refresh/push column UPDATE grants. The selected Option A design instead
proposes application-verified, purpose-bound command proofs and migration of
sensitive direct auth/authority writes behind narrow SQL commands. The Owner's
later Option A direction selects the investigation path; it does not establish
implemented provenance, approve a proof-key trust root, or waive v9's publicly
observable reset and Staff Auth contracts. The detailed change in SQL proof
boundary and grant-retirement scope requires explicit final security-contract
acceptance before implementation. Do not silently mix the old bearer path with
the new command path or infer accepted SQL privilege changes from this proposal.

The v9 lock sketch (email → User security → session/User MFA → Organization)
also differs from the recovered proposed replacement ranking that takes
all required advisory locks before ordered entity rows. This is a source-driven
candidate correction, not a proven deadlock-free SQL design or authority to
change an Accepted public business rule. No generic arbitrary command payload
is permitted.

## Minimal material Owner decision register

| Decision | Recommended option and factual basis | Security / operating consequence | Blocks |
| --- | --- | --- | --- |
| **U1 — proof-key custody/trust root** | Approve only a verified injection/provisioning arrangement that keeps application signing and SQL verifier material away from ordinary runtime SQL and from function source/migrations/GUCs; require bounded verified rotation and independent secure recovery. Exact feasible mechanism must be determined from actual deployment evidence. | Poor custody lets SQL-only callers fabricate authenticated commands; more restrictive custody adds release and backup-restore operations and outage recovery burden. | Proof schema/command implementation, cutover readiness |
| **L1 — legacy authority and MFA admission** | Approve selective independent baseline per User/password, Organization, membership/grants, entitlements, ACTIVE factor/code generation, and HOLD/recovery; revoke all legacy Staff sessions and retire pending enrollment. Existing SQL permissions cannot prove historical ceremony provenance. | Prevents unproven legacy authority from being laundered by fresh login; requires verified roster/commercial records, case staffing and legitimate-user recovery. Blanket trust weakens security; blanket mass reset is disruptive. | First production authority admission and bootstrap |
| **L2 — drained irreversible cutover/rollback** | Approve fully drained auth-sensitive downtime, mandatory proof-compatible N/R artifacts, privilege closure and backup/restore rehearsal; if R impossible, explicitly decide secure outage/fix-forward or postpone. Repository does not attest actual topology, backup/restore or RPO/RTO. | Eliminates mixed old/new writers; operational interruption, fresh sign-in, pending-MFA restart and support burden require an actual release window and communication. | Deployment/release and rollback approval |
| **S1 — replace the v9 internal SQL proof/grant mechanism** | Approve a source-reviewed purpose-bound command proof and coordinated retirement of *all* weaker runtime-sensitive columns and SQL signatures while preserving v9 external behavior. The source currently exposes direct session/MFA writers and callable authority-changing definers; the old raw-SQL-bearer plan lacks production logging attestation. | Stronger SQL-only attacker boundary only if U1/U2 and old provisioners are closed; high implementation/migration complexity and risks to Web/native refresh/MFA without specific regression gates. | Final command/privilege migration design acceptance |

L1/L2 are described in the recovered cutover contract. The integrated U1
contract confirms the source has no complete protected SQL-verifier key delivery,
at-rest/backup/restore attestation or named operator; U1 cannot be declared
closed without real evidence. U2 inventories A01–A11, M01–M15, P01–P05 and
future reset R01–R03 with source paths, callable SQL signatures, DML, locks,
authentication source and retry/retirement tests. Closed strict per-purpose
payload schemas, deployed effective grants, all external operator/entitlement
writers and actual PostgreSQL concurrency remain unverified. Internal SQL
naming/file splits are engineering decisions, not additional Owner votes.

## Required implementation sequence after separate authorization

1. **Contract freeze and owner sign-off.** Obtain U1/L1/L2/S1 approval, reconcile
   Issue #416's v9 SQL mechanism with Option A and finalize the actual signed
   closed-purpose payload/writer inventory; preserve the exact public reset DTOs,
   numerical quotas and lifetime. Pin fresh `origin/main` and assess conflicts.
2. **Attested custody, proof and anti-oracle tests.** Provision protected keys
   under controlled operator identity in isolated infrastructure, define
   transactional challenge/receipt/retirement barriers and prove real
   password/refresh/TOTP/recovery ceremony provenance cannot be forged from
   database-readable facts.
3. **Single DB migration owner.** Add only forward-only authenticated writers,
   private state, effective ACL/overload retirement, updated provisioning and
   verification; retain audit reservation migration 112. Assert fresh and
   upgraded PostgreSQL 17 behave identically after reprovisioning, and stale
   binary/provisioner cannot re-enable weak writers.
4. **Auth/authority writer migration.** Migrate all Login/Refresh/Logout/MFA,
   management/onboarding/activation, Organization/entitlement and controlled
   operator/cleanup paths with their exact ceremonies, locks and receipts.
   Preserve existing lost-refresh/replay family revocation and exact-session
   pending enrollment semantics, audit attribution and tenant boundaries.
5. **Real race, recovery and deployment rehearsal.** Execute paired PG17
   commit/rollback/disconnect/unknown-COMMIT, role/tenant/last-admin, credential
   lineage, key retirement/stale-replica, backup/restore and N/R startup tests
   under attested disposable resources. Verify effective roles, no secret logs,
   no deadlock and bounded timeout safety; review failures before proceeding.
6. **Only then implement Issue #416 reset.** Separate reset-only DDL, protected
   status/issue/public redeem, durable anti-abuse before body parsing,
   generation/CAS, copy-once 15-minute URL, atomic password/session/refresh/
   push/audit, standalone privacy-safe Dashboard page, AR/EN accessibility and
   browser proof. This phase is **not authorized by this task**.
7. **Release gate.** Independently review implementation and run real API/PG/
   browser/CI same-SHA evidence. Obtain separate Owner authorization for PR,
   merge, migration and deployment. Do not infer production safety from docs.

## Validation and review ledger

| Boundary | Current evidence |
| --- | --- |
| Original commits and base | PASS — Git object existence, common parent, file-only diffs verified |
| Cherry-pick preservation | PASS — no diff of either original file against integrated tree |
| U1/U2 docs integration | PASS — reviewed worker changes, each single intended file, local commits integrated with original provenance, no runtime effect |
| Documentation consistency | Source/document inspection; static planning review and final independent disposition recorded separately |
| New proof, MFA and SQL provenance | **NOT RUN** — no authentication or database execution authorized |
| Production secret/deployment custody | **BLOCKED** — operator/runtime environment not attested |
| PostgreSQL 17 lock and cutover tests | **NOT RUN** — future executable acceptance only |
| New independent final reviews | **PENDING** — historical draft reviews are not aggregate approval |
| Reset API/UI and production rollout | **NOT RUN / NOT AUTHORIZED** |

Do not label the design implementation-ready based on prose, previously
successful audit-reservation tests or an unreviewed worker report.
