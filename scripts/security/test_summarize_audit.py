"""Issue #324 scan-quality regression: parse errors cannot masquerade as PASS."""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("summarize_audit.py")


class SemgrepCoverageGateTests(unittest.TestCase):
    def run_summary(self, semgrep):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "security-reports"
            root.mkdir()
            for name, content in {
                "semgrep.json": semgrep,
                "trivy.json": {"Results": []},
                "gitleaks.json": [],
                "osv.json": {"results": []},
                "pnpm-audit.json": {"metadata": {"vulnerabilities": {"total": 0}}},
            }.items():
                (root / name).write_text(json.dumps(content), encoding="utf-8")
            return subprocess.run(
                [sys.executable, str(SCRIPT), "static"],
                cwd=directory,
                capture_output=True,
                text=True,
                check=False,
            )

    def test_clean_report_passes(self):
        result = self.run_summary({"results": [], "errors": []})
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("Semgrep parser/scan errors: 0", result.stdout)

    def test_partial_parsing_fails_even_when_scan_step_succeeded(self):
        result = self.run_summary({
            "results": [],
            "errors": [{"type": "PartialParsing", "message": "synthetic test"}],
        })
        self.assertEqual(result.returncode, 1)
        self.assertIn("Semgrep parser/scan errors: 1", result.stdout)

    def test_missing_parser_quality_metadata_fails(self):
        result = self.run_summary({"results": []})
        self.assertEqual(result.returncode, 1)
        self.assertIn("semgrep.json.errors field", result.stdout)


if __name__ == "__main__":
    unittest.main()
