# Valet — Current Project Status

> Operational handoff snapshot only. This file is not a binding product/domain contract.
> For current repository facts, GitHub wins. For accepted behavior, use the binding docs and authority order defined by the project.

## Last Verified

- Date/time: `2026-08-08 16:24 +03:00`
- Repository: `veletpro0-lgtm/valet-platform`
- Verification basis: current GitHub Issues / PRs / branches

## Current Milestone

**Phase 1 — Database Foundation**

Phase 0 bootstrap is complete. Phase 1 is now being implemented as focused tasks rather than one large PR.

## Completed

### Phase 0 — Bootstrap

- PR #1 — `chore: bootstrap monorepo foundation`
- Status: **MERGED**

### VAL-002A — Lock Phase 1 Database Contract

- Issue #2
- PR #3 — `docs: lock Phase 1 database contract`
- Status: **COMPLETED / MERGED**
- Result: the binding Phase 1 database conventions in `docs/03_DATABASE_SCHEMA.md` were locked before Prisma implementation.

## Current Task

### VAL-002B — Tenant & Staff Database Foundation

- Issue: **#4 — OPEN**
- Owner: `veletpro0-lgtm`
- Expected branch: `feat/VAL-002B-tenant-staff-db`
- Remote branch: **exists**
- Current status: **READY FOR LOCAL IMPLEMENTATION**
- Open PR for VAL-002B: **none found at last verification**

Approved implementation scope is limited to:

- `Organization`
- `Location`
- `User`
- `OrganizationMembership`
- `MembershipLocationAccess`
- `Shift`
- required Prisma schema changes
- required migration(s)
- focused DB integrity/constraint tests

Do not expand this task into other Phase 1 domain models.

## High-Contention Ownership

Database schema and migrations are CRITICAL/high-contention for the current phase.

Current migration owner:

- `veletpro0-lgtm` for `VAL-002B`

Do not start another independent schema/migration task in parallel until this ownership is released or explicitly coordinated.

## Current Blockers / Dependencies

No implementation blocker is currently recorded for VAL-002B.

The next database slice should not begin until VAL-002B is reviewed/merged or the dependency is explicitly re-planned.

## Exact Next Step

On the contributor machine:

```powershell
git checkout main
git pull --ff-only origin main
git fetch origin
git checkout -b feat/VAL-002B-tenant-staff-db origin/feat/VAL-002B-tenant-staff-db
```

Then run the local coding agent with the complete VAL-002B task packet. The local agent should not depend on GitHub access.

After implementation:

```text
local checks
→ review diff
→ commit
→ push
→ PR
→ CI
→ review against Issue + binding docs
→ human merge decision
```

## Active PRs Relevant to Current Task

None found for `VAL-002B` at the last verification.

## Human Handoff Notes

- Local coding agents are expected to work from the local repository and may not be connected to GitHub.
- GitHub Issues do not arrive through `git pull`; ChatGPT should convert each Issue into a complete copy-paste task packet for the local agent.
- GitHub remains the coordination/source-of-truth layer for repository state.
- This file is a fast handoff snapshot for humans and ChatGPT instances, not a replacement for GitHub.
- At **Start Session**, read this file and then verify it against GitHub before assigning work.
- At **End Session**, verify actual local/GitHub state and update this snapshot only when meaningful project state changed.
- Only one contributor/ChatGPT should update this shared status file at a time to avoid conflicting handoff snapshots.

## Status Vocabulary

Use precise state labels:

```text
LOCAL CHANGES ONLY
COMMITTED LOCALLY
PUSHED / NO PR
PR OPEN / CI PENDING
PR OPEN / CHANGES REQUIRED
PR READY FOR MERGE
MERGED
BLOCKED
READY FOR LOCAL IMPLEMENTATION
```

Never call a task merged/completed merely because local code or a commit exists.
