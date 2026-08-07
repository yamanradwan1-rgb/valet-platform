# Contributing to Valet Platform

Status: Binding collaboration rules

This repository is designed for a small distributed team working with AI coding agents.

The goal is to keep parallel work safe, reviewable, and consistent with the product source of truth.

## Required reading before contribution

Before starting a task, read:

- `AGENTS.md`
- the relevant files under `docs/`
- `docs/13_COLLABORATION_WORKFLOW.md`
- the GitHub Issue assigned to the task

AI agents must follow the same rules as human contributors.

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
- acceptance criteria
- relevant documentation references

An AI agent works on behalf of the human owner. It does not become an independent project owner.

## Scope rule

If completing a task requires a material change outside the approved task scope:

1. Do not silently make the change.
2. Record the dependency in the Issue/PR.
3. Create or request a separate task when necessary.
4. Update product/domain documents first when product behavior changes.

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
packages/database/prisma/schema.prisma
packages/database/prisma/migrations/**
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
turbo.json
```

For database schema/migration work, prefer a single active migration owner at a time until the foundation is stable.

## Pull Requests

A Pull Request is required before merging to `main`.

A PR must:

- reference its task/Issue
- stay focused on one objective
- explain domain/database/security impact
- include tests where applicable
- pass required CI
- be reviewed by the other human contributor whenever possible
- avoid unrelated refactors

Do not merge a PR only because an AI agent says it is complete.

## Required local checks

Before marking a PR ready:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

During the bootstrap phase, commands may initially execute no package tasks. Phase 0 must replace placeholders with real workspace applications/packages and make these checks meaningful.

## Database changes

Database changes require:

- update to `docs/03_DATABASE_SCHEMA.md`
- a new migration
- appropriate integrity tests
- explicit review of tenant boundaries
- no rewriting previously applied migrations to hide later changes

## Product/domain changes

If behavior changes:

```text
Decision
   -> docs/08_DECISIONS_LOG.md
   -> affected binding docs
   -> implementation
```

Do not allow code to become the only record of a product decision.

## Merge conflicts

Do not treat every conflict as a text-editing problem.

A conflict involving:

- ValetSession states
- payment/release behavior
- database ownership
- tenant rules
- handoff verification
- product scope

is a domain/product conflict and must be resolved against the binding documentation before merging.

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
