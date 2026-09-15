# DEC-090 — Management KPI Definitions

Status: Accepted
Date: 2026-09-15
Owner: VAYLET product owner

## Context

DEC-060 provides correct Location analytics for existing metrics and explicitly
left SLA, Cars per Employee, and Key Exceptions absent pending definitions.

## Decision

SLA duration is `retrieval request -> READY`. The target is configured per
Location and is never hard-coded to five minutes. SLA Compliance is the ratio
of qualifying retrievals meeting the applicable target to qualifying
retrievals with sufficient source data. Pre-target or otherwise missing target
coverage remains missing and is reported explicitly; it is not zero-filled.

Cars per Active Employee is:

```text
completed visits in period
÷ distinct operational employees proven to have actually worked in the period
```

It is not payroll, shift compensation, a performance score, or the same as
handoffs. Implementation must define the evidence-backed “actually worked”
cohort from authoritative operational history before shipping; presence in the
staff directory alone does not count.

Cars Handed Off by Employee is a separate count of completed visits whose
persisted final completing membership is that employee.

Key Exceptions count only predefined genuine custody problems. Normal
`SLOT_ASSIGNED`, `CHECKED_OUT`, `RETURNED_TO_SLOT`, `SLOT_CLEARED`, and
`RELEASED` movements are not exceptions. The controlled exception catalog must
be locked before implementation and must not infer exceptions from ordinary
movement volume.

All calculations use authoritative timestamps, Location-local period semantics,
bounded queries, explicit numerators/denominators/coverage, and no floating
point accumulation.

## Reason

These definitions add the missing pilot metrics without turning incomplete data
or ordinary custody work into misleading KPIs.

## Consequences

MGT-BE-10 amends DEC-060 with these new metric families. SLA target history or
snapshots and the Key Exception source may require focused schema design; no
metric may ship until its source is historically truthful.

## Security and privacy considerations

Aggregates remain role- and tenant-scoped and do not expose raw routes,
contacts, credentials, or employee scoring profiles. Small cohorts follow the
same safe projection discipline as existing analytics.

## Supersedes/amends references

Resolves the KPI gaps left by DEC-060 and supersedes the old ambiguous “Cars
per Employee” packet.

## Affected docs/code

`docs/08_DECISIONS_LOG.md`, `docs/23_MANAGEMENT_BACKEND_216_EXECUTION_PLAN.md`,
future analytics/configuration/contracts/database implementation.
