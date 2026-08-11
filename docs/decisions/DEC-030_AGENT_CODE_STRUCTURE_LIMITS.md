# DEC-030 — Agent Code Structure Limits

Status: Accepted

## Context

The repository already enforces API dependency direction through DEC-028, but its file-size rule is advisory only. The project owner has now made code-file size and responsibility boundaries a binding implementation constraint to prevent agents from repeatedly appending logic to large files and creating recurring repair/refactor loops.

This decision supersedes DEC-028 only where DEC-028 says file size is advisory-only. DEC-028 dependency-direction, retired-symbol, and architecture-check semantics otherwise remain unchanged.

## Decision

1. `docs/17_AGENT_CODE_STRUCTURE_RULES.md` is a binding repository contract and must be read before every code-changing task.

2. Authored repository code has a target hard maximum of **300 physical lines per file**. Covered authored code includes repository-owned `.ts`, `.tsx`, `.js`, `.mjs`, and `.cjs` implementation, test, script, and tool files. Generated/vendor/build output, lockfiles, Prisma migration SQL, and documentation are excluded.

3. A new authored code file must not exceed 300 physical lines.

4. A modified authored code file that was at or below 300 physical lines before the change must remain at or below 300 lines after the change.

5. Pre-existing legacy authored files already above 300 lines are grandfathered only to avoid an unrelated mass-refactor gate. They must not increase in physical line count. When a task adds meaningful behavior to such a file, the relevant responsibility must be extracted/split rather than appended.

6. Agents may not game the limit by compressing readable code, collapsing unrelated declarations, removing useful formatting, or otherwise reducing line count at the expense of maintainability.

7. Splits must follow real responsibility boundaries. The policy does not authorize speculative abstractions, circular dependencies, ownership inversion, behavior changes, or unrelated refactors.

8. Repository architecture tooling must enforce the 300-line rule deterministically. The preferred enforcement is a committed baseline of grandfathered legacy oversized files/line counts plus current-tree checks:
   - a >300 file absent from the baseline fails;
   - a baseline legacy oversized file whose line count increases fails;
   - once a baseline file is reduced to <=300, it should no longer need grandfathering;
   - current dependency-direction checks remain unchanged.

9. VAL-004R is the transition boundary. Files already created by VAL-004R before this owner instruction may be split during the immediately following structure-enforcement task rather than blocking the in-flight provisioning implementation.

10. After VAL-004R, the next focused task is the structure-policy enforcement/cleanup task. It must split VAL-004R-authored files that exceed 300 lines, wire the policy into `architecture:check`/CI, and establish the legacy baseline without broad unrelated refactoring.

11. The previously planned Final Phase-2 Security/Integrity Closure and fresh Standard Security Scan are no longer pre-Phase-3 gates by owner instruction. They may be performed later as production/pilot hardening work, but Phase 3 may begin after VAL-004R and the structure-policy enforcement task are merged.

## Consequences

- Agents receive a clear structural contract before coding.
- New god files are blocked before merge.
- Existing oversized debt does not trigger a repository-wide refactor loop.
- Phase 3 starts from enforced modularity rather than an advisory size warning.
- Skipping the former security-closure/scan sequence does not mean those checks were run or passed; no such claim may be made without actual execution.
