# Issue #333 U-002 — Prime independent reproduction of E-001

Status: **CONFIRMED VULNERABILITY — intentional RED**, real authenticated
Nest HTTP + supported global User-disable writer + PostgreSQL 17.
No production runtime, policy or UI code was changed.

## Independent execution

The W3 original isolated run (`7b5f093c900d4f46b4d3bc0c92bebec4`) was
reviewed and cherry-picked as commit `f38665b4`. Prime then started a
**fresh, separately attested** PostgreSQL cluster and reran the same test from
`audit/issue-333-u002-falsif-prime`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/issue333/run-owned-postgres.ps1 -Suite issue333 -TestFile test/dashboard-issue333-u002-emergency.integration.test.ts
```

Private run ID `cb1a56adc19b4d7db2978d2756dc1dea`; PostgreSQL 17
`170011`, port `63528`, independently attested child DB
`valet_mob007_auth_17880_8b1386cb`. API process PIDs `24240` and
`10084`; first canonical security-disable CLI PID `14672`; independent
database witness PID `26696`. All are task-owned synthetic identities,
never production or shared QA objects.

| Ordered observation | UTC |
| --- | --- |
| API A real SQL completed; held before HTTP serialization | 2026-10-31 22:55:04.079 |
| Canonical User-disable CLI starts | 2026-10-31 22:55:04.329 |
| Canonical CLI exits successfully after SQL COMMIT | 2026-10-31 22:55:04.884 |
| Independent DB witness: User disabled, Staff session revoked, exactly one account audit | 2026-10-31 22:55:04.929 |
| Old reader A real HTTP `finish` with **200** and synthetic protected Location name present | 2026-10-31 22:55:04.935 |

Other same-run observations:

- Fresh API B request after commit: HTTP **401**, protected marker **absent**.
- Same operation ID retried after intentionally ignored CLI stdout:
  audit count remains **1** and User stays disabled.
- Disconnected reader: `AbortError`, server `close` with
  `writableFinished=false`, no later `finish`.
- Exact-key queued writer/reader in PostgreSQL:
  owner backend PID `26696`, exclusive writer PID `19048` blocked by
  `[26696]`, queued HTTP admission PID `2648` blocked by
  `[26696,19048]`; after release, request **401**.

Vitest 4.1.10: **1 test failed of 1**, the strict security assertion at
`dashboard-issue333-u002-emergency.integration.test.ts:229`, because
the protected marker was actually present. Runner exit **1** means RED
security evidence, **never PASS**. The runner printed
`server stopped; exit=1 removed=True`; the new owned child PostgreSQL
cluster was removed after cleanup checks. The pre-existing historical W3
cluster was neither opened for mutation nor removed.

Raw terminal evidence remains inside the ignored private lab directory
`tmp/issue-333-w6-evidence/cb1a56adc19b4d7db2978d2756dc1dea/tests.txt`.
This document records sanitized exact order, identifiers, booleans and
classification without tokens, credentials or external customer data.

## Interpretation and limits

After formatting and extracting test-only witness helpers below the
300-line limit, Prime ran this strict case a **third time** without changing
the security assertion. Private run `16ef8938d9734a0f9666ec8fe2385bf0`
again failed **1/1** at the protected-marker assertion (currently line 243):
PostgreSQL 17.11, separate API PIDs `18872`/`8620`, gate
`23:05:30.042Z`, CLI committed/exited `23:05:30.821Z`, independent
persisted-authority witness `23:05:30.862Z`, old protected HTTP **200**
`finish` `23:05:30.869Z` with marker **present**; fresh HTTP **401** marker
absent. Disconnected reader closed without finish; queued admission returned
401; the output-suppressed retry retained a single audit. Private log:
`tmp/issue-333-w6-evidence/16ef8938d9734a0f9666ec8fe2385bf0/tests.txt`.
Runner returned exit **1**, stopped the owned server and removed the owned
PostgreSQL cluster (`removed=True`). This confirms extraction preserved RED.

The same accepted `DEC-081:19-24` current-access invariant was violated
in the original worker run and two independently launched Prime PostgreSQL/HTTP runs. This is a
**confirmed narrow emergency-disable disclosure** for the Dashboard
Location discovery reader-first schedule. It is not a proof of production
exploitation or of every protected route, and does not modify the separate
`DEC-108` ordinary LocationAccess revoke findings. The test gate pauses
the compiled Nest service **after the real SQL read** and prior to actual
response serialization; no runtime code is changed. Packet-level slow
socket delivery, hard process crash, genuine PostgreSQL COMMIT-ack loss,
and other reader families remain **UNVERIFIED**.

Immediate design consequence: the proposed Organization-scoped session
advisory fence cannot alone resolve E-001 because the canonical global
disable uses a distinct `staff-user-security` advisory domain. A
cross-instance pre-commit abort/admission protocol or an Owner-approved
alternative with its own tested contract is required before implementation
GO. The current runtime finding itself requires separate Owner remediation
authorization.
