# Collaboration Workflow

Status: Binding  
Version: 0.2

## Purpose

This project is expected to be developed by two remote human contributors, each potentially using an independent AI coding agent.

GitHub is the coordination layer between contributors.

AI agents coordinate through repository state, Issues, branches, Pull Requests, CI, and binding documentation — not through assumptions about another agent's chat context.

## Collaboration model

```text
                         GitHub
                           |
                         main
                           |
              Source of Truth + CI
                           |
             +-------------+-------------+
             |                           |
       Human A + Agent A           Human B + Agent B
             |                           |
        Task VAL-X                  Task VAL-Y
             |                           |
       short-lived branch          short-lived branch
             |                           |
             +---------- PRs ------------+
                           |
                    Cross review + CI
                           |
                          main
```

## Work item lifecycle

Every implementation change follows:

```text
BACKLOG
  -> READY
  -> IN PROGRESS
  -> IN REVIEW
  -> DONE
```

A task moves to `IN PROGRESS` only when it has:

- a unique ID such as `VAL-010`
- a human owner
- a clear objective
- allowed scope
- known dependencies
- acceptance criteria
- current binding-doc references

## Branch workflow

Start from current main:

```bash
git checkout main
git pull --ff-only origin main
git checkout -b feat/VAL-010-short-description
```

Keep branches short-lived.

After another PR changes relevant shared code/contracts, update the branch from current `main` before continuing high-risk integration work.

Never let two AI agents modify the same working tree simultaneously.

## Task boundaries for AI agents

A task brief given to an AI agent should contain:

```text
Task:
VAL-###

Objective:
...

Read first:
AGENTS.md
relevant binding docs

Allowed scope:
...

Do not modify:
...

Dependencies:
...

Acceptance criteria:
...

Required checks:
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Mandatory instruction for scoped tasks:

```text
If the task requires a material change outside the allowed scope,
do not implement that change silently.
Report the dependency instead.
```

## Product-contract gate

Before coding, confirm that the task is consistent with:

- `AGENTS.md` authority order
- Accepted decisions
- `docs/15_BLUEPRINT_V1_REBASELINE.md`
- affected product/domain/database/state/security docs

If a new owner decision changes material behavior:

```text
owner decision / approved source
-> Accepted reconciliation decision
-> binding docs
-> implementation
```

Do not let stale Issues/prompts override newer binding product contracts.

## Parallel work classification

### SAFE

Usually suitable for parallel work when ownership is separate.

Examples:

- isolated frontend feature after its contract is stable
- tests for a stable public contract
- documentation unrelated to an active shared design
- isolated module implementation after interfaces are fixed
- UX/wireframe work that does not redefine active domain contracts

### SHARED

Coordinate before changing.

Examples:

- shared contracts
- shared UI/design-system package
- project status snapshot
- root build configuration
- common auth middleware
- API-wide error conventions
- provider abstraction shared by multiple modules

### CRITICAL / HIGH-CONTENTION

Single-owner or explicitly coordinated edits.

Examples:

- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/**`
- `AGENTS.md`
- `docs/00_SOURCE_OF_TRUTH.md`
- `docs/01_PRODUCT_SCOPE.md`
- `docs/02_DOMAIN_MODEL.md`
- `docs/03_DATABASE_SCHEMA.md`
- `docs/04_VALET_SESSION_STATE_MACHINE.md`
- `docs/08_DECISIONS_LOG.md`
- `docs/15_BLUEPRINT_V1_REBASELINE.md`
- root package/lock/workspace files during dependency changes

## Database migration coordination

Until the database foundation is stable:

```text
One active migration owner at a time.
```

If another task needs a schema change:

1. record the required schema dependency
2. coordinate with the migration owner
3. merge the schema/migration change
4. update `main`
5. continue the dependent task

Do not let two agents independently invent migrations from different schema baselines.

Preserved/stashed local database work must be treated as local-only until committed/pushed; GitHub cannot recover an unpushed stash.

## Pull Request workflow

Each PR must:

- link the Issue/task
- describe what changed
- declare files/modules affected
- declare ValetSession and Task/Dispatch impact
- declare database/migration impact
- declare tenant/location/security/privacy impact
- declare Configuration First/policy impact when applicable
- list tests/checks run
- call out known follow-up work or unresolved product gaps
- remain focused

Preferred review:

```text
Contributor A opens PR
        |
Contributor B reviews
        |
Review may use Agent B
        |
Contributor A resolves findings
        |
CI passes
        |
Human merge decision
```

## Required CI

The repository CI must run:

```text
lint
typecheck
test
build
```

A PR must not merge while a required check is failing.

Database/security tasks may require additional task-specific verification beyond the generic CI job.

## Recommended GitHub branch protection / ruleset for `main`

Configure GitHub so that:

- direct pushes to `main` are blocked
- Pull Requests are required
- at least one approval is required
- stale approvals are dismissed after new material changes when practical
- required status check `quality` must pass
- conversation resolution is required
- force pushes are blocked
- branch deletion protection is enabled where appropriate

GitHub settings are external to the repository, so these protections must be enabled in repository settings.

## Documentation changes

Binding documentation is not an afterthought.

If implementation behavior changes an accepted product/domain rule:

```text
1. decision / approved source
2. update binding docs
3. review/merge contract
4. implement
```

If the code contradicts binding docs, the code is not considered correct merely because tests pass.

`docs/14_PROJECT_STATUS.md` is a SHARED operational snapshot, not a binding contract. Only one contributor/ChatGPT should update it at a time, and it must be verified against GitHub before being trusted as current.

## Conflict resolution

Resolve conflicts according to the authority order in `AGENTS.md`.

For a normal non-domain text conflict, Git merge resolution is sufficient.

For a domain conflict, such as:

```text
READY -> HANDOFF_PENDING -> COMPLETED
```

versus:

```text
READY -> COMPLETED
```

do not let an AI merge both ideas or choose by convenience.

Consult `docs/04_VALET_SESSION_STATE_MACHINE.md`, `docs/08_DECISIONS_LOG.md` and the Blueprint rebaseline bridge.

Likewise, do not collapse Hybrid Dispatch Task status into ValetSession physical state merely to simplify implementation.

## Ownership recommendation for a two-person team

Ownership may change per task, but early work should minimize overlap.

A practical early split is:

```text
Contributor A
  architecture / database / core domain / infrastructure

Contributor B
  UX/UI design / authentication or isolated surfaces after contracts stabilize
```

After foundations stabilize, prefer feature ownership end-to-end where practical.

## Start Session handoff protocol

At the beginning of a work session:

1. read the working-system/project profile if supplied
2. read `docs/14_PROJECT_STATUS.md`
3. verify actual GitHub Issues/PRs/branches/main before trusting the snapshot
4. identify current task, owner, dependency and contention state
5. give the exact next step/task packet

GitHub actual state wins over the project-status snapshot, which wins over stale chat memory for operational state.

## End Session handoff protocol

At the end of a meaningful work session:

1. distinguish LOCAL CHANGES / STASHED / COMMITTED / PUSHED / PR / MERGED precisely
2. verify remote PR/CI/merge facts
3. record blockers/owners/high-contention ownership
4. update `docs/14_PROJECT_STATUS.md` only when project state materially changed
5. provide a short human handoff summary

Do not call local-only or stashed work safely backed up on GitHub.

## Definition of collaboration success

The workflow is working when:

- both contributors can work independently without corrupting shared assumptions
- every merged change has an owner and review history
- AI agents stay within task scope
- binding product decisions remain documented
- Blueprint/MVP boundaries are not lost between chats
- CI catches integration problems before `main`
- database/state-machine/dispatch conflicts are handled deliberately
