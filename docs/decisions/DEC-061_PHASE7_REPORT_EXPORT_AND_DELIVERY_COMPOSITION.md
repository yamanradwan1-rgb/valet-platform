# DEC-061 — Phase 7 Report Export and Delivery Composition

Status: Accepted
Date: 2026-08-22
Task: VAL-009E — Reports / Export Foundation
Issue: #184

## Context

Phase 7 gates G6 (automated report delivery composition) and G7 (export/PDF
dependency and data-export authority) required a focused accepted contract
before any report/export implementation. This decision records the
Project Owner-approved contract for VAL-009E and closes both gates.

## Decision

1. **Manual authenticated reports now.** VAL-009E ships server-generated
   DAILY / WEEKLY / MONTHLY Location reports plus synchronous CSV/PDF
   downloads through authenticated Dashboard staff routes only.
2. **No automation in VAL-009E.** No scheduler, cron, background worker,
   queue, email, SMS or WhatsApp sending exists in this slice. Reliability
   owns future automated delivery; that future work MUST reuse this slice's
   report composer rather than growing a second formula implementation.
3. **Authority.** Every report read and every export uses the VAL-009A
   exact-Location `LOCATION_MANAGER` scope (ACTIVE User, ACTIVE membership,
   ACTIVE Organization, ACTIVE Location, explicit
   `membership_location_access`; no Shift). ORG_ADMIN pre-MFA (DEC-023),
   Supervisors, Employees, Guests, same-org ungranted Locations,
   cross-tenant/nonexistent/inactive cases fail closed non-disclosingly.
4. **No persisted artifacts.** No report/export table, no object-storage
   record, no artifact id, no retention job exists. Bytes are generated in
   bounded memory, returned to the caller, and discarded.
5. **Audit.** Each successful server generation writes exactly one
   AuditEvent `DASHBOARD_REPORT_EXPORT_GENERATED` scoped to the authorized
   Organization/Location with `entity_type='Location'`,
   `valet_session_id=NULL`, the authorized manager membership as actor, and a
   safe metadata allowlist of `reportKind`, `format`, `periodFrom`,
   `periodTo`, `contentLength`, optional `contentSha256`. Regeneration is
   allowed and produces a distinct AuditEvent every time. Invalid input,
   authorization denial, render failure or size-bound breach produce zero
   AuditEvents. Audit semantics mean "server generated an artifact", never
   guaranteed delivery.
6. **Bounded generation.** Unique persisted/free-text group rows are capped
   at 500 per report section family and generated artifacts at 5 MiB;
   exceeding either fails closed before any audit write and never silently
   truncates.
7. **CSV hardening.** CSV output is UTF-8 RFC4180-compatible with a stable
   documented header (`section,key,subkey,currency,value`), deterministic
   ordering, exact decimal strings, sorted currencies/types, and
   deterministic formula-injection hardening for cells beginning with
   `=`,`+`,`-`,`@`, tab or CR/LF control characters (quoting alone is not
   sufficient). Filenames are server-generated ASCII only.
8. **PDF via pdf-lib only.** The sole approved new dependency is `pdf-lib`
   (pure JavaScript, no native/headless/browser runtime). PDFs carry a
   `%PDF-` signature, `application/pdf`, stable English locale-neutral
   section labels, bounded summary content only, and server-generated ASCII
   filenames. No HTML-to-PDF, remote templates, fonts download, or other
   substitute package is approved.
9. **Periods.** DAILY = one strict local calendar date; WEEKLY = strict
   Monday-starting seven local dates (`weekStart` must be a Monday);
   MONTHLY = strict calendar month including leap Februaries. The timezone
   is always the persisted Location IANA zone resolved after authorization;
   UTC windows use PostgreSQL `AT TIME ZONE`; no caller timezone exists.
10. **No fabricated history.** Reports contain only historically
    reconstructable facts: DAILY may add RetrievalRequest counts by
    `requested_at`, DispatchEvent grouped counts by task type and event type
    over `occurred_at`, and KeyCustodyEvent grouped counts by controlled
    event type over `occurred_at`. Historical point-in-time queue depth,
    oldest-age, end-of-day Task status, or slot/current-holder state is never
    reconstructed or claimed. Unsupported metrics (SLA, Cars per Employee,
    Key Exceptions, Guest Rating, Repeat Guest, adoption/friction, manager
    reliance, predictive, company-wide rollups) remain structurally absent.
11. **Currency discipline.** Financial report sections reuse the DEC-060
    cohorts grouped by immutable Payment currency — currencies are never
    combined — and preserve the independent-cohort union behavior so
    validation-only and refund-only currencies stay visible.
12. **Database boundary.** No Prisma schema change, no migration 30,
    migrations 1–29 unchanged, no runtime privilege widening (the runtime
    role already holds append-only INSERT + SELECT on `audit_events`).

## Consequences

Phase 7 gains its final backend capability without schedulers, storage, or
new trust boundaries. The Founder's daily-email requirement remains visibly
handed off to Reliability with a composer that can be reused verbatim. Any
future delivery channel, artifact persistence, or retention policy requires
its own focused decision.

Full binding contract: this file.
