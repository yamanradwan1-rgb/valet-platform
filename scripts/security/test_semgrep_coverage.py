"""Regression tests for Semgrep incremental-scan coverage recovery."""

import json
import tempfile
import unittest
from pathlib import Path

from semgrep_coverage import classify_coverage


class SemgrepCoverageTests(unittest.TestCase):
    def classify(self, data):
        with tempfile.TemporaryDirectory() as folder:
            report = Path(folder) / "scan.json"
            report.write_text(json.dumps(data), encoding="utf-8")
            return classify_coverage(report)

    def test_zero_scanned_paths_requests_full_comparison(self):
        self.assertEqual(
            self.classify({"results": [], "errors": [], "paths": {"scanned": []}}),
            "fallback",
        )

    def test_nonempty_scanned_paths_uses_existing_gate(self):
        self.assertEqual(
            self.classify({
                "results": [],
                "errors": [],
                "paths": {"scanned": ["apps/api/src/plate.ts"]},
            }),
            "covered",
        )

    def test_parser_errors_fail_closed(self):
        with self.assertRaises(ValueError):
            self.classify({
                "results": [],
                "errors": ["parse error"],
                "paths": {"scanned": []},
            })

    def test_missing_or_invalid_paths_fail_closed(self):
        with self.assertRaises(ValueError):
            self.classify({"results": [], "errors": []})
        with self.assertRaises(ValueError):
            self.classify({"results": [], "errors": [], "paths": {"scanned": "fake"}})

    def test_inconsistent_zero_target_findings_fail_closed(self):
        with self.assertRaises(ValueError):
            self.classify({
                "results": [{"check_id": "unexpected"}],
                "errors": [],
                "paths": {"scanned": []},
            })


if __name__ == "__main__":
    unittest.main()
