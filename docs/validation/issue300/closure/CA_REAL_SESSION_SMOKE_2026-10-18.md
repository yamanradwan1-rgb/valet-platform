# Issue #300 R2 — Actual Company Admin local-session smoke evidence

**Scope:** Local, task-owned R2 PostgreSQL `issue300_r2_pg17`, loopback API `:3165`, Dashboard `:3114`. This is a narrow **CA smoke follow-up** to `PRIME_R2_LOCAL_READINESS_2026-10-18.md`; it does **not** supersede that document's **NOT READY** release decision.

## Newly observed genuine user-driven activity

- The human tester confirmed manually logging in to the local Dashboard as Company Admin. Read-only PostgreSQL inspection on the exact R2 DB found **one active ORG_ADMIN Staff session** created during the current attempt, with active TOTP factor and MFA timestamps meeting the server's normal non-sensitive policy (maximum eight-hour assurance and thirty-minute admin inactivity window).
- The active session's membership is in the **exact one attested test Organization and Location**; read-only membership/Organization/Location containment check returned **one** active scoped admin session.
- Server operational logs on the actual `:3165` API show `STAFF_AUTH_LOGIN SUCCESS`, `STAFF_AUTH_MFA_ENROLLMENT_BEGIN SUCCESS`, `STAFF_AUTH_MFA_ENROLLMENT_CONFIRM SUCCESS`; corresponding auth requests returned **HTTP 200**. No credential, token, TOTP code, factor secret, recovery code, e-mail or member ID is included in this evidence.
- Following the MFA confirmation, API operational logs contain four `AUDIT_INVESTIGATION_FILTERS_READ SUCCESS`, one `AUDIT_INVESTIGATION_SEARCH_READ SUCCESS` and one `AUDIT_INVESTIGATION_TIMELINE_READ SUCCESS`. Read-only database shows last admin activity after the TOTP MFA confirmation, consistent with the successful protected requests. The preceding recorded Search error was `STAFF_AUTHENTICATION_REQUIRED` **before** these authenticated successes; do not misrepresent it as a post-MFA application failure.
- Dashboard root returned **HTTP 200**; anonymous `GET /v1/staff/auth/mfa/state` returned **HTTP 401** as expected. Default API `:3165` remains without the short-lived R2 indirect proof bypass, and `:3164` was **not** re-enabled.

## Evidence strength and remaining gaps

**PASS (limited):** Actual user-driven CA password login, TOTP enrollment/confirmation, active server-side MFA state, current in-scope Organization Admin membership, logged protected Filters/Search/Timeline successful API operations and the expected anonymous auth denial. The source enforces MFA and scope before the protected Search/Timeline queries; this observed sequence is stronger than a simulated unit-test fixture.

**Still GAP:** The current ChatGPT browser integration cannot access the originating browser tab from this chat, so there is **no direct inspection** of rendered UI, HTTP response bodies, signed cursors, browser cookies or the authenticated session bearer. This round did not prove Search/Timeline exact item IDs, full Detail drawer, source coverage, signed second pages, held-writer S0→S1 or authenticated `503` on an unsafe cohort. There are only two seeded Sessions / seven source records, not the `>100` independent operational-writer event cohort required for second-page and scale acceptance. LM actual-login/MFA/role/Location tests have **not** been run yet.

This is a real local CA smoke observation, not a final T01–T70/U05-R01–R09 release PASS and not a reason to lift the ordinary 503 safety gate. Keep passwords, bearer/session IDs, cookies and MFA seeds private. Continue with a separately logged-in Location Manager only after the user switches accounts; do not assume the CA's session carries over to LM.
