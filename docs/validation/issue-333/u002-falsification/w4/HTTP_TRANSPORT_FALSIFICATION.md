# Issue #333 U-002 — W4 actual Node HTTP transport falsification

Status: **9/9 PASS (transport-only)**. This is test-only evidence, not a claim
that any of the five protected authenticated routes is remediated.

## Contract and tested boundary

- `docs/decisions/DEC-108_LOCATION_ACCESS_REVOCATION_DELIVERY.md:17-42`
  requires an ordered canonical revocation COMMIT versus completed protected
  server-side response delivery, including in-flight previously authorized reads.
- `DEC-081_STAFF_ROLE_AND_ACCESS_LIFECYCLE.md:19-34` separately requires
  emergency/security disable to block new and current access immediately.
- `apps/api/src/main.ts:36-55` uses the Nest Express adapter and attaches
  HTTP metrics/drain middleware. The existing `http-metrics.middleware.ts:56-61`
  and `application-drain-middleware.ts:23-35` observe real `finish` and `close`.
- `session-photo-controller.ts:94-120,136-168,170-195` provides a real
  response-close and partial-write precedent, but its witness lock ends after
  synchronous enqueue (`session-photo-delivery-fence.ts:81-118`).

All W4 tests use Node 24.19.0 `node:http` ServerResponse and genuine loopback
TCP sockets (`node:net`/`http.Agent`). Payloads carry only the fixed synthetic
marker `W4_PRIVATE_SYNTHETIC_ONLY_NOT_REAL_CUSTOMER`.

## Reproduction

From the isolated worktree root at baseline `a4f5f2c6589b6be01b7db99cac4e6829986007f1`:

```powershell
node --test apps/api/test/issue333-u002-http-response.test.mjs apps/api/test/issue333-u002-http-cancellation.test.mjs
```

Observed focused result on 2026-11-01: **9 pass, 0 fail** on repeat runs
(1.37–2.64 seconds, including sequential-file rerun). The final run explicitly
reported `end-writableFinished=true; writer-before-finish=true`.

Additional read-only/static gates: `node scripts/architecture-check.mjs` PASS
(unchanged grandfathered-line warnings), `node scripts/architecture-line-policy.mjs`
PASS, and `node --check` PASS for all three authored `.mjs` files. They are
83, 152, and 130 physical lines respectively, each under the 300-line limit.
No dependency installation was required.

| Actual transport scenario | Ordered event/evidence | Result |
| --- | --- | --- |
| 24 MiB paused TCP reader, early simulated revoke | `write(false)` -> `end-return` -> synthetic commit -> real `finish` -> client JS consumes private marker | PASS |
| Same large body, finish-held synthetic writer | `finish` -> synthetic commit, marker subsequently read | PASS |
| Handler releases before delayed stream completion | handler-resolved -> synthetic commit -> later `finish` and marker | PASS |
| Backpressure-aware producer | `write(false)` -> `drain` -> final bytes -> `finish` | PASS |
| Client disconnect during awaited handler | response `close`, **no** `finish`, no protected bytes | PASS |
| Client aborts after a partial protected chunk | client sees irreversible prefix; response `close`, **no** `finish`, no trailer | PASS |
| Forced active connection shutdown | `server.closeAllConnections()` -> response `close`, **no** `finish` | PASS |
| Socket destroyed after large body finishes | `finish` -> `close` before paused JS reader consumes; `writableFinished=true` | PASS |
| HTTP/1.1 keep-alive | same socket reused; two separate responses each emit `finish` | PASS |

On this Node/Windows run, `response.end()` returned with both `writableEnded`
and `writableFinished` true after the 24 MiB write, while the `finish` listener
had **not yet fired** in that synchronous call stack. This falsifies a simple
assumption that `.end()` return and the actual `finish` event are equivalent.
It does not prove the client receives bytes before or after the OS handoff:
Node documents `finish` as handing the last bytes to the operating system,
not acknowledgement by the remote client. Pausing the client suspends its
JavaScript consumption, not necessarily its kernel receive buffers.

## Classification and limitations

**CONFIRMED (transport-only, real Node sockets):** lifecycle and event orders
in the table, late stream bytes after a simulated early release, per-response
keep-alive completion, abort/close handling, and irretractable partial output.

**UNVERIFIED (authenticated/product security):** no real PostgreSQL lock, real
canonical grant revoker, multi-instance API, Nest controller invocation, Express
serialization, proxy/TLS, OS crash, or actual post-COMMIT protected Location
disclosure was exercised here. Synthetic commit events are deliberately local
JavaScript markers. No RED Issue #333 tests were modified or reclassified.

No disposable PostgreSQL cluster was created for W4. The supported Issue #333
private-PG runner restricts filenames to `test/dashboard-issue333-*.integration.test.ts`;
another assigned worker owns DB lease/loss falsification. W4 did not access
the historical W3 cluster or any shared/production database. No production
runtime, schema, grants, dependencies, UI, or policy were changed.
