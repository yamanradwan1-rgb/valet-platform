# VAYLET — Pre-Phase-3 Structure Gate

Status: Binding execution gate

After VAL-004R is merged, the next and only required repository gate before Phase 3 is the structure-policy enforcement task defined by DEC-030.

Required outcome:

- `docs/17_AGENT_CODE_STRUCTURE_RULES.md` remains binding and referenced by `AGENTS.md`;
- VAL-004R-authored code files above 300 lines are split into focused responsibilities;
- `architecture:check` enforces the 300-line policy for new/modified authored code;
- pre-existing legacy oversized code is captured by a deterministic grandfather baseline and may not grow;
- dependency-direction checks from DEC-028 remain green;
- no behavior change is introduced solely to satisfy structure limits;
- no mass unrelated refactor is performed;
- Phase 3 may begin once this structure gate is merged.

The previously planned Final Phase-2 Security/Integrity Closure and fresh Standard Security Scan are not pre-Phase-3 gates. They may be scheduled later as production/pilot hardening. Do not claim they were run or passed unless actually executed.
