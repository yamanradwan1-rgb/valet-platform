"""Contract tests for sanitized, fail-closed Security CI gate."""
import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import patch

import ci_gate


class SecurityGateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.cwd = os.getcwd()
        os.chdir(self.temp.name)

    def tearDown(self):
        os.chdir(self.cwd)
        self.temp.cleanup()

    def write(self, filename, payload):
        Path(filename).write_text(json.dumps(payload), encoding="utf-8")
        return filename

    def run_gate(self, scanner, head, base=None):
        with patch.dict(os.environ, {"GITHUB_STEP_SUMMARY": ""}), redirect_stdout(StringIO()):
            return ci_gate.run(scanner, self.write("head.json", head),
                               self.write("base.json", base) if base is not None else None)

    def test_semgrep_new_error_blocks(self):
        head = {"results": [{"check_id": "test.unsafe", "path": "apps/api/src/a.ts",
                             "start": {"line": 8}, "extra": {"severity": "ERROR"}}],
                "errors": [], "paths": {"scanned": ["apps/api/src/a.ts"]}}
        self.assertEqual(self.run_gate("semgrep", head), 1)
        clean = {"results": [], "errors": [], "paths": {"scanned": ["apps/api/src/a.ts"]}}
        self.assertEqual(self.run_gate("semgrep", clean), 0)

    def test_semgrep_missing_or_invalid_coverage_fails(self):
        with self.assertRaises(ValueError):
            ci_gate.semgrep({"results": [], "errors": [], "paths": {"scanned": []}})
        with self.assertRaises(ValueError):
            ci_gate.semgrep({"results": [], "errors": ["parse error"],
                             "paths": {"scanned": ["a.ts"]}})

    def test_trivy_existing_high_passes_new_high_blocks(self):
        finding = {"Target": "pnpm-lock.yaml", "Vulnerabilities": [
            {"VulnerabilityID": "CVE-2026-0001", "PkgName": "lib",
             "InstalledVersion": "1.0", "Severity": "HIGH"}]}
        baseline = {"Results": [finding]}
        self.assertEqual(self.run_gate("trivy", baseline, baseline), 0)
        self.assertEqual(self.run_gate("trivy", baseline, {"Results": []}), 1)

    def test_trivy_elevated_severity_is_blocked(self):
        item = {"Target": "pnpm-lock.yaml", "Vulnerabilities": [
            {"VulnerabilityID": "CVE-2026-0001", "PkgName": "lib",
             "InstalledVersion": "1.0", "Severity": "CRITICAL"}]}
        base = {"Results": [{"Target": "pnpm-lock.yaml", "Vulnerabilities": [
            {"VulnerabilityID": "CVE-2026-0001", "PkgName": "lib",
             "InstalledVersion": "1.0", "Severity": "LOW"}]}]}
        # Severity escalation is a newly unacceptable risk, even if ID is old.
        self.assertEqual(self.run_gate("trivy", {"Results": [item]}, base), 1)

    def test_osv_unrated_new_advisory_requires_triage(self):
        report = {"results": [{"source": {"path": "/src/pnpm-lock.yaml"},
                   "packages": [{"package": {"name": "some-package", "version": "1"},
                                 "vulnerabilities": [{"id": "OSV-NEW"}]}]}]}
        self.assertEqual(self.run_gate("osv", report, {"results": []}), 1)

    def test_gitleaks_blocks_and_redacts(self):
        self.assertEqual(self.run_gate("gitleaks", [{"RuleID": "generic",
            "File": "apps/api/src/config.ts", "StartLine": 2,
            "Commit": "aabbcc", "Secret": "not-for-reports",
            "Match": "not-for-reports"}]), 1)
        published = Path("security-reports/gitleaks-sanitized.json").read_text()
        self.assertNotIn("not-for-reports", published)

    def test_corrupt_json_fails_closed(self):
        Path("bad.json").write_text("{broken", encoding="utf-8")
        with self.assertRaises(ValueError):
            ci_gate.load("missing.json")
        with self.assertRaises(json.JSONDecodeError):
            ci_gate.load("bad.json")


if __name__ == "__main__":
    unittest.main()
