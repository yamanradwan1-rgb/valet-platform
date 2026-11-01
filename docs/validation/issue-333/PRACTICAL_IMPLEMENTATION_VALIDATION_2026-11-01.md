# Issue #333 — Practical contract implementation verification

Date: 2026-11-01

Owner authority: final practical security IMPLEMENTATION GO, replacing the strict
delivery contract in DEC-108 and the corresponding emergency wording in DEC-081.

## Scope and authoritative interpretation

The new security boundary is **authorization of a new request after the canonical
writer COMMIT**, not the last protected HTTP byte. An already successfully
authorized request may finish after COMMIT, including a bounded protected SQL
projection from the scope admitted for that same request. It does not authorize
any new request, page, cursor continuation, retry or background operation.
Revalidation must be near each protected query where practical; authorization
is performed in the Visit Contacts read transaction before its protected SQL.
An artificially paused already-authorized request does not become a new request.

The global security-disable writer still atomically disables the User, revokes
StaffAuthSessions and push attention endpoints, and audits. New protected
requests after COMMIT are denied. The additional response-time best-effort
interceptor for Staff Bearer GETs rechecks persisted `User.status` by the
original access-token hash after the handler resolves and before Nest serializes
an unsent body. If `DISABLED`, it emits 401 rather than the protected result.
This is one additional bounded pool query per eligible Staff GET, with no
response-held database lock or connection. An unavailable database check fails
closed. An old token rotated by ordinary refresh may no longer resolve; the
interceptor then permits the pre-authorized response, preserving #319. Already
sent bytes and a disable COMMIT after this final check cannot be retracted.

## Former strict findings: technical handling versus accepted risk

| Finding | Former strict failure | Revised-contract disposition |
| --- | --- | --- |
| F333-A Live Map | Old authorized HTTP 200 finished after revoke | Accepted bounded in-flight residual. Fresh request denies revoked A; current exact Location/Shift/MFA/tenant gates remain. |
| F333-B Dashboard discovery | Old A discovery finished after revoke | Accepted bounded in-flight residual. Fresh granted-Location list excludes A and retains independently granted B. |
| F333-C1 Visit Contact search | Old result included A after revoke | Accepted for the already-authorized request only. Fresh search recomputes rows, counts, latest visit, vehicles and match scope from B. |
| F333-C2 customer visits | Old A history after revoke | Accepted for already-authorized request only; fresh history excludes A and re-derives returning-contact behavior in B. |
| F333-C3 vehicle visits | Old A history after revoke | Same bounded residual; fresh vehicle history is restricted to B. |
| P001 mixed A+B | Before-SQL gate after successful A+B authorization, A revoked before aggregate SQL | Accepted as an old request under revised rule 2, not evidence of a freshly authorized A leak. New pages/cursors/searches after revoke must and do reauthorize B only. The historical gate was **after authorization, before SQL**, not after SQL. |
| E001 global emergency disable | Old protected HTTP200 finished after global User disable | The new late User-status check technically cancels this verified pre-serialization window: original strict E001 assertion passes unchanged and no private body is sent. Other preauthorized/partially sent or token-rotated responses remain expressly accepted best-effort residual. Fresh/queued protected requests deny and sessions/push revoke. |
| L001 / C001 / `40P01` | Session-lock loss, four-slot response-held pool exhaustion, advisory lock upgrade deadlock | Avoided rather than fixed: no response-held PostgreSQL lock, upgrade or new coordination path was introduced. Historical falsification remains valid. |

No production LocationAccess authorizer, Visit Contact query, canonical writer,
role/permission, Shift, MFA, CAS, audit, migration, schema, infrastructure,
dependency, Dashboard UI or Policies Studio UI was changed. Existing source
already reauthorizes every fresh read and scopes the entire B-only projection.
No repaired-runtime GREEN is claimed for the **superseded** strict last-byte
contract; the original strict RED files and reports remain unchanged.

## Real PostgreSQL 17 acceptance evidence

These four test commands were rerun in the integrated Prime worktree with
the response interceptor, revised decisions and tests together:

`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/issue333/run-owned-postgres.ps1 -Suite issue333 -TestFile test/<file>`

| `<file>` | Result | Owned lab run | Cleanup |
| --- | --- | --- | --- |
| `dashboard-issue333-practical-revocation.integration.test.ts` | 4/4 PASS | `4bd6868896e14d45a391a7856b465a28` | exit 0, removed=True |
| `dashboard-issue333-practical-contacts.integration.test.ts` | 3/3 PASS | `1b5650b45ba947798b4d97f4adf1cd13` | exit 0, removed=True |
| `dashboard-issue333-practical-contact-inflight.integration.test.ts` | 1/1 PASS | `2408f6834d04491181bce156a3be6653` | exit 0, removed=True |
| `dashboard-issue333-practical-emergency.integration.test.ts` | 2/2 PASS | `b63f5855ee1a482f8972e35f02ada49f` | exit 0, removed=True |

All four owned lab runners shut down their PostgreSQL 17 cluster and reported
zero remaining owned connections/children (`0/0`). They used actual
authenticated HTTP, canonical writers, current persisted state and real SQL.

The separate implementation worktree also replayed the **unchanged** strict
`dashboard-issue333-u002-emergency.integration.test.ts` against PostgreSQL
17.11 and two actual Nest peers: 1/1 PASS, old held GET 401 with no private
Location bytes; fresh and queued 401; retry audit count one; disposable lab
removed. Evidence run `d58f4a6f33e448af81cef0ceae059cf3`. Its focused
#319 session-rotation HTTP regression was 11/11 PASS, run
`c0292c3fd64d4a128ce391d23c45e25a`.

The integrated Prime independently reran that **unchanged strict E001** file:
1/1 PASS in owned run `18cbce203f184936b930e63ff99a32dd`, exit 0,
cleanup 0/0, removed=True. This proves the specific pre-serialization
cancellation window, not a universal last-byte guarantee.

## Regression, static checks and limits

Prime after integration: #315 28/28 PASS in owned run
`d21015cb552647809db6e0150ce41fc6`; #319 89/89 PASS in
`28d6c9db40c44b8ead99af6a4aabc08c`. Both ended exit 0, cleanup 0/0 and
removed=True. The same suites also passed before the runtime cherry-pick:
#315 28/28 in `d324421bc3b74515b64a7a94756cc262` and #319 89/89 in
`576cb6ce75e540b4adfd7269bf7f70b4`. The final #319 run started before a
subsequent case-insensitive route-prefix hardening; that narrow change was
covered separately by unit, typecheck, lint, architecture and adversarial
real Express route matching review.

Integrated Prime: contracts/API builds PASS, API typecheck PASS, API lint PASS,
architecture and line-policy checks PASS (only grandfathered baseline warnings),
new response interceptor unit tests 6/6 PASS (including uppercase Staff route),
private Issue333 classification 2/2 PASS, and Prettier checks PASS.

Independent COS adversarial reviewer W22 checked the integrated 13-file
code/test/docs diff, the additional validation report and owned PostgreSQL logs.
P0/P1: none found. Its one P2 case-sensitive Staff route gap was corrected and
independently rechecked against real Nest Express case-insensitive route
matching. A P3 permissive in-flight emergency test assertion is supplemented by
the unchanged strict E001 HTTP two-peer 401/no-private-body proof; the Owner's
contract permits old HTTP200 as residual in other schedules. The reviewer did
not author or approve its own changes.

The Owner requested branch push **without GitHub CI** on 2026-11-01. PR/CI,
merge and Issue closure are not represented as completed by this local
verification; repository rules require CI before any later merge.

No production deployment is authorized or performed.
