# Phase 3 boundary reminders — v1.1

Always verify against `docs/18_PHASE3_OPERATIONS_EXECUTION_PLAN.md`.

Core principles include:

- physical ValetSession state is separate from Task lifecycle;
- Shift/Location eligibility must be defined before Hybrid Dispatch assignment logic;
- VAL-005B must provide an availability/eligibility boundary that later Task assignment can consume, not merely transport endpoints;
- canonical Task persistence/ownership arrives in a later slice, so VAL-005B must not call current ValetSession assignment “Task ownership” without an Accepted transitional rule;
- safe open-work handoff/reassignment semantics must not invent the later Task model prematurely;
- Key custody history is append-only and actor/time attributed;
- Zone/Spot QR values identify resources, not staff authorization;
- exact guest exposure of KeySlot/Zone/Spot is prohibited;
- Maps/GPS tracking is not Phase 3;
- Parking key checkout/return semantics require an explicit focused decision before parking lifecycle commands;
- no V2/Enterprise leakage;
- no payroll/timekeeping expansion from Shift functionality.

Task sequence matters. Do not pull a later slice's canonical model backward unless an Accepted Decision explicitly allows it.

For Shift eligibility specifically, ask whether eligibility is dynamic at consumption time (active user/membership/org/location/access + active Shift) or whether any part is frozen at Shift start. Do not decide this merely because one answer seems safer; require the focused decision if binding docs do not already lock it.
