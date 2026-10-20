# Issue #300 — Astra R2 UI-M1 W5 Dashboard Implementation

## Scope and authority

- Branch/worktree: `codex/issue-300-r2-w5-ui-m1`, `D:\kndoom\valet-platform\tmp\issue-300-r2-w5-ui-m1`.
- Base: `ef5a0554fa20fe6ee6fcc0a4ceeffdc83d6e5687`.
- Owner-approved R2 §8.9 UI01–UI06 only. All production source changes are within the 19 explicitly approved Dashboard source paths. Focused tests use only the separately approved five test paths. No root/global CSS, audit page, event drawer, dependency/lockfile, contract or backend changes.
- No shared DB, signed HTTP, browser lease, deployment, push, merge or issue closure in W5.

## Behavior delivered

1. Search displays its initial at-most-100 Sessions and exposes one manual `Load more Sessions` request per click when the server supplies a signed cursor. The immutable applied UTC query, authorization scope, count, selection and Search snapshot remain fixed. Duplicate Session IDs are not appended; a changed snapshot requires restart. Transient follow-up failure can be retried without claiming missing historical rows are absent.
2. Each selected Session has an independent at-most-100-event Timeline, manual `Load more events`, stable UTC/source ordering and duplicate protections. Evidence-source coverage, per-event RECORDED/PARTIAL/UNVERIFIABLE confidence, and pagination exhaustion are separate facts. Loaded history is described as potentially incomplete while cursor/coverage limits remain.
3. Oversized employee directories support server-authorized literal prefix refinement and explicit 20-item Previous/Next pages, using canonical membership UUIDs and the backend-issued signed MEMBER cursor. Duplicate current names retain distinct UUIDs, selected values stay visible when paging, and no incomplete list is called exhaustive. The service generates signed 5-minute member cursors after the raw selector SQL query; it is not blocked by that SQL query's internal null cursor.
4. Location-timezone conversion enumerates genuine local wall-time occurrences. DST gaps are invalid; folds require selecting first or second UTC offset, including cases where the end wall-clock minute is earlier but the selected UTC instant is later. Applied Search always carries validated UTC boundaries.
5. Auth reconciliation and 401/403/MFA failures in initial MEMBER, KEY_SLOT, refined MEMBER, Search, Timeline and Detail lanes revoke all retained protected Session rows, options, selected identifiers, visible event/drawer and applied query together. Outstanding requests are aborted and epoch-fenced. 503/source failures do not revoke a still-authorized selection and use safe generic messages. Expired signed cursor errors demand a fresh Apply/refinement.
6. Search top-level source coverage persists even when `items=[]`. A Location-only PARTIAL/INTEGRITY_ANOMALY result shows a localized source-coverage warning and a qualified zero-result statement; it is never silently presented as conclusive absence. If coverage differs across subsequent pages, the UI flags that difference. The approved continuation CSS module spans `grid-column: 1 / -1` at the existing two-column tablet layout without modifying frozen CSS.

## Verification (local source/tests; no runtime/browser lease)

- Dashboard TypeScript: `pnpm --filter @valet/dashboard typecheck` — PASS.
- Dashboard ESLint: `pnpm --filter @valet/dashboard lint` — PASS.
- Focused Vitest: `pnpm --filter @valet/dashboard exec vitest run src/features/audit/investigation/investigation-ui-manifest.test.tsx src/features/audit/investigation/issue300-closure.test.ts src/features/audit/investigation/timeline/investigation-live-projection.test.tsx src/features/audit/investigation/search/investigation-member-options.test.ts src/features/audit/investigation/timeline/timeline-api.test.ts` — 36/36 PASS after witness-preservation and W7 P1 fixes.
- Repository `pnpm architecture:check` — PASS, only existing grandfathered warnings elsewhere.
- `git diff --check` — PASS; all new/modified authored code files ≤300 physical lines.
- Focused assertions cover first/next signed request parameters/count, member limit/duplicate names/abort, AR+EN conditional UI, DST gap/fold, zero-row partial/integrity coverage, and revocation classification for 401/403/MFA versus 503.

## Remaining independent acceptance

- W7 retains ownership of signed real HTTP, 100+ Search/Timeline end-to-end, actual 201+ member directory, browser geometry/focus/keyboard/zoom/RTL/Light-Dark and 119-file frozen screenshot comparison. Local TypeScript/Vitest tests do not count as those acceptance gates.
- Search pagination deliberately respects backend U-005 safety gates: ordinary runtime can return guarded 503 until W6/W4/W7 proof and Owner acceptance. W5 makes no claim that production continuation is enabled or that Issue #300 is closable.
