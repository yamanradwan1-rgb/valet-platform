"""Regression tests for Semgrep incremental-scan coverage recovery."""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from semgrep_coverage import changed_eligible_paths, classify_coverage


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

    def test_changed_file_omitted_by_scanner_fails_closed(self):
        with patch("semgrep_coverage.changed_eligible_paths", return_value={
            "apps/api/src/covered.ts", ".github/pull_request_template.md",
        }):
            with self.assertRaisesRegex(ValueError, "omitted eligible changed targets"):
                with tempfile.TemporaryDirectory() as folder:
                    report = Path(folder) / "scan.json"
                    report.write_text(json.dumps({"results": [], "errors": [],
                        "paths": {"scanned": ["apps/api/src/covered.ts"]}}), encoding="utf-8")
                    classify_coverage(report, "a" * 40, require_covered=True)

    def test_changed_targets_all_covered_pass_even_without_findings(self):
        with patch("semgrep_coverage.changed_eligible_paths", return_value={
            ".github/workflows/security-ci.yml", "apps/api/src/x.ts",
        }):
            with tempfile.TemporaryDirectory() as folder:
                report = Path(folder) / "scan.json"
                report.write_text(json.dumps({"results": [], "errors": [], "paths": {
                    "scanned": ["apps/api/src/x.ts", ".github/workflows/security-ci.yml"]
                }}), encoding="utf-8")
                self.assertEqual(classify_coverage(report, "a" * 40, require_covered=True),
                                 "covered")

    def test_disposable_git_diff_includes_changed_workflows_and_code(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)

            def git(*args):
                return subprocess.run(["git", *args], cwd=root, text=True,
                                      capture_output=True, check=True).stdout.strip()

            git("init", "-q", "-b", "main")
            git("config", "user.name", "Security Fixture")
            git("config", "user.email", "fixture@example.invalid")
            for name in (".github/workflows/ci.yml", "apps/api/src/x.ts", "README.md"):
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("base", encoding="utf-8")
            git("add", ".")
            git("commit", "-qm", "base")
            base = git("rev-parse", "HEAD")
            for name in (".github/workflows/ci.yml", "apps/api/src/x.ts", "README.md"):
                (root / name).write_text("changed", encoding="utf-8")
            git("add", ".")
            git("commit", "-qm", "change")
            with patch("semgrep_coverage._REPO_ROOT", root):
                self.assertEqual(changed_eligible_paths(base), {
                    ".github/workflows/ci.yml", "apps/api/src/x.ts",
                })

    def test_changed_sql_markdown_and_extensionless_scripts_are_required(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)

            def git(*args):
                return subprocess.run(["git", *args], cwd=root, text=True,
                                      capture_output=True, check=True).stdout.strip()

            git("init", "-q", "-b", "main")
            git("config", "user.name", "Security Fixture")
            git("config", "user.email", "fixture@example.invalid")
            files = (".github/pull_request_template.md", "apps/api/schema.sql",
                     "apps/api/Dockerfile", "apps/api/image.png")
            for name in files:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("old", encoding="utf-8")
            git("add", ".")
            git("commit", "-qm", "base")
            base = git("rev-parse", "HEAD")
            for name in files:
                (root / name).write_text("new", encoding="utf-8")
            git("add", ".")
            git("commit", "-qm", "change")
            with patch("semgrep_coverage._REPO_ROOT", root):
                self.assertEqual(changed_eligible_paths(base), set(files[:-1]))

    def test_empty_incremental_can_fallback_but_full_must_really_cover(self):
        with tempfile.TemporaryDirectory() as folder:
            report = Path(folder) / "scan.json"
            report.write_text(json.dumps({"results": [], "errors": [],
                "paths": {"scanned": []}}), encoding="utf-8")
            self.assertEqual(classify_coverage(report, "a" * 40), "fallback")
            with self.assertRaisesRegex(ValueError, "after fallback"):
                classify_coverage(report, "a" * 40, require_covered=True)

    def test_parser_errors_fail_closed(self):
        with self.assertRaises(ValueError):
            self.classify({
                "results": [],
                "errors": ["parse error"],
                "paths": {"scanned": []},
            })

    def test_parser_error_diagnostics_are_bounded_and_report_only_safe_metadata(self):
        errors = [
            {
                "type": "Parse error",
                "code": 3,
                "level": "error",
                "message": "PRIVATE_TOKEN_SHOULD_NOT_PRINT",
                "spans": [{
                    "file": "scripts/security/semgrep_coverage.py",
                    "start": {"line": 12, "col": 6},
                    "source": "PRIVATE_SOURCE_SHOULD_NOT_PRINT",
                }],
            },
            {"type": "Syntax error", "code": 4, "level": "warning"},
            {"type": "Scan error", "code": 5, "level": "error"},
            {"type": "Timeout", "message": "FOURTH_SECRET_SHOULD_NOT_PRINT"},
        ]
        with self.assertRaisesRegex(ValueError, "error_count=4; first=3") as caught:
            self.classify({"results": [], "errors": errors, "paths": {"scanned": []}})
        message = str(caught.exception)
        self.assertIn("type=parse_error,code=3,level=error,path=scripts/security/semgrep_coverage.py,line=12", message)
        self.assertIn("type=syntax_error,code=4,level=warning", message)
        self.assertNotIn("PRIVATE_TOKEN", message)
        self.assertNotIn("PRIVATE_SOURCE", message)
        self.assertNotIn("FOURTH_SECRET", message)
        self.assertNotIn("source=", message)
        self.assertNotIn("col=", message)
        self.assertNotIn("type=timeout", message)

    def test_rejects_untrusted_type_code_level_and_unsafe_paths_without_leaking(self):
        secret = "TOP_SECRET_DO_NOT_EMIT"
        for raw_path in (
            f"../../{secret}.ts",
            f"apps/api/{secret}\nservice.ts",
            f"/tmp/{secret}.ts",
            f"apps/api/{secret}.ts",
            f"apps/api/{secret}\\private.ts",
        ):
            with self.subTest(path=raw_path):
                with self.assertRaises(ValueError) as caught:
                    self.classify({
                        "results": [],
                        "errors": [{
                            "type": secret,
                            "code": secret,
                            "level": secret,
                            "path": raw_path,
                            "line": 99,
                            "message": f"\n::warning::{secret}",
                        }],
                        "paths": {"scanned": []},
                    })
                message = str(caught.exception)
                self.assertIn("type=unrecognized", message)
                self.assertIn("level=unrecognized", message)
                self.assertNotIn("code=", message)
                self.assertNotIn("path=", message)
                self.assertNotIn("line=", message)
                self.assertNotIn(secret, message)
                self.assertNotIn("::warning::", message)

    def test_missing_errors_and_invalid_errors_metadata_stay_fail_closed(self):
        for report in (
            {"results": [], "paths": {"scanned": ["scripts/security/semgrep_coverage.py"]}},
            {"results": [], "errors": None, "paths": {"scanned": []}},
            {"results": [], "errors": {"message": "SECRET"}, "paths": {"scanned": []}},
        ):
            with self.subTest(report=report):
                with self.assertRaisesRegex(ValueError, "omitted error metadata"):
                    self.classify(report)

    def test_partial_parsing_array_type_is_safely_identified_and_still_fails(self):
        secret = "SECRET_NESTED_PARSER_MESSAGE"
        report = {"results": [], "paths": {"scanned": ["apps/api/src/x.ts"]},
                  "errors": [{"type": ["PartialParsing", {"source": secret}],
                              "level": "warning", "code": 3}]}
        with self.assertRaisesRegex(ValueError, "type=partial_parsing") as captured:
            self.classify(report)
        self.assertNotIn(secret, str(captured.exception))

    def test_workflow_parser_diagnostic_path_is_allowlisted_without_snippets(self):
        report = {"results": [], "paths": {"scanned": []}, "errors": [{
            "type": "Parse error", "code": 3, "level": "warning",
            "path": ".github/workflows/security-ci.yml", "line": 14,
            "message": "DO_NOT_PRINT_SCANNER_SOURCE",
        }]}
        with self.assertRaisesRegex(ValueError,
                                    "path=.github/workflows/security-ci.yml,line=14") as captured:
            self.classify(report)
        self.assertNotIn("DO_NOT_PRINT", str(captured.exception))

    def test_command_line_keeps_exit_two_and_emits_no_raw_scanner_message(self):
        secret = "CI_SECRET_DONT_PRINT"
        with tempfile.TemporaryDirectory() as folder:
            report = Path(folder) / "semgrep.json"
            report.write_text(json.dumps({
                "results": [],
                "paths": {"scanned": []},
                "errors": [{
                    "type": "Parse error", "level": "error", "code": 3,
                    "message": secret,
                    "spans": [{"file": "scripts/security/semgrep_coverage.py", "start": {"line": 7}}],
                }],
            }), encoding="utf-8")
            process = subprocess.run(
                [sys.executable, str(Path(__file__).with_name("semgrep_coverage.py")), str(report)],
                capture_output=True, text=True, check=False,
            )
        self.assertEqual(process.returncode, 2)
        self.assertEqual(process.stdout, "")
        self.assertIn("type=parse_error,code=3,level=error", process.stderr)
        self.assertNotIn(secret, process.stderr)

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
