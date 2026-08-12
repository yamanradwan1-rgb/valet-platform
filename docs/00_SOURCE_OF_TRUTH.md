# Source of Truth

Status: Binding  
Version: 0.2

## Current product source

The latest approved product direction is the **VAYLET Founder & Product Blueprint v1.0 (August 2026)** supplied by the project owner.

Until the Blueprint PDF itself is committed into `docs/reference`, the repository-native implementation bridge is:

`docs/15_BLUEPRINT_V1_REBASELINE.md`

The historical product concept remains available at:

`docs/reference/Valet_Project_Concept_Arabic.pdf`

The historical concept is still useful for original intent, but it is superseded wherever Blueprint v1.0 or a later accepted decision explicitly changes the product contract.

## Accepted decision authority

Accepted project decisions may be represented in two repository forms:

- canonical log/summary entries in `docs/08_DECISIONS_LOG.md` marked `Accepted`;
- focused decision files under `docs/decisions/DEC-*.md` whose own status is `Accepted`.

When both exist for the same decision, the focused standalone DEC is the complete contract and `docs/08_DECISIONS_LOG.md` is its canonical log/summary. A material conflict between the two is a repository contradiction that must be reconciled before implementation.

A focused DEC that is already merged and marked `Accepted` remains binding during a temporary mirror lag in `docs/08_DECISIONS_LOG.md`; mirror lag must not be used to ignore, reinterpret or broaden that decision. The log should be synchronized in a documentation-maintenance task.

## Product identity

VAYLET is a B2B SaaS operating system for valet operations from vehicle arrival through secure completion, including operational custody, employee workflow, guest experience, configuration, payments where enabled, reporting and audit.

In the base company model, VAYLET does not employ valet drivers or take direct custody of vehicles. The valet operator, hotel or operating customer remains responsible for field staff, insurance and physical operations.

## Three core product surfaces

1. Valet Employee App / web terminal
2. Guest/Customer web experience through secure link, WhatsApp/SMS and QR fallback
3. Management / Operations Dashboard

A customer mobile app/account is NOT required for the sellable MVP.

## Sellable MVP product priorities

1. Operational speed and low employee friction
2. Correctness, chain of custody and Black Box traceability
3. Secure vehicle handoff
4. Reliable key/parking location
5. Low-friction guest retrieval without mandatory account/app
6. Hybrid task dispatch and supervisor control
7. Configuration First for normal customer/location policy differences
8. Management visibility and measurable KPIs
9. Payments/cash/validation/tips according to location policy
10. International-ready Arabic/English, RTL/LTR, per-location timezone/currency
11. Offline-friendly employee operation
12. Advanced optimization/prediction only after clean operational data exists

## Product capabilities newly confirmed in Blueprint v1.0

The sellable MVP includes, when implemented by its scheduled task/phase:

- plate OCR/ANPR with confirm/edit and manual fallback
- vehicle condition check with photos optional by default and configurable as required
- QR-based key slots
- zones/spots with optional QR
- maps and configurable session tracking during active Parking/Retrieval tasks
- basic Hybrid Dispatch and supervisor reassignment
- Dynamic one-time QR or 4-digit pickup-code secure handoff
- basic digital payment plus cash, validation and tips
- configurable dashboard/policies
- reports/export
- Arabic/English
- offline-friendly employee actions
- basic subscription/admin controls

These capabilities being in the product MVP does not authorize an unrelated task to implement them early.

## Core differentiator to preserve

The system must maintain a reliable digital chain of custody / Black Box.

For a session, authorized staff must be able to determine as applicable:

- who received the vehicle
- when it was received
- plate/condition evidence recorded at intake
- who handled the key and when
- where the vehicle was parked/staged
- which task was assigned/reassigned and to whom
- who retrieved the vehicle
- when the customer requested it
- when it became ready
- payment/validation state where relevant
- how handoff was verified
- who completed the release
- incidents, overrides and later corrective events

Corrections append new events; they do not silently replace historical facts.

## Performance requirement

Any product decision that materially increases employee check-in friction requires explicit review.

The normal fast path should target approximately 15–20 seconds when photos are not required by policy. OCR is assistive and must always have confirm/edit and manual fallback.

The target is not feature quantity. The target is a workflow fast enough to replace paper during real peak traffic.

## Privacy / tracking requirement

Employee GPS/session tracking is not continuous by default. When enabled by policy, tracking is tied to active vehicle Parking/Retrieval tasks and must stop according to task/session state.

The guest never sees exact parking coordinates or key-slot information.

## Reliability requirement

Offline-friendly employee actions are part of the sellable MVP/reliability direction.

IDs, timestamps, mutation semantics, idempotency and concurrency controls must support retry/reconnect without creating duplicate operational events.

## Configuration First requirement

Normal operating policies that differ by customer/location should be configurable from the Dashboard rather than hard-coded.

Where inheritance applies, use the product precedence:

```text
Company default -> Location override
```

Do not use this principle as permission to invent an untyped configuration schema inside an unrelated task.

## Change rule

When the project owner changes an important requirement:

1. Record the new approved source/decision.
2. Add or update an Accepted decision in the repository. Focused decisions belong under `docs/decisions/`; `docs/08_DECISIONS_LOG.md` should carry the canonical summary/index and be synchronized when a focused Accepted DEC is added.
3. Update affected binding docs.
4. Update implementation only after the contracts are aligned.

Do not rely on chat history as the only record of an important product decision.

## Collaboration source

Important implementation coordination must be represented in the shared repository through:

- GitHub Issues/tasks
- branches
- Pull Requests
- accepted decisions
- binding documentation
- `docs/14_PROJECT_STATUS.md` as a non-binding operational handoff snapshot

Do not rely on private AI-agent conversation history to communicate project-critical assumptions to the other contributor.
