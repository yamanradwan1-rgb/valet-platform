"""Structural checks that optional CodeQL telemetry cannot change the gate verdict."""

from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github/workflows/security-ci.yml"


def _job_blocks(lines, job_name):
    start = next(index for index, line in enumerate(lines)
                 if line == f"  {job_name}:")
    end = next((index for index in range(start + 1, len(lines))
                if re.fullmatch(r"  [A-Za-z0-9_-]+:", lines[index])), len(lines))
    return lines[start:end]


def _steps(job_lines):
    start = next(index for index, line in enumerate(job_lines) if line == "    steps:")
    starts = [index for index in range(start + 1, len(job_lines))
              if job_lines[index].startswith("      - ")]
    result = []
    for offset, index in enumerate(starts):
        end = starts[offset + 1] if offset + 1 < len(starts) else len(job_lines)
        result.append(job_lines[index:end])
    return result


def _named_step(steps, name):
    matches = [block for block in steps
               if any(line.strip() == f"- name: {name}" for line in block)]
    if len(matches) != 1:
        raise AssertionError(f"expected one workflow step named {name!r}")
    return matches[0]


class CodeQLWorkflowIsolationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.lines = WORKFLOW.read_text(encoding="utf-8").splitlines()
        cls.codeql_steps = _steps(_job_blocks(cls.lines, "sast-codeql"))
        cls.gate = _named_step(cls.codeql_steps,
                               "Gate new CodeQL high and critical findings")
        cls.telemetry = _named_step(cls.codeql_steps,
                                    "Add sanitized source-pinned CodeQL delta telemetry")

    def test_gate_step_precedes_telemetry_step(self):
        self.assertLess(self.codeql_steps.index(self.gate),
                        self.codeql_steps.index(self.telemetry))

    def test_only_telemetry_step_has_continue_on_error(self):
        properties = [(index, line.strip())
                      for index, block in enumerate(self.codeql_steps)
                      for line in block
                      if re.match(r"\s+continue-on-error\s*:", line)]
        self.assertEqual(len(properties), 1)
        self.assertEqual(properties[0][0], self.codeql_steps.index(self.telemetry))
        self.assertEqual(properties[0][1], "continue-on-error: true")

    def test_gate_has_no_continue_on_error_or_ignore_failure(self):
        self.assertFalse(any("continue-on-error" in line for line in self.gate))
        self.assertTrue(any("python3 scripts/security/codeql_gate.py" in line
                            for line in self.gate))

    def test_gate_receives_both_reports_and_owns_sanitized_summary(self):
        body = "\n".join(self.gate)
        for required in ("--head", "--base", "--out security-reports/codeql-sanitized.json"):
            self.assertIn(required, body)

    def test_telemetry_runs_after_gate_even_when_gate_fails(self):
        body = "\n".join(self.telemetry)
        self.assertIn("always()", body)
        self.assertIn("steps.codeql-analyze.outcome == 'success'", body)
        self.assertIn("python3 scripts/security/codeql_delta_telemetry.py", body)
        self.assertIn("--out security-reports/codeql-sanitized.json", body)

    def test_security_gate_still_fails_when_sast_codeql_job_fails(self):
        security_job = _job_blocks(self.lines, "security-gate")
        body = "\n".join(security_job)
        self.assertRegex(body, r"(?m)^    needs:.*\bsast-codeql\b")
        self.assertRegex(body, r"(?m)^          CODEQL: \$\{\{ needs\.sast-codeql\.result \}\}")
        self.assertIn('if [[ "$result" != success ]]; then failed=1; fi', body)
        self.assertIn('exit "$failed"', body)


if __name__ == "__main__":
    unittest.main()
