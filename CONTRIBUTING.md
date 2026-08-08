# Contributing to VAYLET Platform

Status: Binding collaboration rules

This repository is designed for a small distributed team working with AI coding agents.

The goal is to keep parallel work safe, reviewable, and consistent with the current product source of truth.

## Required reading before contribution

Before starting a task, read:

- `AGENTS.md`
- the assigned GitHub Issue/task
- the relevant files under `docs/`
- `docs/15_BLUEPRINT_V1_REBASELINE.md` when product scope/domain behavior is affected
- `docs/13_COLLABORATION_WORKFLOW.md`

AI agents must follow the same rules as human contributors.

Do not rely on an old copied prompt when newer binding docs changed after the prompt was written.

## Never work directly on `main`

All implementation work must happen on a short-lived branch created from an up-to-date `main`.

Branch naming:

```text
feat/VAL-###-short-description
fix/VAL-###-short-description
chore/VAL-###-short-description
docs/VAL-###-short-description
```

Example:

```text
feat/VAL-010-valet-session-state-machine
```

Do not use permanent personal branches such as:

```text
yaman
friend
developer-a
developer-b
```

## One task, one owner, one branch

Every active task must have:

- a task ID
- one human owner
- one branch
- one explicit objective
- allowed scope
- prohibited/out-of-scope changes
- known dependencies
- acceptance criteria
- relevant binding-document references

An AI agent works on behalf of the human owner. It does not become an independent project owner.

## Scope rule

If completing a task requires a material change outside the approved task scope:

1. Do not silently make the change.
2. Record/report the dependency.
3. Create/request a separate task when necessary.
4. Update product/domain documents first when accepted behavior changes.
5. Resume implementation only after the dependency/contract is resolved.

A capability being part of the sellable MVP does not mean every current task may implement it early.

## High-contention files

These files require deliberate coordination before parallel edits:

```text
AGENTS.md
CONTRIBUTING.md
docs/00_SOURCE_OF_TRUTH.md
docs/01_PRODUCT_SCOPE.md
docs/02_DOMAIN_MODEL.md
docs/03_DATABASE_SCHEMA.md
docs/04_VALET_SESSION_STATE_MACHINE.md
docs/08_DECISIONS_LOG.md
docs/09_TECH_STACK.md
docs/13_COLLABORATION_WORKFLOW.md
docs/15_BLUEPRINT_V1_REBASELINE.md
packages/database/prisma/schema.prisma
packages/database/prisma/migrations/**
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
turbo.json
```

`docs/14_PROJECT_STATUS.md` is SHARED rather than binding/high-contention: coordinate before simultaneous handoff updates and verify GitHub state first.

For database schema/migration work, keep a single active migration owner until the foundation is stable.

## Product-contract changes

Founder & Product Blueprint v1.0 is the newest approved product direction, reconciled into the repository through Accepted decisions and binding docs.

Material product/domain changes follow:

```text
Approved owner/source change
   -> accepted reconciliation decision
   -> affected binding docs
   -> implementation
```

Do not allow code, an Issue body, or chat history to become the only record of a product decision.

## Pull Requests

A Pull Request is required before merging to `main`.

A PR must:

- reference its task/Issue
- stay focused on one objective
- explain ValetSession/Task/Dispatch impact when applicable
- explain database/migration impact
- explain tenant/location/security/privacy impact
- explain Configuration First/policy impact when applicable
- include tests where applicable
- list validation/checks run
- call out unresolved/follow-up work
- pass required CI
- be reviewed by the other human contributor whenever practical
- avoid unrelated refactors

Do not merge a PR only because an AI agent says it is complete.

## Required local checks

Before marking an implementation PR ready:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Database tasks additionally verify fresh migration behavior and focused integrity tests as required by the Issue.

Docs-only tasks still require CI when repository workflow runs it, but must not create unrelated code churn solely to make a documentation change.

## Database changes

Database changes require:

- update to `docs/03_DATABASE_SCHEMA.md` first when the contract changes
- a new migration
- appropriate integrity tests
- explicit review of tenant/location boundaries
- no rewriting already-applied migrations to hide later changes
- coordination with the single active migration owner

Do not invent schema for Blueprint actors/policies explicitly marked unresolved/deferred.

## State and task lifecycle changes

Physical vehicle custody belongs to `ValetSession`.

Hybrid Dispatch assignment/acceptance/reassignment belongs to Task/Dispatch lifecycle.

A change that mixes those boundaries is a domain change and requires explicit contract review.

## Merge conflicts

Do not treat every conflict as a text-editing problem.

A conflict involving:

- ValetSession states
- Task/Dispatch states
- payment/handoff behavior
- database ownership
- tenant/location rules
- handoff verification
- tracking/privacy
- Configuration First precedence
- product scope / MVP boundary

is a domain/product conflict and must be resolved against the authority order in `AGENTS.md` before merging.

## Local-only and stashed work

Be precise about state:

```text
LOCAL CHANGES ONLY
STASHED LOCALLY
COMMITTED LOCALLY
PUSHED / NO PR
PR OPEN / CI PENDING
PR READY FOR MERGE
MERGED
```

A local stash is not backed up on GitHub.

When temporarily preserving valuable work before a contract rebase, prefer a clearly named stash/backup and do not drop it until restored work is verified and safely committed.

## AI-agent review principle

Recommended pattern:

```text
Human A + Agent A implement
          |
          v
Human B + Agent B review
          |
          v
CI + human decision
          |
          v
main
```

The implementer agent should not be the sole authority approving its own change.

## Start / End Session handoff

Use `docs/14_PROJECT_STATUS.md` as a convenience snapshot, not as a replacement for GitHub.

At Start Session, verify Issues/PRs/branches/main before assigning work.

At End Session, distinguish local/commit/push/PR/merge state precisely and update the shared status snapshot only when meaningful project state changed.
