# Audit — Parameterized cases whose scenario input is ignored

Date: 2026-11-03
Pinned source baseline: `f9ecebd9af85b44580771b4027515d06c0a31de4`.
Review type: TypeScript AST scan of all 2,034 baseline test/spec files plus contextual source inspection of the exact six families below. This is **not** a green/red verdict for unrelated tests.

## Reproducible detection rule

For every syntactic `it.each(data)(title, callback)` / `test.each(data)(title, callback)` declaration, inspect the parameter list of the registered callback. If it has **zero parameters**, the array/row input cannot directly select a different scenario in that callback. The title may change, but the code path can be identical. This is a **candidate**, not proof of semantic equivalence: global state or hooks can depend on the displayed title, and some cases intentionally prove public non-disclosure on the same response type.

After the Settings cleanup (which removed `it.each(["mfa","conflict","network"])` with no scenario consumption), the AST scan identified **six further families**. The Guest Rating case below was subsequently fixed; five remain under review.

| Priority | Source site and labels | Observed same-body behavior | Correct proof plan |
| --- | --- | --- | --- |
| **P1 REWRITE** | `apps/customer/src/app/guest-confirm-intent.mounted.test.tsx:147-163` — invalid / revoked / expired (3 rows) | Every row calls `h.setGet()` with the same 401 `GUEST_ACCESS_INVALID`, then asserts the same session clear/no POST. | If the server deliberately uses one non-disclosing guest error, keep **one** mounted UI response-sanitization case; test the three underlying causes independently at real Guest API / DB layer. Do not invent publicly distinct error codes or leak existence. |
| **FIXED locally — baseline evidence** | `apps/customer/src/features/post-visit/guest-auto-rating.mounted.test.tsx:164-172` — bootstrap / expired / missing / network / ambiguous (5 rows) | Each original case set `allowed=false`, rendered and expected null selection and no `loadSession`, without injecting different failure modes. | Replaced with one precisely named host-authority-false UI test; real network-error and other independent negative cases remain. Focused Customer suites 16/16 PASS; real PG/E2E not rerun after this test-only change. |
| **P2 MERGE** | `apps/dashboard/src/features/visit-contacts/md04-generation.test.ts:93-106` — Visit Contacts / Audit (2 rows) | Both instantiate the same `ScopeGenerationGuard` and perform the identical old/current/invalidated transitions; no feature-specific adapter entered. | One shared guard unit test plus genuine Visit Contacts and Audit controller-generation wiring tests, where available. The shared helper alone cannot claim to exercise two pages. |
| **P1 REWRITE (auth-sensitive)** | `apps/valet-native/test/native-push-account-transition.test.ts:94-116` — online / lost-response-after-commit (2 rows) | Both test bodies perform the same successful registration/purge/new-user flow; no explicit lost-response or unknown-outcome transport is injected in the displayed code. | Add a case-dependent withheld reply *after durable A release* and require no unsafe B ownership transfer before authoritative A revocation; preserve provider token fencing and no duplicate/replayed credential registration. Do not simply delete the missing scenario. |
| **P1 REWRITE (authority transition)** | `apps/valet-native/test/native-shift-presence-runtime.test.ts:194-212` — logout / user replacement (2 rows) | Both seed START and END descriptors, increment one `authGeneration` and call `purge()`; same assertions, no separate second identity set-up. | Exercise explicit replacement identity and ensure descriptors cannot leak across users/Locations; retain logout purge and no stale recovery grants. |
| **P2 MERGE only if server negatives proven** | `packages/employee-client/src/employee-parking-spot-validation.test.ts:62-91` — wrong-location / missing / inactive / occupied / zone-incompatible (5 rows) | Every row injects the same non-disclosing `PARKING_SPOT_NOT_FOUND_OR_UNAVAILABLE` 409, then validates correction and Scan again. | One client generic concealed-409 presentation case may be enough; retain separate real server/PG tests for each underlying tenant/Location/occupancy/zone reason, plus retry and custody state. |

## Why this matters

A matrix of five titles is not five independent security proofs when every callback gets the same input and invokes the same functions. At the baseline, estimated redundant-looking runtime invocations if all six families collapsed mechanically were `(3-1)+(5-1)+(2-1)+(2-1)+(2-1)+(5-1)=13`. **Four** from Guest Rating have now been removed with evidence. The remaining **nine** are a review queue, not an approved deletion. Some demand **adding** a genuinely different negative path before removing misleading titles.

The test-only Dashboard Settings correction was separately implemented and locally proved: `studio-settings-confirmation.test.ts` switched three identical fake MFA/conflict/network titles to one legitimate guarded-no-`onSuccess` test, reducing two executed cases while keeping its positive callback test. That correction is committed in the current audit integration branch.

## Acceptance before a delete or rewrite

1. Source and current Accepted Decision jointly establish expected behavior, especially if the public error must remain non-disclosing.
2. Run the old test with a deliberately bad behavior (wrong user, extra write, stale response, missing 409) to establish what it detects. Ensure the replacement rejects that mutation.
3. Confirm unique API/PG/real-browser negative evidence for each underlying authority/custody/payment case, not just similarly named mocks.
4. Rerun the focused package tests, required PostgreSQL/Issue215 where relevant, full PR quality CI, and independent diff review.
5. Record exact before/after case count and **measured** wall-clock change before claiming speedup.

No application runtime, security behavior, protected CI gate, or private credential contract is changed by this report.
