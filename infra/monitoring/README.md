# T4 Guest operational alert integration (not deployed)

`guest-t4-alert-policy.json` is the Owner-approved **target policy**, not a live
alerting configuration. It deliberately contains no guessed provider,
credentials, contact details, SMTP/webhook endpoints or real infrastructure
names. Operations must configure the listed integrations, run a synthetic alert
on **approved staging**, confirm actual delivery, correct escalation and
recovery notification, and record timestamps before claiming qualification.

The API emits privacy-bounded `HTTP_METRIC`, `GUEST_OPERATION_METRIC` and
`RUNTIME_METRIC` structured logs. The runtime stream includes a strict
40-character `VAYLET_RELEASE_GIT_SHA` release identifier or `UNVERIFIED`; the
deployment operator must align this with the immutable release manifest.
These logs are not automatically connected to
Prometheus or a log-to-metric system. The HTTP log stream captures all
requests reaching the API's first middleware, including guard/filter failures,
readiness/drain responses, unknown routes and disconnects. Upstream proxy
requests that never reach the API, WAF drops, end-to-end
availability, host restart, DB provider failover and hard-kill recovery require
independent ingress/infrastructure instrumentation.

`HTTP_METRIC` starts with the four fixed fields `operation`, `outcome`,
`status`, and `durationMs`. For selected allowlisted Staff/health route templates,
the same log line additionally carries a diagnostic suffix: `route`,
`requestId`, `errorCode`, and `reason`. Other routes retain the four-field form.
The `requestId` is exclusively for log correlation, **never** a metric-series
label, histogram dimension, or aggregation key. Its bounded text format does
not bound the number of distinct request IDs. Approved low-cardinality
aggregation dimensions may use the fixed operation/outcome/status classes and
the explicitly bounded route/errorCode/reason classifications; `durationMs`
is a numeric observation, not a label.

An external parser requiring the log line to end immediately after
`durationMs` may reject the extended records. Confirm the actual selected
provider's parser, field allowlist, ingestion and series labels with sanitized
ordinary and extended samples before declaring compatibility. No repository
parser/exporter, deployed provider, ingestion outcome or alert delivery is
established by this documentation. A production ingestion/schema change needs
its separately verified contract and Owner approval.

To configure a provider, create fixed-field parsing rules. Never use raw paths,
query strings, headers, IPs, session IDs, tenant IDs, tokens, vehicle data or
free-text error messages as metric labels. Convert duration samples into
bounded histograms and calculate the five-minute ratio/quantile alerts from
the confirmed full ingest stream. The pool reporter emits cumulative
`acquisitions` and `acquisitionsOver200Ms` counters: their five-minute deltas
support the exact fraction of acquisitions taking over 200ms; a strict
`>5%` fraction establishes that the p95 exceeded 200ms, assuming the complete
non-reset five-minute sample window is ingested. Reset-aware aggregation and
alert delivery must still be validated in the chosen provider. Every alert has
`OPERATOR_TO_ASSIGN` destination,
so **no alert delivery or page readiness is claimed** by this repository.
