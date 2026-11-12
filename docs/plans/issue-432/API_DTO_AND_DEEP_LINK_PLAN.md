# Issue #432 — Alert DTO and exact-source deep-link plan

**Status: proposed integration plan only; baseline `a9c1c06c`.** This is a plan for production Issue #432 UI-02, not a merged route/DTO, a production flag change, or an approval to weaken DEC-109/110/111. The local prototype may demonstrate row activation with a separate in-memory synthetic destination view; that demo uses no production route/API and proves no source authorization. Production authoritative source must always be queried and protected in the API; the client may not use a notification's source ID as proof of visibility.

## CURRENT transport and source access

| Capability | Code anchor | Observed behavior / limitation |
| --- | --- | --- |
| Phase-1 list + exact | `apps/api/src/modules/dashboard/management-alert-preview.controller.ts:71-106,136-175`; `packages/contracts/src/management-alert-preview.ts:22-81` | `GET /v1/staff/dashboard/locations/:locationId/alerts/preview` and `GET .../sources/:category/:sourceId?episodeId=...`; exact response is `{item,valetSessionId}`. Both protected by Phase-1 flag, session, and exact source query. Legacy schema cannot silently add a required field. |
| Unified list + exact | Same controller `:108-134,177-218`; `management-alert-unified-preview.ts:52-146` | `GET .../preview-unified` and `GET .../sources-unified/:category/:sourceId?episodeId=...`; additive gated Phase 2/3 response, title/time/category/opaque IDs but **no summary/description or navigation contract**; unified exact `valetSessionId` is null except Phase-1 ALT-01. Controller rejects ALT-17. The existing preview route is Location-scoped; it cannot satisfy the latest requirement that ALT-15 be available to CA independently of any selected Location. Existing unified exact detail also derives its Organization from a Location-scoped audience read, so it is not an Organization-scoped contract for ALT-15.
| Seen | Same controller `:220-258`; `management-alert-unified-preview.ts:148-155`; `management-alert-seen/management-alert-seen-command.ts` | Explicit `PUT .../sources-unified/:category/:sourceId/seen` with body `{episodeId}`. Only ALT-05/07/09/13/15. Source entitlement and current occurrence are re-authorized in a protected transaction, but the current route/authorizer also carries selected-Location context. ALT-15 needs a separate Organization-scoped CA-only Seen path that does not require selected Location. |
| Legacy frontend source navigation | `apps/dashboard/src/features/management-alerts/alert-source-intent.ts:23-75`, `alert-exact-source-dialog.tsx:27-164`, `management-alerts-control.tsx:249-269` | `RETRIEVAL→/live-operations`, `TASK→/tasks`, `INCIDENT→/incidents`, `PRESENCE→/policies?section=presence` with `alertCategory`,`alertSourceId`,`alertEpisodeId`. But those pages mount a **FocusDialog** showing the alert metadata; they do not select the corresponding existing session/task/incident/presence record/drawer. |
| Unified frontend source behavior | `management-alerts-control.tsx:242-247`; `alert-unified-list.tsx:50-100`; `alert-unified-actions.ts:104-161` | `View source details` invokes inline exact read and renders category/time inside the bell dialog; there is **no route/deep-link or row click navigation** for unified categories. |
| Restricted commercial utility | `alert-commercial-restriction.ts:10-29`; `administration/commercial/subscription-page.tsx:101-109` | ALT-17 is an inline CA-only subscription-recovery notice on `/billing-subscription`, never an unrestricted unified-bell item. |

## PROPOSED narrow DTO contract

Retain the existing legacy `/preview` and current unified list/detail/Seen schemas unchanged. Introduce an **additive, separately gated v2 exact-source display contract**; never silently require a new field from old clients. Prefer server-owned, closed per-category data over raw source metadata. Proposed scoped endpoints (not implemented):

```http
# Location-scoped categories only; ALT-15 is explicitly excluded.
GET /v2/staff/dashboard/locations/:locationId/alerts/:category/:sourceId/display?episodeId=:episodeId

# Organization-scoped ALT-15 only; no selected Location is part of this route.
GET /v2/staff/dashboard/organizations/:organizationId/alerts/ALT-15/:sourceId/display?episodeId=:episodeId

# Organization-scoped normal-bell preview; locationId is optional and untrusted.
# With no locationId, a currently authorized CA can still receive ALT-15.
GET /v2/staff/dashboard/organizations/:organizationId/alerts/preview-unified?locationId=:locationId

# Organization-scoped ALT-15 Seen only; no selected Location is part of this route.
PUT /v2/staff/dashboard/organizations/:organizationId/alerts/ALT-15/:sourceId/seen
{ "episodeId": "<untrusted committed occurrence selector>" }
```

The **response** must include `Cache-Control: no-store`; this is not a request header. All four v2 route shapes above are proposals only. Versioning is independent of activation: keep them server-gated OFF until a separately approved rollout, and do not let a browser flag grant access. The combined preview independently authorizes any optional Location scope for Location categories and the owning Organization scope for ALT-15; the selected Location is never required for ALT-15 and never confers its authority. Existing v1 preview/detail/Seen routes remain unchanged for their current Location-scoped behavior and cannot be treated as satisfying this Organization-scope requirement.

These are distinct scope-specific reads; do not implement a generic Location-only endpoint and special-case ALT-15 after Location authorization. For Location categories, reauthorize the current Staff session, the exact selected Location grant, its owning Organization, entitlement/MFA, category-specific source visibility, source state/episode and the committed-occurrence 7-day rule where applicable. For ALT-15, the Organization preview, exact display and Seen paths must independently reauthorize the current Staff session, current active Company Admin (`ORG_ADMIN`) membership for that exact Organization, active Organization, Dashboard commercial entitlement, the approved CA audit-read capability and required MFA assurance. ALT-15's audit source must remain Organization-scoped (`audit_events.location_id IS NULL`); these reads must not require, derive authority from, or be narrowed by a selected Location or Location grant. A selected Location/display context is not an authorization input and must never be used as a substitute for current Company Admin membership. The combined preview applies authorization before count/correlation/LIMIT 21, filters Seen before the global cap and merges Location + Organization candidates under one server-authoritative order. The exact reader resolves any related Task/Session/Payment/Incident/Shift/Membership target inside the same protected source-authorized read. No first-page lookup, broad admin list, client-supplied related ID, display-context authority, or stale preview may supply the destination.

Proposed field shapes (names **illustrative, not accepted schema**):

```ts
type AlertDisplayCategory =
  | "ALT-01" | "ALT-02" | "ALT-03" | "ALT-04" | "ALT-05" | "ALT-06"
  | "ALT-07" | "ALT-08" | "ALT-09" | "ALT-10" | "ALT-11" | "ALT-12"
  | "ALT-13" | "ALT-15" | "ALT-16";

// Closed catalog keys, not arbitrary strings supplied by a source row.
type AlertTitleKey =
  | "ALT01_RETRIEVAL_SLA_EXCEEDED"
  | "ALT02_UNASSIGNED_PARKING" | "ALT02_UNASSIGNED_RETRIEVAL"
  | "ALT03_UNASSIGNED_AFTER_DECLINE_PARKING" | "ALT03_UNASSIGNED_AFTER_DECLINE_RETRIEVAL"
  | "ALT04_RETRIEVAL_STAGE_DELAYED" | "ALT05_EMERGENCY_TAKEOVER"
  | "ALT06_VEHICLE_READY_FOR_HANDOFF"
  | "ALT07_HANDOFF_VERIFICATION_EXHAUSTED" | "ALT07_SUPERVISOR_HANDOFF_OVERRIDE"
  | "ALT08_CRITICAL_INCIDENT" | "ALT08_HIGH_SEVERITY_INCIDENT"
  | "ALT09_GEOFENCE_VIOLATION" | "ALT10_PAYMENT_FAILED"
  | "ALT11_PAYMENT_OUTCOME_UNCONFIRMED" | "ALT12_PRESENCE_EXCEPTION_REVIEW"
  | "ALT13_SHIFT_FORCE_ENDED" | "ALT15_STAFF_ROLE_CHANGED"
  | "ALT15_STAFF_LOCATION_ACCESS_REVOKED" | "ALT16_LOCATION_INTAKE_STOPPED";
type AlertSummaryKey =
  | "ALT01_CURRENT_RETRIEVAL_SLA_BREACH"
  | "ALT02_TASK_AWAITING_FIRST_ASSIGNMENT"
  | "ALT03_TASK_UNASSIGNED_AFTER_RECORDED_DECLINE"
  | "ALT04_RETRIEVAL_STAGE_EXCEEDED_DELAY"
  | "ALT05_COMMITTED_EMERGENCY_TAKEOVER"
  | "ALT06_READY_OR_HANDOFF_PENDING_EXCEEDED_DELAY"
  | "ALT07_TERMINAL_FAILURE_OR_SUPERVISOR_OVERRIDE"
  | "ALT08_CURRENT_OPEN_OR_INVESTIGATING_INCIDENT"
  | "ALT09_COMMITTED_GEOFENCE_VIOLATION"
  | "ALT10_CONFIRMED_COLLECTION_FAILURE"
  | "ALT11_COLLECTION_OUTCOME_STILL_UNKNOWN"
  | "ALT12_VIEWER_REVIEWABLE_PENDING_EXCEPTION"
  | "ALT13_COMMITTED_ADMINISTRATIVE_SHIFT_FORCE_END"
  | "ALT15_COMMITTED_STAFF_SECURITY_EVENT"
  | "ALT16_CURRENT_LOCATION_NOT_ACCEPTING_INTAKE";

type SafeAlertFactsV2 = {
  sourceStatus?: "OPEN" | "INVESTIGATING";
  incidentSeverity?: "HIGH" | "CRITICAL";
  taskType?: "PARKING" | "RETRIEVAL";
  handoffEventKind?: "TERMINAL_FAILURE" | "SUPERVISOR_OVERRIDE";
  geofenceSubtype?: "RESTRICTED_ENTRY" | "LEFT_ALLOWED_UNION";
  staffEventKind?: "ROLE_CHANGED" | "LOCATION_ACCESS_REVOKED";
}; // Runtime object must be strict: no additional source fields.

type AlertSourceTimeKindV2 =
  | "RETRIEVAL_REQUESTED_AT" | "INITIAL_QUEUE_EVENT_AT" | "DECLINE_EVENT_AT"
  | "RETRIEVAL_STAGE_ENTRY_AT" | "TAKEOVER_COMMITTED_AT" | "SESSION_READY_AT"
  | "HANDOFF_AUDIT_EVENT_AT" | "INCIDENT_CREATED_AT" | "GEOFENCE_RECORDED_AT"
  | "PROVIDER_FAILURE_EVIDENCE_AT" | "COLLECTION_DISPATCH_GUARDED_AT"
  | "PRESENCE_EXCEPTION_REQUESTED_AT" | "SHIFT_FORCE_END_AUDIT_AT"
  | "STAFF_SECURITY_AUDIT_AT" | "CURRENT_STATE_NO_START_TIME";

type LocationAlertDisplayCategory = Exclude<AlertDisplayCategory, "ALT-15">;
type AlertSourceIdentityV2 =
  | {
      sourceScope: {
        kind: "LOCATION";
        organizationId: string;
        locationId: string;
      };
      category: LocationAlertDisplayCategory;
      sourceId: string;                // UUID; exact owning source identity
      episodeId: string;               // bounded existing episode key, e.g. TaskId:version or "current"
    }
  | {
      sourceScope: {
        kind: "ORGANIZATION";
        organizationId: string;
        locationId: null;
      };
      category: "ALT-15";
      sourceId: string;                // UUID; exact owning Membership identity
      episodeId: string;               // exact committed audit-event UUID
    };

type AlertExactSourceDisplayV2 = {
  schemaVersion: 2;
  item: AlertSourceIdentityV2 & {
    titleKey: AlertTitleKey;
    summaryKey: AlertSummaryKey;
    sourceTime: {
      at: string | null;                // same authoritative clock as the preview; null only for ALT-16
      kind: AlertSourceTimeKindV2;
    };
    safeFacts?: SafeAlertFactsV2;
  };
  destination: AlertDestinationV2;
};

type LocationAlertDestinationSelectorV2 =
  | { state: "AVAILABLE"; sourceScope: "LOCATION"; category: "ALT-01" | "ALT-06"; routeKey: "LIVE_OPERATIONS"; targetKind: "SESSION"; targetRecordId: string }
  | { state: "AVAILABLE"; sourceScope: "LOCATION"; category: "ALT-02" | "ALT-03" | "ALT-04"; routeKey: "TASKS"; targetKind: "TASK"; targetRecordId: string }
  | { state: "AVAILABLE"; sourceScope: "LOCATION"; category: "ALT-05"; routeKey: "TASKS"; targetKind: "TAKEOVER_EVENT"; sourceContext: { sourceRecordId: string; relatedTargetKind: "TASK"; relatedTargetRecordId: string; eventKind: "EMERGENCY_TAKEOVER" } }
  | { state: "AVAILABLE"; sourceScope: "LOCATION"; category: "ALT-07"; routeKey: "LIVE_OPERATIONS"; targetKind: "HANDOFF_EVENT"; sourceContext: { sourceRecordId: string; relatedTargetKind: "SESSION"; relatedTargetRecordId: string; eventKind: "HANDOFF_VERIFICATION_EXHAUSTED" | "SUPERVISOR_HANDOFF_OVERRIDE" } }
  | { state: "AVAILABLE"; sourceScope: "LOCATION"; category: "ALT-08"; routeKey: "INCIDENTS"; targetKind: "INCIDENT"; targetRecordId: string }
  | { state: "AVAILABLE"; sourceScope: "LOCATION"; category: "ALT-09"; routeKey: "TASKS"; targetKind: "GEOFENCE_EVENT"; sourceContext: { sourceRecordId: string; relatedTargetKind: "TASK"; relatedTargetRecordId: string; eventKind: "GEOFENCE_RESTRICTED_ENTRY" | "GEOFENCE_LEFT_ALLOWED_UNION" } }
  | { state: "AVAILABLE"; sourceScope: "LOCATION"; category: "ALT-10" | "ALT-11"; routeKey: "PAYMENTS"; targetKind: "PAYMENT"; targetRecordId: string }
  | { state: "AVAILABLE"; sourceScope: "LOCATION"; category: "ALT-12"; routeKey: "PRESENCE_POLICIES"; targetKind: "PRESENCE_EXCEPTION"; targetRecordId: string }
  | { state: "AVAILABLE"; sourceScope: "LOCATION"; category: "ALT-13"; routeKey: "EMPLOYEES"; targetKind: "SHIFT_EVENT"; sourceContext: { sourceRecordId: string; relatedTargetKind: "STAFF_SHIFT"; relatedTargetRecordId: string; eventKind: "SHIFT_FORCE_ENDED" } }
  | { state: "AVAILABLE"; sourceScope: "LOCATION"; category: "ALT-16"; routeKey: "LOCATIONS"; targetKind: "LOCATION"; targetRecordId: string };

type OrganizationAlertDestinationSelectorV2 = {
  state: "AVAILABLE";
  sourceScope: "ORGANIZATION";
  category: "ALT-15";
  routeKey: "EMPLOYEES";
  targetKind: "STAFF_EVENT";
  sourceContext: {
    organizationId: string;
    sourceRecordId: string;            // committed Organization-level audit event UUID
    relatedTargetKind: "STAFF_MEMBERSHIP";
    relatedTargetRecordId: string;     // same Organization's target Membership UUID
    eventKind: "STAFF_ROLE_CHANGED" | "STAFF_LOCATION_ACCESS_REVOKED";
  };
};

type AlertDestinationSelectorV2 =
  | LocationAlertDestinationSelectorV2
  | OrganizationAlertDestinationSelectorV2
  | { state: "UNAVAILABLE"; reason: "NO_SAFE_EXACT_DESTINATION" };

type AlertDestinationV2 = {
  sourceIdentity: AlertSourceIdentityV2; // must exactly equal item category/sourceScope/sourceId/episodeId
  selector: AlertDestinationSelectorV2;
};
```

`organizationId`, `locationId`, `sourceId`, `sourceRecordId`, `relatedTargetRecordId` and `targetRecordId` are UUIDs. `episodeId` is a bounded 1–150 character source-defined key (including Task `taskId:version` and ALT-16's literal `current`); never parse it as a UUID generically. `sourceIdentity.sourceScope` is part of the exact source identity: ALT-01..13 and ALT-16 must use `{kind:"LOCATION", organizationId, locationId}`; ALT-15 must use `{kind:"ORGANIZATION", organizationId, locationId:null}`. The scope is established by the matching protected source read, not copied from an untrusted request or inferred from the currently displayed tenant/location. `sourceTime.at` is an ISO-8601 UTC timestamp for the same authoritative source/eligibility clock as the preview, not delivery time; `CURRENT_STATE_NO_START_TIME` requires `at=null` and is reserved for ALT-16. The category-specific `sourceTime.kind` mapping is fixed in `ALERT_CATEGORY_CONTENT_MATRIX.md`. The response validator must also enforce category-specific `titleKey`, `summaryKey`, `sourceTime.kind` and `safeFacts` combinations (ALT-02/03 `taskType`; ALT-07 `handoffEventKind`; ALT-08 `sourceStatus` + `incidentSeverity`; ALT-09 `geofenceSubtype`; ALT-15 `staffEventKind`). `titleKey` and `summaryKey` resolve only through exhaustive AR/EN catalogs; `safeFacts` must be a strict allowlist and is omitted if fixed copy is sufficient.

`routeKey` is a closed client-side mapping to an **existing mounted route** (`/live-operations`, `/tasks`, `/incidents`, `/policies?section=presence`, `/payments`, `/employees`, `/locations`); the API must never return an arbitrary URL. `targetRecordId` is returned only after the exact category reader has proven the target relationship and the destination page has an exact-ID read/selection implementation. For event-backed rows, `sourceContext` carries the committed source event/operation plus the related record proven by that same source read; it is a narrowly scoped selector, not permission to open generic audit history. Do not reinterpret an operation/event `sourceId` as a Task/Session ID. A strict response validator must enforce category-to-selector and source-scope pairs in `AlertDestinationSelectorV2`: ALT-15 is valid only with `sourceScope="ORGANIZATION"`; all other enabled DISPLAY categories are valid only with `sourceScope="LOCATION"`. For ALT-15 `AVAILABLE`, it must additionally require `sourceContext.organizationId === item.sourceScope.organizationId`, `sourceContext.sourceRecordId === item.episodeId` and `sourceContext.relatedTargetRecordId === item.sourceId`. For `AVAILABLE`, it must reject any mismatch between `item` and `destination.sourceIdentity` (including `sourceScope`) or between source identity and selector category/scope. For `UNAVAILABLE`, it must still require `destination.sourceIdentity` to equal the item identity, including source scope.

`destination.selector.state="AVAILABLE"` is permitted only after the matching destination page has implemented exact selector parsing, a by-ID authorized read under the **same source scope**, and record/context selection. A mounted category page alone is insufficient. Until those three conditions exist for that category, the matching scoped v2 endpoint must return `selector.state="UNAVAILABLE"` with `NO_SAFE_EXACT_DESTINATION`; the current baseline does not yet prove that any destination page supports this new selector end to end. In particular, do not infer exact navigation from the current Phase-1 `valetSessionId`, an existing list drawer, a route's existence, or an active selected Location when the source scope is Organization-level.

The destination page treats every returned ID/selector as an untrusted locator and independently reauthorizes the **same alert source identity** and destination record before selecting its drawer/context. For `sourceScope.kind="LOCATION"`, it rechecks the current Staff session, Organization, selected Location grant and page-specific by-ID permission. For `sourceScope.kind="ORGANIZATION"` (ALT-15 only), it rechecks the current Staff session, current active Company Admin membership for the exact Organization, active Organization, Dashboard commercial entitlement, approved CA audit-read capability and required MFA assurance; it performs no selected-Location authorization and must not accept a Location grant or selected Location as a substitute. The organization ID in the URL is only an untrusted selector. This source identity is essential: Task `sourceId` alone cannot distinguish ALT-02/03/04 version episodes; Session/Payment IDs alone cannot prove the original retrieval request or collection operation; and ALT-13/15 use an owning Shift/Membership ID distinct from the committed audit event. The v2 response is **not a capability token or a transferable grant**. The client serializes the exact `destination.sourceIdentity` unchanged together with the returned selector into validated, single-valued route query state: `alertSourceScope` + `alertOrganizationId` + (for Location only) `alertLocationId` + `alertCategory` + `alertSourceId` + `alertEpisodeId`, plus either `alertTargetKind` + `alertTargetRecordId`, or `alertTargetKind` + `alertSourceRecordId` + `alertRelatedTargetKind` + `alertRelatedTargetRecordId` + `alertEventKind`. The destination must reject duplicate/missing/incompatible query values, re-read the exact source using category/sourceId/episodeId under the same source scope, prove that the source still resolves to the same target selector, then perform its own authorized by-ID target read. It never invents a selector from list/display context. A stale, revoked, deleted, mismatched or no-longer-current source/target resolves to the same nondisclosing unavailable UI.

**One row-click sequence:** (1) choose the endpoint only from the closed category-to-scope contract: ALT-15 calls the proposed Organization-scoped route with `organizationId` as an untrusted selector; ALT-01..13 and ALT-16 call the proposed Location-scoped route with `locationId`; never infer authority from the selected/displayed Location; (2) the server reauthorizes the exact source under that route's scope and returns its verified `sourceIdentity`; (3) if exact source is unavailable/ineligible, or `destination.selector.state === "UNAVAILABLE"`, show the localized “No safe destination is available for this alert” / “لا يتوفر انتقال آمن لهذا التنبيه حاليًا” fallback and do not navigate; (4) if `AVAILABLE`, map its allowlisted routeKey to the existing route and pass both the unchanged scoped `destination.sourceIdentity` and exact typed selector; (5) destination reauthorizes the same source episode and target under the same scope, confirms the returned selector still matches, and selects the exact record/context or shows the same unavailable fallback. Both proposed routes fail closed; a displayed Organization/Location context never grants authority.

The `sourceKind` enum already exists; do not duplicate it without a concrete distinction. The browser localizes `titleKey`/`summaryKey` using an exhaustive AR/EN mapping, but must not derive privilege or subtype from translated text. Only expose facts individually permitted by the category reader; omit `safeFacts` entirely if fixed text suffices. Never return incident narrative, payment provider reference or payer data, takeover reason, staff private changes, GPS coordinates/routes, pickup codes, or sensitive audit metadata.

**API read discipline:** implement two separately routed, separately authorized v2 exact-source reads; do not blindly reuse `readUnifiedManagementAlertDetail()` (`management-alert-unified-detail-query.ts:47-221`) for ALT-15 because its current `UnifiedExactInput` requires `locationId` and obtains Organization through a Location-scoped audience read. The Location-scoped proposal reuses only the applicable Location authorization primitives and reauthorizes category + sourceId + episodeId + exact Location grant + owning Organization + entitlement/MFA + category-specific source and occurrence 7-day rule in one protected read. The ALT-15 Organization-scoped proposal accepts no `locationId`; under the current protected Staff session it independently reauthorizes active Company Admin (`ORG_ADMIN`) membership for the requested Organization, active Organization, Dashboard commercial entitlement, the CA audit-read capability (the current source reader checks `TENANT_AUDIT_READ_ELIGIBLE`; reconcile the Seen-side capability-label mismatch before sharing/centralizing this guard) and required MFA assurance, then reads only the exact Organization audit occurrence (`location_id IS NULL`) and its same-Organization target Membership. Membership/Organization/entitlement must be rechecked after the session-first lock and shared Organization fence; a pre-fence membership hint is not authorization. It must not call Location-grant authorization or use the display context to derive Organization authority. Both reads return the typed `destination` projection in the same protected read. A mismatch, stale episode, revoked scope or absent source gets a nondisclosing unavailable response. A valid source with no safe exact destination gets `200` with `destination.selector.state="UNAVAILABLE"`. Both responses use `Cache-Control: no-store`. Never use a prior list response as authorization for a later click.

## Existing Dashboard destinations and exact-source gaps

Route strings below are **verified mounted routes**, not proof that exact-source deep links already work. Every proposed row click first obtains or uses a fresh exact source read, then opens the **specific authorized record/occurrence** within the destination, not a second generic modal or a category landing. Any necessary new `alert*` query keys must be validated, single-valued, scoped and treated as untrusted selectors.

| ALT | CURRENT source/identity and destination | PROPOSED v2 destination selector; current readiness |
| --- | --- | --- |
| **01** | Retrieval request UUID; legacy exact source returns `valetSessionId` (`management-alert-source-detail-query.ts:60-69`). `/live-operations` exists. | Candidate: `routeKey=LIVE_OPERATIONS`, `targetKind=SESSION`, `targetRecordId` = Session ID proven by exact retrieval source read. Destination must also recheck the same current retrieval attempt. Current `AlertExactSourceSurface` is only a metadata dialog, so v2 returns `UNAVAILABLE` until exact Session selection is implemented. |
| **02,03** | Task UUID + version episode (`dispatch/uncovered-task-alert-query.ts:165-203`), `/tasks` exists. | Candidate: `routeKey=TASKS`, `targetKind=TASK`, `targetRecordId` = currently authorized Task ID. Destination rechecks the exact version/episode; no first-page assumption; unavailable after reassignment, renewed decline or mismatch. Return `UNAVAILABLE` until exact Task selector support exists. |
| **04** | Retrieval Task UUID + version; `/tasks` exists. | Candidate: same `TASK` target. Revalidate current ACCEPTED/IN_PROGRESS stage, stage clock and ALT-01 suppression before selecting exact Task context. Return `UNAVAILABLE` until exact Task selector support exists. |
| **05** | Takeover **operation UUID** (both source and episode); reader has correlated Task/Session IDs internally (`emergency-takeover-occurrence-reader.ts:35-106`); `/tasks` exists. | Candidate: `routeKey=TASKS`, `targetKind=TAKEOVER_EVENT`, `sourceContext={sourceRecordId: operationId, relatedTargetKind: TASK, relatedTargetRecordId: provenTaskId, eventKind: EMERGENCY_TAKEOVER}`. The current Tasks page has no proven exact takeover-event context, so return `UNAVAILABLE` until that read-only context and CA/MFA reauthorization exist. DEC-107 remains Proposed pending compatibility reconciliation; do not activate ALT-05 by treating the current source reader as approval to close that decision. Never treat operation UUID as Task UUID or grant takeover-command permission. |
| **06** | Session UUID + proved READY audit episode (`retrieval-ready-alert-reader.ts:90-106`); `/live-operations` exists. | Candidate: `LIVE_OPERATIONS` + `SESSION` + source-authorized Session `targetRecordId`; destination rechecks the same READY/HANDOFF_PENDING episode and retires after release. Return unavailable until exact Session selection is supported. |
| **07** | Handoff **audit event UUID** + authorized Session ID known only inside reader (`handoff-terminal-occurrence-reader.ts:35-97`); `/live-operations` exists. | Candidate: `LIVE_OPERATIONS`, `HANDOFF_EVENT`, `sourceContext={sourceRecordId: auditEventId, relatedTargetKind: SESSION, relatedTargetRecordId: provenSessionId, eventKind: HANDOFF_VERIFICATION_EXHAUSTED or SUPERVISOR_HANDOFF_OVERRIDE}`. No current exact event context; unavailable until added. No generic audit detail, proof codes or release inference. |
| **08** | Incident UUID (`incident-alert-reader.ts:24-55`), `/incidents` exists with incident drawer (`incidents-page.tsx:49-61,151-235`). | Candidate: `INCIDENTS` + `INCIDENT` + source-authorized Incident `targetRecordId`. Destination rechecks current HIGH/CRITICAL + OPEN/INVESTIGATING even when outside first page. Existing drawer alone does not prove query-selector support; unavailable until exact deep-link selection is implemented. |
| **09** | Geofence **event UUID**, proven subtype and Task/Session correlation internal (`geofence-violation-alert-reader.ts:21-75`); `/tasks` and `/maps-zones` exist. | Candidate: `TASKS`, `GEOFENCE_EVENT`, `sourceContext={sourceRecordId: eventId, relatedTargetKind: TASK, relatedTargetRecordId: provenTaskId, eventKind: GEOFENCE_RESTRICTED_ENTRY or GEOFENCE_LEFT_ALLOWED_UNION}`. Current exact event viewer is absent; return unavailable until the historical read-only context exists. Never navigate to present coordinates or claim vehicle still outside; preserve source-specific tracking grant. |
| **10,11** | Payment UUID + collection **operation UUID** (`financial-alert-source-query.ts:101-118`); `/payments` exists, but current Payments page presents financial aggregate/breakdowns (`intelligence/payments-page.tsx:27-110`). | Candidate: `PAYMENTS` + `PAYMENT` + source-authorized Payment `targetRecordId`. Current page has no exact Payment detail context; return unavailable until a narrow read-only exact Payment view exists. No provider reference, payer data, charge/retry/refund action or general Payment detail privilege. |
| **12** | Presence exception UUID and personal `canReview` (`presence-review-alert-reader.ts:22-65`), existing `/policies?section=presence`. | Candidate: `PRESENCE_POLICIES` + `PRESENCE_EXCEPTION` + authorized exception `targetRecordId`. Destination rechecks current personal `canReview` and self-review prohibition. Return unavailable until exact exception selection is implemented. |
| **13** | Shift UUID + separate forced-end **audit event UUID** (`force-ended-shift-occurrence-reader.ts:30-79`); `/employees` Staff page has a `shifts` tab (`staff-page.tsx:76-129`). | Candidate: `EMPLOYEES`, `SHIFT_EVENT`, `sourceContext={sourceRecordId: auditEventId, relatedTargetKind: STAFF_SHIFT, relatedTargetRecordId: provenShiftId, eventKind: SHIFT_FORCE_ENDED}`. Current Staff tabs have no exact occurrence context; return unavailable until added. No broad closure-table SELECT, force-end reason or cash data. |
| **ALT-14** | **DISABLED; no source**. | No route, copy, Seen or count. |
| **15** | Staff membership UUID + source **audit event UUID**, Organization-scoped and CA-only (`staff-security-occurrence-reader.ts:29-82`); source row is `audit_events.location_id IS NULL`; `/employees` exists. | **Organization-scoped proposal only:** call `/v2/staff/dashboard/organizations/:organizationId/alerts/ALT-15/...`, with no `locationId`. Candidate: `EMPLOYEES`, `STAFF_EVENT`, `sourceScope="ORGANIZATION"`, `sourceContext={organizationId, sourceRecordId: auditEventId, relatedTargetKind: STAFF_MEMBERSHIP, relatedTargetRecordId: provenMembershipId, eventKind: STAFF_ROLE_CHANGED or STAFF_LOCATION_ACCESS_REVOKED}`. The read and destination must reauthorize the current active Company Admin membership and exact active Organization, Dashboard entitlement, CA audit-read capability and MFA; selected Location/display context and Location grants are irrelevant and cannot confer authority. No exact sanitized event context currently; return unavailable until CA-only exact read/UI exists. Membership ID alone is not an occurrence ID. |
| **16** | Current Location UUID, `episodeId='current'`, `occurredAt=null` (`management-alert-unified-detail-query.ts:156-164`); `/locations` exists. | Candidate: `LOCATIONS` + `LOCATION` + source-authorized Location `targetRecordId`; destination rechecks ACTIVE + `accepting_intake=false`. Return unavailable until exact Location selection is implemented; never invent stopped-since or Seen. |
| **17** | No normal `sources-unified` route: controller explicitly rejects it (`management-alert-preview.controller.ts:197-205`); `/billing-subscription` has current CA-only notice. | Keep inside the restricted authorized subscription view, with effective entitlement recheck. **Never** route through the ordinary Management bell, enable a restricted Dashboard shell, or add Seen. |

## Behavior and acceptance contracts

1. **Row click versus Seen:** The entire non-control row is a keyboard-accessible link/activation target for **exact source navigation**. The distinct “Mark Seen” control only renders for OCCURRENCE categories and stops row activation propagation. On successful server PUT, re-fetch authoritative preview; opening popover, navigating, viewing ACTIVE, or reading detail never marks Seen. Receipt is per User+Organization+category+committed source and limited to 7-day eligibility (DEC-110 OD-07C). `management-alert-unified-preview.ts:148-155` lists allowed five categories. **Current P1:** occurrence readers include the exact seven-day lower-bound equality but the Seen insert and retry predicates use a strict upper bound; a returned item can have `seenEligible=true` while the PUT rejects at/after the boundary. DEC-110 does not settle equality. Resolve one policy and align source list, `seenEligible`, insert and retry before rollout; do not paper over it in the v2 display DTO.
2. **Authorization twice, with race fencing:** Revalidate before list/count and again on exact source; destination independently checks its own privilege, session generation, identity and the source-scope-specific Organization/Location. For Location-scoped categories, recheck the currently selected Location grant and its Organization. For ALT-15, recheck current active Company Admin membership and Organization directly, independent of selected Location; a selected Location, a Location grant or the fact that ALT-15 appeared in a Location-derived preview is not authority. An old URL/query never selects a different tenant, Location or Task version after A→B→A or role changes. Keep source authorization before pagination. For ALT-05 sensitive takeover and ALT-15 CA security audit, retain protected MFA; LM source permissions are category-specific; no Supervisor/Employee/Guest bell. ALT-17 exclusively CA subscription recovery.
3. **Absent exact reader is a blocker:** Before marking a category UI-02 complete, demonstrate a mounted exact-by-ID source query and destination selection that works when the record is absent from page 1; verify retired/revoked/missing IDs yield nondisclosing unavailable UI. If that cannot be safely implemented, leave category navigation **incomplete**, not a fake route or generic fallback details dialog.
4. **Read time and live updates:** Source times must keep their source meaning (ALT-09 `recorded_at` attention vs GPS `occurred_at`; ALT-16 no start time). Keep the list/badge server-authoritative, 20+ overflow correct, no zero on transient errors. Issue #432 RT-01 additionally requires real automatic committed-event and time-boundary invalidations; this DTO/deep-link plan does **not** claim that event transport is implemented.
5. **Proof matrix:** Browser click-through for every eligible category on an item beyond first page; EN/AR+RTL/LTR, light/dark, Escape/outside-close/focus/zoom; auth+MFA+entitlement+Location revocation and source retirement between preview/click; for ALT-15, no selected Location, changed selected Location, and a revoked/role-changed Company Admin membership must be independently tested without allowing Location context to authorize the Organization source; seen single/double click and concurrent tabs; no HTTP side effects on source details; no leaked internal IDs, sensitive details, or raw coordinate/payment data. PostgreSQL 17, mounted HTTP, true browser end-to-end and load gates remain open until evidenced in #432.

**Source-proof status:** This review statically inspected source readers and authorization predicates only. It did not prove the DEC-109 same-millisecond/concurrent chronology for ALT-02/03, the DEC-110 stage-entry clocks for ALT-04/06, DEC-107 compatibility for ALT-05, deterministic terminal/violation grouping for ALT-07/09, or the Phase-3 source/Seen contracts under real PostgreSQL 17. DEC-109/110/111 explicitly keep source chronology, race/retirement, Seen, mounted HTTP, browser and performance evidence gates open. A source-backed field in this document is not a production certification.

**Implementation handoff:** Source of truth for category copy is `ALERT_CATEGORY_CONTENT_MATRIX.md`; preserve the existing actual APIs and route registry unless a reviewed, source-specific minimal extension is approved. Both files are documentary proposals and were not executed as runtime code.
