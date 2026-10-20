# Issue #300 R2 — Actual Location Manager local-session smoke evidence

**Date:** 2026-10-18 (Jordan local time). **Scope:** isolated, disposable R2 database `issue300_r2`, Dashboard loopback `:3114`, **default-disabled** API loopback `:3165`. **Verdict:** real LM authentication/MFA and basic Audit Investigation read smoke **PASS**; overall R2 acceptance remains **NOT READY**.

This is a follow-up to `CA_REAL_SESSION_SMOKE_2026-10-18.md` and `PRIME_R2_LOCAL_READINESS_2026-10-18.md`. No credentials, MFA secret, access token, cookies or recovery codes were read or included in this report.

## User-driven LM smoke actually observed

- The owner confirmed logging in with the **Location Manager** test account and then completing MFA enrollment on the local Dashboard. The actual API operational log recorded `STAFF_AUTH_LOGIN SUCCESS` at **20:37:13**, `STAFF_AUTH_MFA_ENROLLMENT_BEGIN SUCCESS` at **20:40:04** and `STAFF_AUTH_MFA_ENROLLMENT_CONFIRM SUCCESS` at **20:40:21** (local wall clock).
- During the authenticated period, API logs recorded **four** `AUDIT_INVESTIGATION_FILTERS_READ SUCCESS` at **20:41:14**, **one** `AUDIT_INVESTIGATION_SEARCH_READ SUCCESS` and **one** `AUDIT_INVESTIGATION_TIMELINE_READ SUCCESS` at **20:41:22**.
- Before MFA enrollment, a read-only `BEGIN READ ONLY` / `ROLLBACK` query on exact task-owned PostgreSQL had confirmed one active `LOCATION_MANAGER` Staff login session and **one** current granted active Location matching the approved test Organization and Location. The same query before enrollment correctly classified the MFA state as `ENROLLMENT_REQUIRED`; later enrollment confirmation was independently observed in server operational logs. A later direct credential/session-state inspection was refused by the connector safety gate **before execution**. No circumvention was attempted; consequently the later MFA state is established by the successful enrollment-confirm operation, **not** by a new direct credential/session read.
- A separate narrow source-level authority check after LM login passed **30/30** relevant API tests across `investigation-authorization`, `investigation-source-boundary`, and `issue300-closure-security`. These are unit/integration-source assertions, **not** replacement authenticated HTTP response proofs.
- Both Dashboard `:3114` and protected API `:3165` remained bound to `127.0.0.1`, and no additional proof-mode API was enabled or privileged schema operations performed.

## Evidence boundaries and follow-up

**PASS (narrow):** user-driven real LM login, TOTP enrollment confirmation, location-grant evidence, and successful real Filters/Search/Timeline API operations in chronological order. This demonstrates that the basic LM workflow can execute in a protected API without turning MFA off.

**GAP for final acceptance:** this ChatGPT chat cannot connect to the user's originating browser tab; no authorized browser session token was extracted. Consequently the actual Search/Timeline JSON content, source-qualified IDs, exact pagination/keysets, current response-specific signed cursor, detailed Incident denial, live grant revocation, same-fixture frozen UI visuals, held-writer S0→S1, authenticated unsafe-cohort `503`, and high-volume writer/concurrency p95 remain **unproven**. Logged HTTP operation `SUCCESS` must not be represented as proof of the response's historical correctness or the full security matrix. The fixture still lacks independent actual-domain-writer provenance and 100+ evidence for second-page proof.

**Decision:** both CA and LM basic manual login/MFA/read smoke can be marked **observed locally**. Leave the ordinary 503 guard in place. Do not close Issue #300, merge, push or deploy based on these limited observations. The owner need not switch login accounts again for this narrow smoke phase.
