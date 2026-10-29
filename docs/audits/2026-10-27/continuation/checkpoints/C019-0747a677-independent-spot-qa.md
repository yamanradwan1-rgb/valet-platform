# C019 independent W6 semantic record QA — nine source re-reads

- Reviewer: **W6**, independent of the source-record author for the nine samples (W1/W2/W3).
- Pinned product: `0747a677ddf7fc3e1093490b7ef0a7bee9e2d938`, tree `9fbe93fe55b5ef7c42888a874cc7217a594ccace`.
- Original independent evidence: `tmp/cos-audit-20261029-results/W6/C019-W6-independent-spot-qa.json` (184 lines; 9 per-path results, canonical raw Git SHA256, full 1..EOF, test-reference existence, and comparison against C018 `not_reviewed` ledger). W6 re-read its saved JSON after writing. This report preserves its substantive result in the audit branch.

| Source reviewer | Independently re-read entire pinned source | EOF lines | Outcome |
| --- | --- | ---: | --- |
| W1 | `apps/api/test/mfa-admin-activity.integration.test.ts` | 222 | PASS |
| W1 | `apps/api/test/org-admin-field-authority.integration.test.ts` | 278 | PASS |
| W1 | `apps/api/test/staff-auth-continuity.integration.test.ts` | 123 | PASS after W1 corrected Native/Web evidence |
| W2 | `apps/api/test/shift-presence-forward-migration.integration.test.ts` | 174 | PASS |
| W2 | `apps/api/test/shift-presence-no-evidence-fences.integration.test.ts` | 287 | PASS |
| W2 | `apps/api/test/shift-presence-no-evidence-retention.integration.test.ts` | 121 | PASS |
| W3 | `apps/api/test/condition-photo-http.test.ts` | 248 | PASS |
| W3 | `apps/api/test/condition-photo-qualified-receipt.test.ts` | 189 | PASS |
| W3 | `apps/api/test/condition-photo-status-query.test.ts` | 121 | PASS with minor wording note, then W3 corrected its own record |

**Gate evidence:** 9/9 raw Git blob SHA256 match, 9/9 full consecutive 1..EOF, 9/9 focused test references resolve, all nine selected paths were `not_reviewed` at the published C018 baseline, **zero duplicate prior credit**, zero new P0/P1 in this sample. W6's original totals were 8 `PASS` + one `PASS_WITH_WORDING_NOTE`, zero required fixes.

The two precision corrections must not be suppressed:

1. `staff-auth-continuity.integration.test.ts:31-99` proves a Web cookie login/refresh session-continuity header, while Native `:101-122` proves strict JSON body compatibility and token rotation **without asserting that header**. W1 amended only its own C019 semantic record after W6 raised the discrepancy; Prime independently read 123/123.
2. `condition-photo-status-query.test.ts`: a PENDING candidate is selected with `LIMIT 1` and no `ORDER BY`; the latest-terminal row is ordered. W3 amended its note from an unsupported 'latest pending' phrasing to 'one pending and latest terminal' after the independent review. This was an evidence-precision issue, not a verified product defect.

No Runtime tests, actual PostgreSQL, HTTP or browser assertions were executed. These nine samples corroborate reviewers but do not replace the full roster strict gate or a final independent current-ledger reconciliation.
