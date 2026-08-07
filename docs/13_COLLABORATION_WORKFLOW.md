# Collaboration Workflow

Status: Binding  
Version: 0.1

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

## Branch workflow

Start from current main:

```bash
git checkout main
git pull --ff-only
git checkout -b feat/VAL-010-short-description
```

Keep branches short-lived.

After another PR changes relevant shared code, rebase or merge current `main` before continuing high-risk integration work.

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
relevant docs

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

## Parallel work classification

### SAFE

Usually suitable for parallel work when ownership is separate.

Examples:

- isolated frontend feature
- tests for a stable public contract
- documentation unrelated to an active shared design
- isolated module implementation after its interfaces are fixed

### SHARED

Coordinate before changing.

Examples:

- shared contracts
- shared UI package
- root build configuration
- common auth middleware
- API-wide error conventions

### CRITICAL / HIGH-CONTENTION

Single-owner or explicitly coordinated edits.

Examples:

- `schema.prisma`
- migrations
- `AGENTS.md`
- product scope
- domain model
- ValetSession state machine
- accepted decision log
- root package/lockfile during dependency changes

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

## Pull Request workflow

Each PR must:

- link the Issue/task
- describe what changed
- declare files/modules affected
- declare state-machine impact
- declare database/migration impact
- declare tenant/security impact
- list tests/checks run
- call out known follow-up work
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

GitHub settings are external to the repository, so these protections must be enabled in the repository settings after the remote repository is created.

## Documentation changes

Binding documentation is not an afterthought.

If implementation behavior changes an accepted product/domain rule:

```text
1. decision
2. update docs
3. merge/agree
4. implement
```

If the code contradicts binding docs, the code is not considered correct merely because tests pass.

## Conflict resolution

Resolve conflicts according to the authority order in `AGENTS.md`.

For a normal non-domain text conflict, Git merge resolution is sufficient.

For a domain conflict, such as:

```text
READY -> RELEASED
```

versus:

```text
READY -> PAYMENT_PENDING -> RELEASED
```

do not let an AI merge both ideas.

Consult `docs/04_VALET_SESSION_STATE_MACHINE.md` and `docs/08_DECISIONS_LOG.md`.

## Ownership recommendation for a two-person team

Ownership may change per task, but early work should minimize overlap.

A practical early split is:

```text
Contributor A
  architecture / database / core domain / infrastructure

Contributor B
  authentication / web surfaces / UI integration
```

After foundations stabilize, prefer feature ownership end-to-end where practical.

## Definition of collaboration success

The workflow is working when:

- both contributors can work independently without corrupting shared assumptions
- every merged change has an owner and review history
- AI agents stay within task scope
- binding product decisions remain documented
- CI catches integration problems before `main`
- database/state-machine conflicts are handled deliberately
