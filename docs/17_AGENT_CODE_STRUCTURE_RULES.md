# VAYLET — Agent Code Structure Rules

Status: **Binding**

This document defines mandatory code-structure constraints for every AI agent and human contributor working in this repository.

These rules are not style suggestions. They are repository constraints intended to keep implementation modular, reviewable, testable, and resistant to repeated large-file refactor loops.

## 1. Read this file before implementation

Before changing code, every implementation agent MUST read this file together with `AGENTS.md`, the relevant binding project documents, and the Accepted DEC for the task.

If a requested implementation would violate this document, the agent must redesign the internal file/module split without changing the accepted external behavior. If the conflict is with a binding architectural decision, stop and report the contradiction instead of bypassing the rule.

## 2. Hard maximum: 300 physical lines per authored code file

The target hard maximum is **300 physical lines per authored code file**.

Covered authored code includes repository-owned implementation and test/tooling code such as:

- `.ts`
- `.tsx`
- `.js`
- `.mjs`
- `.cjs`

under normal authored-code locations including `apps/**`, `packages/**`, `scripts/**`, and task-owned tooling directories.

Generated files, vendored code, build output, lockfiles, Prisma migration SQL, and documentation are not subject to this code-file line limit.

### New files

A newly created authored code file MUST NOT exceed 300 physical lines.

### Existing files at or below 300 lines

A modified authored code file that is currently at or below 300 lines MUST remain at or below 300 lines after the change.

### Existing legacy files already above 300 lines

Do not perform unrelated mass refactors merely to satisfy this policy.

When a task must modify a legacy file already above 300 lines:

- do not increase its physical line count;
- prefer extracting the task-relevant responsibility into focused modules/files;
- if the requested change would add meaningful logic to that oversized file, split the responsibility first as part of the same task;
- do not hide new logic inside compressed formatting or dense one-line expressions merely to satisfy the counter.

The long-term direction is to eliminate legacy oversized authored code files through scoped refactors, not through formatting tricks.

## 3. One responsibility per file

A file should have one clear primary responsibility.

Do not combine unrelated concerns such as:

- HTTP controller + database persistence + domain validation;
- authentication + unrelated feature logic;
- multiple independent feature services;
- domain command + transport parsing + infrastructure lifecycle;
- production tooling + runtime application logic.

When a file begins to accumulate multiple responsibilities, split it before adding more behavior.

## 4. Prefer small modules over god files

Do not solve a task by continuously appending to the largest existing file.

Prefer focused units such as:

- controller
- service / command executor
- repository / persistence helper
- schema / validation contract
- policy
- boundary / interface
- adapter
- small utility
- focused test fixture/helper

Do not create unnecessary abstraction layers solely to reduce line count. Splits must follow real responsibility boundaries.

## 5. Keep public contracts stable during internal splits

File/module extraction must not silently change:

- public routes;
- request or response schemas;
- error codes/messages;
- authentication or authorization semantics;
- transaction boundaries;
- anti-abuse ordering;
- token/cookie behavior;
- database security/TLS behavior;
- audit/evidence behavior;
- state-machine behavior;
- accepted domain invariants.

Internal structure may change while accepted external behavior remains stable unless the task explicitly changes that behavior.

## 6. Dependency direction remains binding

All Accepted dependency-direction and ownership decisions remain in force, including common-vs-feature boundaries and feature ownership established by the current architecture decisions.

Never use a file split to introduce:

- circular module dependencies;
- `common -> feature` imports;
- feature ownership inversion;
- duplicated singleton infrastructure;
- duplicate runtime database pools/lifecycles;
- duplicate global filters or middleware registration.

## 7. No convenience dumping grounds

Do not create generic files such as:

- `utils.ts`
- `helpers.ts`
- `common.ts`
- `misc.ts`
- `service.ts`

as dumping grounds for unrelated behavior.

Shared files must have a specific domain/infrastructure purpose and a clear name.

## 8. Tests follow the same structural discipline

Test files and fixtures should be split by behavior/feature when they become large.

Do not place an entire feature's unrelated scenarios into one ever-growing integration test file merely because a test framework allows it.

Reusable test setup may move into focused test helpers, but helpers must not hide assertions or security-critical behavior.

## 9. No line-count gaming

Agents must not satisfy the 300-line policy by making code harder to read.

Forbidden tactics include:

- collapsing readable blocks into dense one-line expressions;
- removing useful spacing solely to reduce line count;
- combining unrelated declarations;
- embedding large inline JSON/SQL/config blobs when a focused file is more appropriate;
- replacing clear types/functions with unreadable compressed forms.

Maintainability wins over superficial counter compliance.

## 10. Before implementation: structure plan

For any non-trivial task, inspect the target files before editing.

If an intended target file is close to the 300-line ceiling, plan the extraction/split before adding behavior.

The agent should know which responsibility belongs in which file before implementation begins.

## 11. Before completion: mandatory structure review

Before committing, verify:

- no new authored code file exceeds 300 lines;
- no modified file that was <=300 now exceeds 300;
- no legacy >300 file increased in line count;
- no new god file or unrelated responsibility combination was introduced;
- no line-count gaming was used;
- dependency direction remains valid;
- the repository architecture check passes.

If any rule fails, the task is not ready to commit.

## 12. Automated enforcement

The repository architecture tooling should enforce this policy for new/modified authored code so agents receive an immediate deterministic failure instead of discovering structural debt later.

The enforcement must distinguish pre-existing oversized legacy files from code introduced or expanded by the current change so adopting this policy does not trigger an unrelated repository-wide refactor.

Repository enforcement is owned by `pnpm architecture:check`, with the focused
line policy in `scripts/architecture-line-policy.mjs` and the deterministic
grandfather baseline in `scripts/architecture-line-baseline.json`.

Current-working-tree discovery follows Git's repository-ownership semantics.
It covers tracked authored files plus new non-ignored authored files before
`git add`, excludes Git-ignored local/generated material, and intentionally
handles deleted tracked files without treating a missing working-tree file as
an unreadable source. The historical grandfather baseline remains commit-based
and independent from current-working-tree discovery.

Any future exception requires an explicit Accepted decision. An agent may not grant itself an exception.
