"""Adversarial contract tests for fail-closed CodeQL SARIF delta gating."""

from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import codeql_gate as gate


RULE = "js/unsafe-query"
SECRET = "PRIVATE_SOURCE_TOKEN_SHOULD_NEVER_PRINT"


def report(*results, score="8.2", query=RULE, version="2.24.0", category="js"):
    return {
        "version": "2.1.0",
        "runs": [{
            "properties": {"semmle.formatSpecifier": "sarifv2.1.0"},
            "tool": {"driver": {
                "name": "CodeQL command-line toolchain", "version": version,
                "rules": [{"id": query, "properties": {
                    "tags": ["security"], "security-severity": score}}],
            }},
            "automationDetails": {"id": category},
            "invocations": [{"executionSuccessful": True}],
            "results": list(results),
        }],
    }


def finding(*, hash_value="fingerprint:1", file="apps/api/src/route.ts",
            rule=RULE, message="Unsanitized SQL query", source=SECRET):
    return {
        "ruleId": rule,
        "level": "warning",  # This is NOT the security severity.
        "message": {"text": message},
        "locations": [{"physicalLocation": {
            "artifactLocation": {"uri": file, "uriBaseId": "%SRCROOT%"},
            "region": {"startLine": 100, "snippet": {"text": source}},
        }}],
        "partialFingerprints": {"primaryLocationLineHash": hash_value},
    }


class CodeQLGateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.folder = Path(self.tmp.name)

    def write(self, name, payload):
        path = self.folder / name
        path.write_text(json.dumps(payload), encoding="utf-8")
        return path

    def run_gate(self, head, base):
        head_file = self.write("head.sarif", head)
        base_file = self.write("base.sarif", base)
        return gate.compare(gate.load_scan(head_file), gate.load_scan(base_file))

    def cli(self, head, base):
        self.write("head.sarif", head)
        self.write("base.sarif", base)
        return subprocess.run(
            [sys.executable, str(Path(gate.__file__)), "--head",
             str(self.folder / "head.sarif"), "--base",
             str(self.folder / "base.sarif"), "--out",
             str(self.folder / "sanitized.json")],
            text=True, capture_output=True, check=False,
        )

    def test_empty_both_valid_reports_pass_without_false_alerts(self):
        self.assertEqual(self.run_gate(report(), report()),
                         {"scanner": "codeql", "total": 0,
                          "existing": 0, "new": 0, "blocked": 0})
        self.assertEqual(self.cli(report(), report()).returncode, 0)

    def test_existing_high_is_not_new_and_does_not_gate(self):
        old = finding()
        result = self.run_gate(report(old), report(old))
        self.assertEqual((result["existing"], result["new"], result["blocked"]), (1, 0, 0))
        self.assertEqual(self.cli(report(old), report(old)).returncode, 0)

    def test_new_high_and_critical_block_but_new_low_medium_do_not(self):
        for score, blocked in (("3.9", 0), ("4.0", 0), ("7.0", 1),
                               ("9.0", 1), ("9.1", 1)):
            with self.subTest(score=score):
                new = report(finding(), score=score)
                clean = report(score=score)
                actual = self.run_gate(new, clean)
                self.assertEqual(actual["blocked"], blocked)
                self.assertEqual(self.cli(new, clean).returncode, int(blocked > 0))

    def test_level_error_cannot_override_low_security_score(self):
        low = report(finding(), score="2.5")
        self.assertEqual(self.run_gate(low, report(score="2.5"))["blocked"], 0)

    def test_same_rule_file_different_primary_hash_cannot_hide_new(self):
        base = report(finding(hash_value="first"))
        head = report(finding(hash_value="first"), finding(hash_value="second"))
        self.assertEqual(self.run_gate(head, base)["blocked"], 1)

    def test_repeated_fingerprint_uses_counts_not_set_membership(self):
        base = report(finding())
        head = report(finding(), finding())
        self.assertEqual(self.run_gate(head, base)["blocked"], 1)

    def test_changed_message_same_fingerprint_is_not_silently_discarded(self):
        base = report(finding(message="old message"))
        head = report(finding(message="new message"))
        self.assertEqual(self.run_gate(head, base)["blocked"], 1)

    def test_location_line_moves_are_still_same_alert(self):
        original = finding()
        moved = finding()
        moved["locations"][0]["physicalLocation"]["region"]["startLine"] = 999
        self.assertEqual(self.run_gate(report(moved), report(original))["new"], 0)

    def test_escalating_existing_finding_to_high_or_critical_blocks(self):
        current = finding()
        for before, after in (("3.0", "8.0"), ("7.5", "9.5")):
            with self.subTest(before=before, after=after):
                self.assertEqual(self.run_gate(report(current, score=after),
                                               report(current, score=before))["blocked"], 1)

    def test_same_location_different_file_or_rule_is_not_existing(self):
        original = finding()
        new_path = finding(file="apps/api/src/other.ts")
        self.assertEqual(self.run_gate(report(new_path), report(original))["blocked"], 1)
        other = report(finding(rule="js/other"), query="js/other")
        with self.assertRaisesRegex(gate.InvalidScan, "query suite"):
            self.run_gate(other, report(original))

    def test_missing_and_corrupt_reports_fail_closed_without_leaking_paths(self):
        for name, data in (("missing.sarif", None), ("empty.sarif", b""),
                           ("broken.sarif", b"{" + SECRET.encode()),
                           ("invalidutf.sarif", b"\xff"),
                           ("not-json-number.sarif", b'{"invalid":NaN}'),
                           ("huge-integer.sarif", b'{"value":' + b'9' * 5000 + b'}')):
            with self.subTest(name=name):
                path = self.folder / name
                if data is not None:
                    path.write_bytes(data)
                with self.assertRaises(gate.InvalidScan) as caught:
                    gate.load_scan(path)
                self.assertNotIn(SECRET, str(caught.exception))
                self.assertNotIn(str(path), str(caught.exception))

    def test_sarif_malformed_and_missing_required_fields_fail_closed(self):
        cases = [
            {}, {"version": "2.1.0", "runs": []},
            {"version": "2.1.0", "runs": [{}, {}]},
            report(finding(hash_value="")),
            report(finding(rule="js/nonexistent")),
            report(finding(file="/tmp/source.ts")),
            report(finding(file="../outside.ts")),
            report(finding(file="apps/api/src/%2E%2E/outside.ts")),
            report(finding(file="file:///src/absolute.ts")),
        ]
        missing_format = report()
        del missing_format["runs"][0]["properties"]
        cases.append(missing_format)
        missing_category = report()
        del missing_category["runs"][0]["automationDetails"]
        cases.append(missing_category)
        missing_invocation_success = report()
        missing_invocation_success["runs"][0]["invocations"] = [{}]
        cases.append(missing_invocation_success)
        wrong_index = report(finding())
        wrong_index["runs"][0]["results"][0]["ruleIndex"] = 3
        cases.append(wrong_index)
        conflicting_index = report(finding())
        conflicting_index["runs"][0]["results"][0]["ruleIndex"] = 0
        conflicting_index["runs"][0]["results"][0]["rule"] = {"index": 1}
        cases.append(conflicting_index)
        conflicting_reference = report(finding())
        conflicting_reference["runs"][0]["results"][0]["rule"] = {"id": "js/other"}
        cases.append(conflicting_reference)
        invalid_url = report(finding(file="http://["))
        cases.append(invalid_url)
        for index, payload in enumerate(cases):
            with self.subTest(index=index), self.assertRaises(gate.InvalidScan):
                gate.load_scan(self.write(f"invalid-{index}.sarif", payload))

    def test_unknown_or_missing_score_fails_closed_even_if_preexisting(self):
        for score in (None, "", "UNKNOWN", "-1", "0", "NaN", "Infinity", "11"):
            with self.subTest(score=score), self.assertRaises(gate.InvalidScan):
                self.run_gate(report(finding(), score=score), report(finding(), score=score))

    def test_rules_and_tool_version_or_category_mismatch_fail_closed(self):
        cases = [
            (report(finding(), version="2.25.0"), report(finding())),
            (report(finding(), category="python"), report(finding())),
            (report(finding(), query="js/other"), report()),
        ]
        for head, base in cases:
            with self.subTest(head=head["runs"][0]["automationDetails"]["id"]):
                with self.assertRaises(gate.InvalidScan):
                    self.run_gate(head, base)

    def test_execution_errors_warning_notifications_and_duplicate_json_fail(self):
        for change in (
            {"executionSuccessful": False},
            {"toolExecutionNotifications": [{"level": "error", "message": {"text": SECRET}}]},
            {"toolConfigurationNotifications": [{"level": "warning"}]},
        ):
            with self.subTest(change=change), self.assertRaises(gate.InvalidScan):
                payload = report()
                payload["runs"][0]["invocations"] = [change]
                gate.load_scan(self.write("scanner-error.sarif", payload))
        self.write("duplicate.sarif", report())
        (self.folder / "duplicate.sarif").write_text(
            '{"version":"2.1.0","version":"2.1.0","runs":[]}', encoding="utf-8")
        with self.assertRaisesRegex(gate.InvalidScan, "duplicate"):
            gate.load_scan(self.folder / "duplicate.sarif")

    def test_extension_rule_reference_and_index_are_validated(self):
        head = report(finding())
        run = head["runs"][0]
        driver = run["tool"]["driver"]
        descriptor = driver["rules"].pop()
        run["tool"]["extensions"] = [{"name": "security-pack", "rules": [descriptor]}]
        result = run["results"][0]
        result["ruleIndex"] = 0
        result["rule"] = {"index": 0, "toolComponent": {"index": 0}}
        self.assertEqual(self.run_gate(head, report())["blocked"], 1)
        result["rule"]["toolComponent"]["index"] = 1
        with self.assertRaisesRegex(gate.InvalidScan, "tool component"):
            self.run_gate(head, report())
        result["rule"]["toolComponent"]["index"] = 0
        del result["ruleIndex"]
        self.assertEqual(self.run_gate(head, report())["blocked"], 1)

    def test_cli_does_not_output_code_messages_or_rule_fingerprints(self):
        new = finding(hash_value=SECRET, message=SECRET, source=SECRET)
        run = self.cli(report(new), report())
        self.assertEqual(run.returncode, 1)
        output = run.stdout + run.stderr
        persisted = (self.folder / "sanitized.json").read_text(encoding="utf-8")
        for forbidden in (SECRET, "apps/api/src/route.ts", RULE, "snippet"):
            self.assertNotIn(forbidden, output + persisted)
        self.assertEqual(json.loads(persisted)["blocked"], 1)

    def test_cli_missing_or_same_file_and_scanner_errors_fail_with_code_two(self):
        payload = report(finding())
        payload["runs"][0]["invocations"][0]["executionSuccessful"] = False
        bad = self.cli(payload, report())
        self.assertEqual(bad.returncode, 2)
        self.assertNotIn(SECRET, bad.stderr)
        clean = self.write("same.sarif", report())
        command = [sys.executable, str(Path(gate.__file__)), "--head", str(clean),
                   "--base", str(clean), "--out", str(self.folder / "same-result.json")]
        same = subprocess.run(command, capture_output=True, text=True, check=False)
        self.assertEqual(same.returncode, 2)

    def test_log_never_prints_raw_source_on_corruption(self):
        head = report(finding(source=SECRET, message=SECRET))
        base = report()
        run = self.cli(head, base)
        self.assertNotIn(SECRET, run.stdout + run.stderr)
        self.assertEqual(run.returncode, 1)


if __name__ == "__main__":
    unittest.main()
