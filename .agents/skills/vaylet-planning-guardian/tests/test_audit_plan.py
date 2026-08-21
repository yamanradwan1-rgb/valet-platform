#!/usr/bin/env python3
from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

SCRIPT = Path(__file__).parents[1] / "scripts" / "audit_plan.py"
SECTIONS = [
    "Repository facts discovered", "Binding requirements", "Existing implementation patterns",
    "LOCKED decisions", "DERIVED conclusions", "UNRESOLVED decisions",
    "Risks / boundary violations", "Proposed implementation plan", "Test matrix",
    "Files expected to change", "Explicitly out of scope", "Ready-to-implement verdict",
]


def doc(parts: dict[str, str]) -> str:
    return "\n".join(f"## {section}\n{parts.get(section, 'None.')}" for section in SECTIONS)


def run(text: str) -> tuple[int, str]:
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "plan.md"
        path.write_text(text, encoding="utf-8")
        cp = subprocess.run(["python3", str(SCRIPT), str(path)], capture_output=True, text=True)
        return cp.returncode, cp.stdout


def assert_warn(text: str, needle: str) -> None:
    rc, out = run(text)
    assert rc == 1 and needle.lower() in out.lower(), out


def main() -> None:
    # Exact + semantic decision leakage.
    leakage = doc({
        "Repository facts discovered": "Two controllers: @Controller(\"v1/staff/a\") and @Controller(\"v1/staff/b\").",
        "UNRESOLVED decisions": "U-001 Dynamic vs captured eligibility is UNRESOLVED. U-002 locking strategy is UNRESOLVED.",
        "Proposed implementation plan": "Eligibility must dynamically verify current membership/location status. The query must use FOR SHARE.",
        "Test matrix": "Tests follow the chosen behavior.",
        "Ready-to-implement verdict": "DECISION REQUIRED",
    })
    assert_warn(leakage, "semantic decision leakage")

    # Compound classification.
    compound = doc({
        "UNRESOLVED decisions": "Requirement | LOCKED / DERIVED | rationale",
        "Ready-to-implement verdict": "DECISION REQUIRED",
    })
    assert_warn(compound, "compound classification")

    # Proposition polarity: candidate says app time, rationale cites DB time.
    polarity = doc({
        "DERIVED conclusions": "| R32 | Start uses application Date.now() | DERIVED | Repository requires database-authoritative NOW() instead |",
        "Ready-to-implement verdict": "DECISION REQUIRED",
    })
    assert_warn(polarity, "proposition-polarity")

    # Silent qualifier injection on free text.
    qualifier = doc({
        "DERIVED conclusions": "| R71 | overrideReason is automatically safe metadata | DERIVED | Safe when validated as non-credential string |",
        "Ready-to-implement verdict": "DECISION REQUIRED",
    })
    assert_warn(qualifier, "silent proposition repair")

    # Absence is not contradiction, including `has no column` reasoning.
    absence = doc({
        "DERIVED conclusions": "| R29 | CONTRADICTED | Shift has no override_reason column, therefore direct storage is contradicted |",
        "Ready-to-implement verdict": "DECISION REQUIRED",
    })
    assert_warn(absence, "absence-as-contradiction")

    # Exact new interface selection under DECISION REQUIRED must remain conditional.
    interface = doc({
        "UNRESOLVED decisions": "U-001 Exact reusable interface shape is UNRESOLVED.",
        "Proposed implementation plan": "Use evaluateShiftOperationalEligibility(transaction, input) for VAL-005E.",
        "Ready-to-implement verdict": "DECISION REQUIRED",
    })
    assert_warn(interface, "exact new function/interface")

    # Uncommitted race analysis must branch commit/rollback/unknown caller outcome.
    race = doc({
        "Proposed implementation plan": "Concurrent Start: loser waits for the winner transaction and then receives a unique violation.",
        "Test matrix": "Concurrent identical requests are tested.",
        "Ready-to-implement verdict": "READY TO IMPLEMENT",
    })
    assert_warn(race, "rollback branch")

    # Falsification completeness claim without accounting.
    fals = doc({
        "LOCKED decisions": "| R1 | LOCKED | x |\n| R2 | LOCKED | x |\n| R3 | LOCKED | x |\n| R4 | LOCKED | x |\n| R5 | LOCKED | x |",
        "Risks / boundary violations": "Every LOCKED conclusion was falsified and checked.",
        "Ready-to-implement verdict": "READY TO IMPLEMENT",
    })
    assert_warn(fals, "coverage accounting")


    # Protected mutation must not precede self-ownership proof.
    mutate_then_auth = doc({
        "Repository facts discovered": "Current staff principal proves userId. Existing command executors authorize persisted scope before mutation.",
        "Proposed implementation plan": """
- endShift(authenticatedUserId, shiftId):
  - Verifies authenticated User is ACTIVE.
  - Executes UPDATE shifts SET status = 'ENDED' WHERE id = $1 AND status = 'ACTIVE' RETURNING id.
  - If 0 rows updated, queries the Shift and verifies membership.user_id === authenticatedUserId.
  - If one row updated, returns the ended Shift.
""",
        "Test matrix": "Self-end and retry tests.",
        "Ready-to-implement verdict": "READY TO IMPLEMENT",
    })
    assert_warn(mutate_then_auth, "authorization-before-mutation")
    assert_warn(mutate_then_auth, "zero-row/fallback")

    # Principal authentication alone must not count as target authorization.
    active_user_only = doc({
        "Proposed implementation plan": "Require authenticated active User. UPDATE shifts SET status='ENDED' WHERE id=$1 RETURNING id.",
        "Ready-to-implement verdict": "READY TO IMPLEMENT",
    })
    assert_warn(active_user_only, "principal authentication alone")

    # Exact lock mechanism must not be called LOCKED merely because locking is required.
    lock_literal = doc({
        "LOCKED decisions": "| L1 | Operational eligibility uses FOR SHARE on shifts | LOCKED | DEC-032 requires repository-compatible transactional locking |",
        "Ready-to-implement verdict": "READY TO IMPLEMENT",
    })
    assert_warn(lock_literal, "exact concurrency primitive")

    # Nearest explicit command-executor architecture should not be silently replaced by service-owned SQL.
    service_sql = doc({
        "Repository facts discovered": "Nearest pattern uses createCompleteCheckInCommandExecutor and explicit command executors. API services are thin.",
        "Proposed implementation plan": "ShiftCommandService performs SQL UPDATE shifts and owns transactions directly.",
        "Ready-to-implement verdict": "READY TO IMPLEMENT",
    })
    assert_warn(service_sql, "command executors")

    # Retry returning protected state needs ownership proof.
    retry_leak = doc({
        "Proposed implementation plan": "If already-ended on retry, return the persisted Shift projection with HTTP 200.",
        "Ready-to-implement verdict": "READY TO IMPLEMENT",
    })
    assert_warn(retry_leak, "re-authorization")


    # New module must be grounded in nearest module wiring.
    module_wiring = doc({
        "Repository facts discovered": "Inspected controllers only.",
        "Proposed implementation plan": "Create apps/api/src/modules/shifts/shifts.module.ts and register ShiftsModule.",
        "Ready-to-implement verdict": "READY TO IMPLEMENT",
    })
    assert_warn(module_wiring, "module is proposed without")

    # Concealment must not invent a false LocationAccess failure for self-end.
    semantic_error = doc({
        "LOCKED decisions": "Self-end works without requiring current location access.",
        "Proposed implementation plan": "For a non-owned Shift, return LOCATION_ACCESS_DENIED to conceal existence.",
        "Ready-to-implement verdict": "READY TO IMPLEMENT",
    })
    assert_warn(semantic_error, "semantic error mismatch")

    # Production evidence inflation: typecheck presented as lint.
    fake_lint = doc({
        "Proposed implementation plan": "Quality gate: Lint PASSED via `tsc --noEmit`.",
        "Ready-to-implement verdict": "READY TO IMPLEMENT",
    })
    assert_warn(fake_lint, "typechecking, not linting")

    # Production evidence inflation: db push presented as migration proof.
    fake_migration = doc({
        "Proposed implementation plan": "Verify database migrations using `npx prisma db push`.",
        "Ready-to-implement verdict": "READY TO IMPLEMENT",
    })
    assert_warn(fake_migration, "not versioned migration verification")

    # Hard crash cannot depend on cleanup from the dead worker.
    fake_crash = doc({
        "Proposed implementation plan": "On SIGKILL the worker calls nackJobAndRequeue to restore the job.",
        "Ready-to-implement verdict": "READY TO IMPLEMENT",
    })
    assert_warn(fake_crash, "independent lease/visibility")

    # READY is too strong when a material production condition remains.
    fake_ready = doc({
        "Risks / boundary violations": "Remaining production risk: DNS rebinding requires an egress proxy in production.",
        "Ready-to-implement verdict": "READY",
    })
    assert_warn(fake_ready, "ready with conditions")

    # Clean conditional DECISION REQUIRED document: no selected unresolved behavior.
    clean = doc({
        "Repository facts discovered": "Current pattern inspected; no exact new route is accepted.",
        "UNRESOLVED decisions": "U-001 Retry semantics remain UNRESOLVED. U-002 locking mechanism remains UNRESOLVED.",
        "Proposed implementation plan": "IF U-001 is resolved as A, implement A; IF U-001 is resolved as B, implement B. IF U-002 selects a locking mechanism, use the accepted mechanism.",
        "Test matrix": "Tests for U-001/U-002 remain conditional until the Accepted Decision locks them.",
        "Files expected to change": "CONDITIONAL ON DECISION: Shift command/helper file family.",
        "Ready-to-implement verdict": "DECISION REQUIRED",
    })
    rc, out = run(clean)
    assert "compound classification" not in out.lower(), out
    assert "semantic decision leakage" not in out.lower(), out
    assert "proposition-polarity" not in out.lower(), out

    print("audit_plan v1.5 self-tests: PASS")


if __name__ == "__main__":
    main()
