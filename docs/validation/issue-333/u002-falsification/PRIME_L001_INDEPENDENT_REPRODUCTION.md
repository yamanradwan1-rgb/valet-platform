# Issue #333 U-002 — Prime independent L-001 candidate falsification

Status: **2/2 experimental PASS, security-design RED** for the proposed
uncoupled PostgreSQL session-level response fence. This does **not** claim
a new production U-002 mechanism was deployed or a fifth-route reader
was tested.

W2 independently ran its PostgreSQL 17 test as described in
`w2/README.md`. Prime inspected the synthetic Node HTTP reader, actual
`boundedPostgresPool` lease ownership, one exact Organization advisory
domain, supported MFA Company Admin revoke endpoint and clean cancellation
logic, then cherry-picked it into the dedicated design branch. Prime
reproduced both cases on an **entirely new** owned PostgreSQL instance:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/issue333/run-owned-postgres.ps1 -Suite issue333 -TestFile test/dashboard-issue333-u002-lease.integration.test.ts
```

Isolated run `774fe4d63ffc47a5b4efe681d63515c3`, PostgreSQL 17.
One Vitest file, **2 tests PASS**, 22.90 seconds overall.

| Real ordered witness | Lease watchdog | Attested PostgreSQL backend termination |
| --- | --- | --- |
| SHARED holder backend PID | 10312 | 29416 |
| Blocked canonical EXCLUSIVE writer backend PID | 23680 | 23680 |
| After actual backend/lease loss, CA MFA revoke HTTP | **201** | **201** |
| Persisted Location A grant count after revoke | **0** | **0** |
| Reader advisory locks remaining after COMMIT | **0** | **0** |
| Synthetic HTTP response still able to finish **after** writer result | **true** | **true** |
| Response aborted before finish | **false** | **false** |
| Bounded lease expirations | **1** | **0** |

The test's synthetic protected response returned **200** with its fixed
marker after the authenticated canonical writer committed. The harness
deliberately has no stronger Node abort-before-unlock channel. This
falsifies the proposed *single PostgreSQL session lock as the sole
delivery fence* under actual backend loss; it cannot be reported as
five-route safe GREEN. The future coordinator/transport and emergency
preemption alternatives are **UNVERIFIED**.

The owner-verified runner returned `exit=0 removed=True` after stopping
and cleaning **only this run's** disposable cluster. Raw test log remains
locally under ignored
`tmp/issue-333-w6-evidence/774fe4d63ffc47a5b4efe681d63515c3/tests.txt`.
No credential, token, MFA secret or private customer data is committed;
the historical W3 PostgreSQL artifact was not modified or deleted.
