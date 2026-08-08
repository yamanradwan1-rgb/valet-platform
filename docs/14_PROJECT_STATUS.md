# VAYLET — Current Project Status

> Operational handoff snapshot only. This file is not a binding product/domain contract.
> For current repository facts, GitHub wins. For accepted behavior, use the authority order in `AGENTS.md` and the binding docs.

## Last Verified

- Date/time: `2026-08-08 20:16 +03:00`
- Repository: `veletpro0-lgtm/valet-platform`
- Verification basis: current GitHub branch/docs/Issue state plus the human-reported local stash state for VAL-002B

## Current Milestone

**Product-contract rebaseline before continuing Phase 1 implementation**

Phase 0 bootstrap is complete. Phase 1 database work began under the previous product contract, then was intentionally paused before commit/PR when Founder & Product Blueprint v1.0 became the approved product direction.

## Completed

### Phase 0 — Bootstrap

- PR #1 — `chore: bootstrap monorepo foundation`
- Status: **MERGED**

### VAL-002A — Lock previous Phase 1 Database Contract

- Issue #2
- PR #3 — `docs: lock Phase 1 database contract`
- Status: **COMPLETED / MERGED**

Its decisions remain historical context but are superseded where Founder & Product Blueprint v1.0 and the accepted rebaseline decisions explicitly changed them.

## Current Task

### VAL-002R — Rebaseline Product Contracts to Founder Blueprint v1.0

- Issue: **#6 — OPEN**
- Owner: `veletpro0-lgtm`
- Branch: `docs/VAL-002R-blueprint-v1-rebaseline`
- Branch status: **PUSHED / active docs work**
- Scope: **docs/product-contract only**
- Application code changes: **not allowed**
- Prisma/migration changes: **not allowed**

Primary work:

- record OLD vs NEW product decision matrix
- update source-of-truth/authority order
- align MVP/V2/Enterprise boundaries
- align roles/identity boundaries
- align ValetSession physical lifecycle
- separate Hybrid Dispatch task lifecycle from ValetSession state
- bring assistive OCR/ANPR into sellable MVP with manual fallback
- make condition photos optional by default/configurable
- bring Maps + task-scoped session tracking into sellable MVP
- align secure handoff to Dynamic QR OR 4-digit pickup code
- align payments/cash/validation/tips scope
- establish Configuration First: Company default -> Location override
- align internationalization/offline/reliability expectations
- align development sequence

Rebaseline bridge:

- `docs/15_BLUEPRINT_V1_REBASELINE.md`

## Preserved Implementation Work

### VAL-002B — Tenant & Staff Database Foundation

- Issue: **#4 — OPEN**
- Branch: `feat/VAL-002B-tenant-staff-db`
- Remote branch exists
- Current project status: **BLOCKED / PRESERVED pending VAL-002R merge**
- Open PR: none at the time of this handoff

The local coding agent completed an uncommitted implementation against the pre-rebaseline contract. The human contributor preserved all changes using:

```text
VAL-002B pre Blueprint v1 rebaseline
```

Git stash contents are local-only and are not a GitHub backup. Do not delete/drop that stash until the work is restored and safely committed after rebaseline.

Reported preserved work includes:

- Organization
- Location
- User
- OrganizationMembership
- MembershipLocationAccess
- Shift
- initial Prisma migration
- tenant-integrity constraints
- restrictive deletes
- normalized-email protection
- shift time/order protection
- one-active-shift partial unique protection
- PostgreSQL integration tests
- Prisma 7 configuration
- PostgreSQL CI support

Expected post-rebaseline adjustments include at minimum:

- add `VALET_SUPERVISOR` membership role
- preserve `ORG_ADMIN` as the internal name for Blueprint Company Admin
- add/align Location timezone + currency according to the updated Phase 1 contract
- do not invent Venue Client persistence
- do not model VAYLET Super Admin as an OrganizationMembership
- preserve reusable tenant/shift/constraint work unless the new binding contract explicitly changes it

## Accepted Rebaseline Highlights

Canonical ValetSession physical lifecycle for future implementation:

```text
CHECKING_IN
-> AWAITING_PARKING
-> PARKING
-> PARKED
-> REQUESTED
-> RETRIEVING
-> READY
-> HANDOFF_PENDING
-> COMPLETED
```

Hybrid Dispatch uses a separate Task lifecycle:

```text
QUEUED -> ASSIGNED -> ACCEPTED -> IN_PROGRESS -> COMPLETED
```

Current tenant membership role contract:

```text
ORG_ADMIN
LOCATION_MANAGER
VALET_SUPERVISOR
VALET_EMPLOYEE
```

Other actor boundaries:

- Guest/Customer: not OrganizationMembership
- VAYLET Super Admin: platform-level, schema deferred
- Venue Client: approved actor, persistence/access schema deferred

## High-Contention Ownership

Current rebaseline modifies high-contention binding docs.

Treat `VAL-002R` as single-owner until its PR is reviewed/merged.

Database schema/migrations remain reserved for the paused `VAL-002B` work; do not start a second independent migration task while that preserved work is unresolved.

## Current Blockers / Dependencies

`VAL-002B` must not be committed/PR'd against the old contract before `VAL-002R` is merged and its impact is applied.

Do not start the next independent database slice until VAL-002B is restored, adjusted, reviewed and merged or explicitly re-planned.

## Exact Next Step

For `VAL-002R`:

```text
finish consistency review
-> open PR from docs/VAL-002R-blueprint-v1-rebaseline to main
-> CI
-> review docs against Issue #6 + Blueprint rebaseline bridge
-> human merge decision
```

After `VAL-002R` merges, on the contributor machine:

```powershell
git checkout main
git pull --ff-only origin main
git checkout feat/VAL-002B-tenant-staff-db
git merge --ff-only main
```

Then restore the preserved implementation carefully:

```powershell
git stash list
# verify the stash message before restoring
git stash apply stash@{N}
```

Prefer `stash apply` first rather than `stash pop` so the backup remains until the restored work is verified.

Then:

```text
review VAL-002B against updated docs
-> make only required rebaseline adjustments
-> fresh PostgreSQL migration verification
-> pnpm lint
-> pnpm typecheck
-> pnpm test
-> pnpm build
-> review diff
-> commit
-> push
-> PR
-> CI
-> domain/security/database review
-> human merge decision
```

Only after the restored work is safely committed and verified should the preserved stash be dropped.

## Parallel UX/UI Track

Product design work may proceed in parallel where it does not modify current high-contention code/contracts.

Current product has three core surfaces:

1. Valet Employee App / terminal
2. Guest web experience
3. Management / Operations Dashboard

Design direction may establish UX architecture, flows, wireframes and design system before frontend implementation. Frontend implementation should remain feature-by-feature with the corresponding backend/domain capability rather than implementing the entire mocked UI first.

## Human Handoff Notes

- Founder & Product Blueprint v1.0 is the newest approved product direction.
- `docs/15_BLUEPRINT_V1_REBASELINE.md` records its implementation-relevant bridge inside the repository.
- GitHub remains the coordination/current-state source of truth.
- Local coding agents may not see GitHub Issues; ChatGPT should convert Issues into full task packets.
- `PROJECT_STATUS` is a convenience snapshot, not a binding product contract.
- Start Session: read this file, then verify actual GitHub state before assigning work.
- End Session: distinguish local-only, committed, pushed, PR, CI and merged states precisely.
- Only one contributor/ChatGPT should update this shared status snapshot at a time.

## Status Vocabulary

```text
LOCAL CHANGES ONLY
STASHED LOCALLY
COMMITTED LOCALLY
PUSHED / NO PR
PR OPEN / CI PENDING
PR OPEN / CHANGES REQUIRED
PR READY FOR MERGE
MERGED
BLOCKED
READY FOR LOCAL IMPLEMENTATION
```

Never call a task merged/completed merely because a local agent finished, tests passed, or a local commit exists.
