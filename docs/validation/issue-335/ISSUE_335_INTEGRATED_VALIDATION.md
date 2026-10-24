# Issue #335 — Integrated Guest Reliability Validation

Status: all five scoped corrections implemented and passing targeted checks; the original physical first-navigation incident is not yet proved fixed. This report does not authorize merge, deploy, production activation or Issue closure.

## Baseline and isolation

- Issue: https://github.com/yamanradwan1-rgb/valet-platform/issues/335
- Main and origin/main baseline: e8c747f50cead1360ed151582c767a9bec1d1014.
- Integrated behavior candidate: 3dd2e154c9f992f629a4e13cf656d01c89b7a251.
- Reproducible browser QA harness commit: 50da3ef8ae2bc441bab70323f89c0539a481faec (two test-only modules).
- Branch: fix/issue-335-guest-bootstrap-push-reliability.
- Worktree: tmp/issue-335-guest-reliability-worktree.
- Report-inclusive HEAD: the final pushed remote branch, after this documentation-only commit.
- All changes are limited to Customer source, focused tests, QA tooling and this report. No API, database, migration, design, localization, asset, Meta/WhatsApp or production setting changes.
- The two pre-existing untracked files on main, all four stashes, and existing user worktrees/branches were preserved.

## Five-fix matrix

| Finding | Root cause and implementation | Regression coverage | Result |
| --- | --- | --- | --- |
| F335-01 | Service Worker initialization waited for a future load event. register-pwa.ts now uses readyState-aware scheduling, a single-flight registration, reuse and rejection handling without changing origin or scope. | register-pwa.test.ts: 8 cases, including before/after load, duplicates, concurrent, unsupported, rejected and existing SW. | PASS; stale worker behavior needs physical/browser confirmation. |
| F335-02 | Native Push promises could hang. guest-web-push-client.ts and guest-web-push-stage.ts now bound stages and total operation duration, fence late results with abort/context ownership and clean up only a newly created pre-POST subscription. | guest-web-push-boundaries.test.ts and client tests; never-settling and late native promises. | PASS; a native API itself can finish after app cancellation. |
| F335-03 | Not now and unmount did not invalidate the Enable operation. The existing permission card now owns AbortController, synchronous click single-flight, mounted/generation/context state and late-result fencing. | guest-web-push-permission-card.mounted.test.tsx and unchanged JSX presentation guard. | PASS; dismissal never revokes a previously authorized subscription. |
| F335-04 | 429 discarded a scrubbed-fragment Guest bootstrap stage. guest-auth-bootstrap.ts, guest-auth-context.tsx and guest-auth-rate-limit.ts retain ephemeral recovery authority, honor Retry-After, avoid immediate 429 retry and fence stale context/revocation. | guest-auth-bootstrap-rate-limit.test.ts and guest-auth-bootstrap.mounted.test.tsx. | PASS; very long server cooldowns fail closed. |
| F335-05 | Any 2xx counted as registered Push. guest-web-push-transport.ts now requires the backend's exact empty HTTP 204, and rejects redirects, HTML fallback and unexpected 2xx without globally changing Guest transport. | guest-web-push-transport.test.ts; expected response, 200 HTML/JSON, 201, redirect, 401/403/409/429/5xx and unknown commit. | PASS. |

## Combined lifecycle and security review

- SW registration remains production-gated, idempotent and bound to the prior origin/scope/cache policy.
- Not now, context change, navigation and unmount synchronously remove permission-card ownership. Abort and generation checks prevent late native results from triggering unauthorized follow-up work.
- A reused subscription is never unsubscribed due to a failed new attempt. Cleanup for a newly created subscription is bounded and ownership-aware before POST. If registration POST might have committed, outcome stays unknown; client timeout is not asserted as rollback.
- HTTP 429 preserves the intended visit and stage only in memory after fragment scrubbing. Retry-After governs deferred attempts; 429 is excluded from immediate recovery loops. Cookie/bearer conflict and current visit/revocation remain server-authoritative.
- Push HTTP response validation is specific to registration; no wider Guest API contract changes.
- ValetSession, Task/Dispatch, Company/Location configuration, DB constraints and indexes were untouched.
- Worker 6 reviewed integrated code SHA 5a68d71538d3f1b020295f6510b62ff7f399c312 and exact formatting/test-only delta through 3dd2e154c9f992f629a4e13cf656d01c89b7a251. Verdict PASS: no confirmed P0, P1, P2 or P3; auth, tenant/location/visit and Push identity trust boundaries unchanged.
- Worker 6 independently reviewed the two additional QA modules at 50da3ef8ae2bc441bab70323f89c0539a481faec, including their synthetic fixture imports: PASS, no P0/P1/P2/P3, no hardcoded live credentials or production imports. The capture harness records rendered DOM and screenshots and must be run only against synthetic/local QA targets to avoid collecting real guest information.

## Executed checks

| Command / evidence | Result |
| --- | --- |
| pnpm --filter @valet/customer test | PASS: 64 test files, 449/449 tests both at code SHA 3dd2e154 and again after QA commit 50da3ef8 plus its local formatting-only edits. |
| pnpm --filter @valet/customer typecheck | PASS. |
| pnpm --filter @valet/customer lint | PASS. |
| pnpm architecture:check | PASS, with existing grandfathered large-file warnings. |
| pnpm --filter @valet/customer build (API_ORIGIN=http://127.0.0.1:3311) | PASS: contracts compilation, Next production build and artifact checks on code SHA 3dd2e154. |
| pnpm --filter @valet/api exec vitest run --config vitest.config.mjs --project api-non-postgres test/guest-push-registration-controller.test.ts test/guest-push-registration-contract.test.ts test/guest-push-worker-principal.test.ts | PASS: 21/21 tests. |
| pnpm exec prettier --check, all nine newly added files | PASS. |
| pnpm exec prettier --check, two additional visual QA modules and this validation report | PASS after QA-only formatting in the integration worktree. |
| node --check apps/customer/qa/issue-335/browser-freeze-capture.mjs and browser-freeze-matrix.mjs | PASS. |
| pnpm exec prettier --check, all changed existing Customer files | Baseline formatter debt: the same five source files failed this check before the fixes; not autoformatted. |
| git diff --check | PASS. |
| node apps/customer/qa/issue-335/ui-freeze-compare.mjs --self-test | PASS: negative control detects deliberate JSX modification. |
| node apps/customer/qa/issue-335/ui-freeze-compare.mjs e8c747f50cead1360ed151582c767a9bec1d1014 [candidate worktree] | PASS: presentation JSX fingerprint identical in both changed TSX files; zero CSS, styles, labels, translations, icons or assets touched. |
| Desktop browser UI baseline vs code SHA 3dd2e154; width 320/390/768/1440 x EN/AR x light/dark x five Guest states | PASS: 80/80 ordinary-zoom PNGs byte-identical; DOM, computed styles and geometry identical after fonts and finite animations settle; zero browser errors. |
| Browser native 200% zoom paired baseline/candidate matrix | PASS: 80/80 PNG bytes identical, DOM and computed geometry identical, zero page errors or differences; exact baseline and candidate production previews. |
| Mounted Push-card keyboard/focus smoke on exact candidate | PASS: 320/390 x EN/AR x light/dark (8 contexts), plus 390 Arabic/dark at native 200% (1 context). Enable focus, Tab to Not now, reverse Shift+Tab back; visual parity and no page errors. |
| Live authenticated Guest first-navigation E2E | NOT RUN against the original phone/browser session; physical visit-authority proof pending. |
| PostgreSQL-backed Guest integration | NOT RUN; no expressly attested disposable isolated database; shared/production DB untouched. |
| Full repository remote CI | NOT RUN. |
| Physical Android Guest-link opening (copy/paste, Messenger and WhatsApp) | PENDING; no physical candidate-build test. |

## Absolute UI freeze evidence

The User-approved Guest visual presentation is unchanged: no JSX presentation structure, styles, Tailwind, typography, spacing, color, controls, dialogs, copy, translations, navigation, responsive behavior, icons or design-system files were altered. The Guest permission card's presentation region matches baseline. The static guard and 160 live browser states PASS: 80 normal and 80 native 200% zoom comparisons, each showing byte-identical PNG, DOM/computed-style/box snapshots and zero page errors. The paired screenshots and JSON evidence remain preserved in the isolated Worker 7 QA worktree under .qa335-evidence/freeze100 and .qa335-evidence/freeze200, with no raw Guest tokens recorded. Any changed operation timing is behavioral only.

## Original first-navigation issue: PHYSICAL QA PENDING

The original phone incident — copied Guest URL first opens in Chrome without the intended session until a manual refresh — has not been proven fixed. The exact tested Customer artifact, compiled enrollment flag and first-navigation/refresh network traces from that phone are unavailable. Issue #335 must remain OPEN.

A conditional, unproven hypothesis is that enrollment was disabled in the tested client, an existing Browser Session cookie was present and a first-navigation bearer fragment was presented. The browser might then send mixed cookie and bearer authority (correctly rejected by the server), while refresh uses cookie-only authority. This has not been reproduced against the real build. None of these five fixes relaxes mixed authority rejection or silently accepts a different visit.

Physical QA procedure: record precise test-build SHA and NEXT_PUBLIC_GUEST_BROWSER_SESSION_ENROLLMENT_ENABLED value; test clean Chrome profile and existing-cookie Chrome; open a scoped Guest link via direct paste, WhatsApp and Messenger; compare first navigation and refresh for exact intended visit identity, response classification and browser-session authority; repeat with same visit, different visit, expired/rotated/revoked bearer, SW-controlled/uncontrolled page and slow network. Do not record raw Guest fragments, cookies, endpoints or customer data. A newly proven cause outside F335-01 through F335-05 needs separate owner scope approval.

## Remaining qualification gates

- Physical Android first-navigation and real native Push permission/delivery validation remain pending.
- Browser-native stale SW asset update and late browser API settlement cannot be certified by mocks alone.
- PostgreSQL-backed tests and full repository CI require an explicitly isolated approved environment and a real CI run; they were not performed here.
- Worker 7's independent keyboard/focus and 200% QA both PASS. His local, disposable synthetic-fixture browser capture tool is integrated as browser-freeze-matrix.mjs and browser-freeze-capture.mjs, with no runtime application import or production path.

## Safe rollback outline (not executed)

Keep the integrated feature branch available for code review, without deploying or merging. If a future merge/deployment must be undone, use a reviewed ordinary revert of the exact integrated commit(s), then run the affected Guest validation again. No reset, branch deletion, stash removal or owner-worktree cleanup is part of this task.

## Release boundary

After scoped checks, reviews and UI freeze pass, push the one implementation branch to origin for owner review. No PR, merge, deploy, production feature activation, database migration, WhatsApp/Meta invocation or Issue closure.
