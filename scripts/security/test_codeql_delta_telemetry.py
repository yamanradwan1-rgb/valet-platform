"""Adversarial source-pinned telemetry checks; gate verdict remains authoritative."""

import hashlib
from io import StringIO
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import codeql_delta_telemetry as telemetry
import codeql_gate as gate
from test_codeql_gate import RULE, SECRET, finding, report


class CodeQLDeltaTelemetryTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.source = self.root / "apps/api/src/route.ts"
        self.source.parent.mkdir(parents=True)
        self.source_bytes = ("const secret = '" + SECRET + "';\n" +
                             "export const value = 1;\n" * 119).encode("utf-8")
        self.source.write_bytes(self.source_bytes)
        for command in (("init", "-q"), ("add", "apps/api/src/route.ts"),
                        ("-c", "user.name=Telemetry Test", "-c",
                         "user.email=telemetry@example.invalid", "commit", "-qm", "fixture")):
            subprocess.run(["git", *command], cwd=self.root, capture_output=True, check=True)
        self.head_path = self.root / "head.sarif"
        self.base_path = self.root / "base.sarif"
        self.out = self.root / "codeql-sanitized.json"

    def save_pair(self, head, base, *, summary=None):
        self.head_path.write_text(json.dumps(head), encoding="utf-8")
        self.base_path.write_text(json.dumps(base), encoding="utf-8")
        if summary is None:
            summary = gate.compare(gate.load_scan(self.head_path),
                                   gate.load_scan(self.base_path))
        self.out.write_text(json.dumps(summary), encoding="utf-8")

    def cli(self):
        return subprocess.run([sys.executable, str(Path(telemetry.__file__)),
                               "--head", str(self.head_path),
                               "--base", str(self.base_path),
                               "--source-root", str(self.root),
                               "--out", str(self.out)],
                              capture_output=True, text=True, check=False)

    def augmented(self, head, base):
        self.save_pair(head, base)
        process = self.cli()
        self.assertEqual(process.returncode, 0, process.stderr)
        self.assertNotIn(SECRET, process.stdout + process.stderr)
        return json.loads(self.out.read_text())

    def rejected(self, head, base):
        self.head_path.write_text(json.dumps(head), encoding="utf-8")
        self.base_path.write_text(json.dumps(base), encoding="utf-8")
        try:
            summary = gate.compare(gate.load_scan(self.head_path),
                                   gate.load_scan(self.base_path))
        except gate.InvalidScan:
            summary = {"scanner": "codeql", "total": 0,
                       "existing": 0, "new": 0, "blocked": 0}
        self.out.write_text(json.dumps(summary), encoding="utf-8")
        original = self.out.read_bytes()
        process = self.cli()
        self.assertEqual(process.returncode, 2)
        self.assertEqual(self.out.read_bytes(), original)
        self.assertNotIn(SECRET, process.stdout + process.stderr)

    def test_source_pinned_high_and_critical_preserve_existing_gate_counts(self):
        high = finding(hash_value="raw-loc-1", message="private-message-1")
        critical = finding(hash_value="raw-loc-2", message="private-message-2")
        head = report(high, critical, score="9.5")
        result = self.augmented(head, report(score="9.5"))
        self.assertEqual((result["new"], result["blocked"]), (2, 2))
        entries = result["newHighCriticalDelta"]
        self.assertEqual(len(entries), 2)
        self.assertEqual({entry["primaryLocationLineHashSha256"] for entry in entries},
                         {hashlib.sha256(raw.encode()).hexdigest()
                          for raw in ("raw-loc-1", "raw-loc-2")})
        for entry in entries:
            self.assertEqual(set(entry), {"ruleId", "startLine", "severity",
                                         "primaryLocationLineHashSha256",
                                         "messageSha256", "sourceBlobSha256"})
            self.assertEqual(entry["ruleId"], RULE)
            self.assertEqual(entry["startLine"], 100)
            self.assertEqual(entry["severity"], "CRITICAL")
            self.assertEqual(entry["sourceBlobSha256"],
                             hashlib.sha256(self.source_bytes).hexdigest())
        persisted = self.out.read_text()
        for forbidden in (SECRET, "raw-loc-1", "raw-loc-2", "private-message-1",
                          "private-message-2", "apps/api/src/route.ts", "route.ts",
                          "snippet", "partialFingerprints"):
            self.assertNotIn(forbidden, persisted)

    def test_atomic_replace_failure_preserves_summary_and_removes_temporary_file(self):
        self.save_pair(report(finding()), report())
        original = self.out.read_bytes()
        argv = [str(telemetry.__file__), "--head", str(self.head_path),
                "--base", str(self.base_path), "--source-root", str(self.root),
                "--out", str(self.out)]
        with patch.object(sys, "argv", argv), patch("sys.stderr", new=StringIO()) as stderr:
            with patch.object(telemetry.os, "replace", side_effect=OSError(SECRET)) as replace:
                self.assertEqual(telemetry.main(), 2)
        temporary = Path(replace.call_args.args[0])
        self.assertFalse(temporary.exists())
        self.assertEqual(self.out.read_bytes(), original)
        self.assertEqual(stderr.getvalue().strip(),
                         "CodeQL sanitized telemetry INCOMPLETE (fail closed): "
                         "CATEGORY=OUTPUT_WRITE")
        self.assertNotIn(SECRET, stderr.getvalue())

    def test_atomic_replace_permission_failure_also_cleans_temporary_file(self):
        self.save_pair(report(finding()), report())
        original = self.out.read_bytes()
        argv = [str(telemetry.__file__), "--head", str(self.head_path),
                "--base", str(self.base_path), "--source-root", str(self.root),
                "--out", str(self.out)]
        with patch.object(sys, "argv", argv), patch("sys.stderr", new=StringIO()) as stderr:
            with patch.object(telemetry.os, "replace",
                              side_effect=PermissionError(SECRET)) as replace:
                self.assertEqual(telemetry.main(), 2)
        self.assertFalse(Path(replace.call_args.args[0]).exists())
        self.assertEqual(self.out.read_bytes(), original)
        self.assertIn("CATEGORY=OUTPUT_WRITE", stderr.getvalue())
        self.assertNotIn(SECRET, stderr.getvalue())

    def test_duplicate_multiset_and_high_escalation(self):
        one = finding()
        result = self.augmented(report(one, one, one), report(one))
        self.assertEqual((result["existing"], result["new"], result["blocked"]),
                         (1, 2, 2))
        self.assertEqual(len(result["newHighCriticalDelta"]), 2)
        escalated = self.augmented(report(one, score="9.9"), report(one, score="7.1"))
        self.assertEqual(escalated["blocked"], 1)
        self.assertEqual(escalated["newHighCriticalDelta"][0]["severity"], "CRITICAL")
        downgraded = self.augmented(report(one, score="7.1"), report(one, score="9.9"))
        self.assertEqual(downgraded["blocked"], 0)
        self.assertEqual(downgraded["newHighCriticalDelta"], [])

    def test_59_head_48_existing_11_new_high_matches_real_gate_counts(self):
        existing = [finding(hash_value=f"old-{i}") for i in range(48)]
        additions = [finding(hash_value=f"new-{i}") for i in range(11)]
        result = self.augmented(report(*(existing + additions)), report(*existing))
        self.assertEqual((result["total"], result["existing"], result["new"],
                          result["blocked"], len(result["newHighCriticalDelta"])),
                         (59, 48, 11, 11, 11))

    def test_medium_addition_and_existing_high_produce_empty_delta(self):
        old, new = finding(), finding(hash_value="medium-new")
        result = self.augmented(report(old, new, score="4.5"), report(old, score="4.5"))
        self.assertEqual((result["new"], result["blocked"]), (1, 0))
        self.assertEqual(result["newHighCriticalDelta"], [])
        result = self.augmented(report(old), report(old))
        self.assertEqual(result["newHighCriticalDelta"], [])

    def test_invalid_paths_and_forged_driver_fail_closed_without_leak(self):
        for path in ("../secret.ts", "/etc/secret.ts", "apps/api/../private.ts",
                     "apps/api/src/%2e%2e/private.ts", "file:///etc/passwd",
                     "apps/api/src/absent.ts"):
            with self.subTest(path=path):
                self.rejected(report(finding(file=path)), report())
        forged = report(finding(message=SECRET))
        forged["runs"][0]["tool"]["driver"]["name"] = "Forged-Scanner-" + SECRET
        self.rejected(forged, report())
        unsafe_rule = report(finding(rule="js/SECRET_" + SECRET), query="js/SECRET_" + SECRET)
        self.rejected(unsafe_rule, report())

    def test_missing_invalid_primary_region_on_both_sides(self):
        for variant in (None, 0, -1, True, "100", 9999999999, 2147483648):
            for side in ("head", "base"):
                with self.subTest(variant=variant, side=side):
                    head, base = report(finding()), report(finding())
                    result = (head if side == "head" else base)["runs"][0]["results"][0]
                    physical = result["locations"][0]["physicalLocation"]
                    if variant is None:
                        del physical["region"]
                    else:
                        physical["region"]["startLine"] = variant
                    self.rejected(head, base)
        invalid_head = report(finding())
        invalid_head["runs"][0]["results"][0]["locations"][0][
            "physicalLocation"]["region"]["startLine"] = 121
        self.rejected(invalid_head, report())

    def assert_diagnostic(self, category):
        self.assertIn(category, telemetry.SAFE_CATEGORIES)
        original = self.out.read_bytes()
        process = self.cli()
        self.assertEqual(process.returncode, 2)
        self.assertEqual(process.stdout, "")
        self.assertEqual(process.stderr.strip(),
                         "CodeQL sanitized telemetry INCOMPLETE (fail closed): "
                         f"CATEGORY={category}")
        self.assertEqual(self.out.read_bytes(), original)
        self.assertNotIn(SECRET, process.stderr)

    def test_old_result_without_region_is_gate_valid_but_telemetry_incomplete(self):
        existing = finding()
        head = report(existing, finding(hash_value="new-high"))
        base = report(existing)
        del base["runs"][0]["results"][0]["locations"][0][
            "physicalLocation"]["region"]
        self.save_pair(head, base)
        # The CodeQL gate counts alerts by identity, which does not use region.
        self.assertEqual(json.loads(self.out.read_text())["blocked"], 1)
        self.assert_diagnostic("SARIF_REGION")

    def test_unsafe_rule_id_yields_only_fixed_category(self):
        unsafe = "js/private-" + SECRET
        self.save_pair(report(finding(rule=unsafe), query=unsafe), report(query=unsafe))
        self.assert_diagnostic("SARIF_RULE_ID")

    def test_existing_nonpublic_rule_id_is_never_serialized(self):
        private_rule = "js/private-" + SECRET
        existing = finding(rule=private_rule)
        result = self.augmented(
            report(existing, query=private_rule),
            report(existing, query=private_rule),
        )
        self.assertEqual((result["existing"], result["blocked"]), (1, 0))
        self.assertEqual(result["newHighCriticalDelta"], [])
        self.assertNotIn(private_rule, self.out.read_text())

    def test_source_and_summary_failures_have_fixed_diagnostics(self):
        self.save_pair(report(finding(message=SECRET)), report())
        self.source.write_text("modified source\n", encoding="utf-8")
        self.assert_diagnostic("SOURCE_PIN")
        self.source.write_bytes(self.source_bytes)

        head = report(finding())
        head["runs"][0]["results"][0]["locations"][0][
            "physicalLocation"]["region"]["startLine"] = 121
        self.save_pair(head, report())
        self.assert_diagnostic("SOURCE_LINE_RANGE")

        self.save_pair(report(finding()), report(), summary={
            "scanner": "codeql", "total": 1, "existing": 1, "new": 0, "blocked": 0})
        self.assert_diagnostic("SUMMARY_MISMATCH")

        self.save_pair(report(finding()), report())
        self.head_path.write_text("not JSON " + SECRET, encoding="utf-8")
        self.assert_diagnostic("SARIF_INPUT")

    def test_delta_mismatch_category_cannot_be_influenced_by_alert_data(self):
        row = {"key": (RULE, "apps/api/src/route.ts", "raw", "hash"),
               "severity": "HIGH", "line": 100, "ruleId": RULE,
               "path": "apps/api/src/route.ts",
               "primaryLocationLineHashSha256": "digest", "messageSha256": "hash"}
        with patch.object(telemetry, "_source_pin", return_value="0" * 64):
            with self.assertRaises(telemetry.TelemetryIncomplete) as failure:
                telemetry._delta([row], [], self.root, {"blocked": 0})
        self.assertEqual(failure.exception.category, "DELTA_COUNT")

    def test_incomparable_versions_and_invalid_severity_fail_closed(self):
        self.rejected(report(finding(), version="2.27.4"),
                      report(finding(), version="2.27.3"))
        self.rejected(report(finding(), score="UNKNOWN"), report())
        self.rejected(report(finding(), score="7.1"),
                      report(finding(), score="NaN"))
        failed = report(finding())
        failed["runs"][0]["invocations"][0]["executionSuccessful"] = False
        self.rejected(failed, report())

    def test_modified_or_untracked_source_and_symlink_fail_closed(self):
        head = report(finding())
        self.save_pair(head, report())
        original = self.out.read_bytes()
        self.source.write_text("mutated after CodeQL scan\n", encoding="utf-8")
        self.assertEqual(self.cli().returncode, 2)
        self.assertEqual(self.out.read_bytes(), original)
        self.source.write_bytes(self.source_bytes)
        self.source.unlink()
        self.assertEqual(self.cli().returncode, 2)
        self.assertEqual(self.out.read_bytes(), original)

    def test_wrong_gate_summary_blocks_forged_waiver(self):
        self.save_pair(report(finding()), report(), summary={
            "scanner": "codeql", "total": 1, "new": 0, "blocked": 0, "existing": 1})
        old = self.out.read_bytes()
        self.assertEqual(self.cli().returncode, 2)
        self.assertEqual(self.out.read_bytes(), old)

    def test_noncanonical_paths_and_missing_source_root_rejected(self):
        for relative in ("apps/api/src/./route.ts", "apps\\api\\src\\route.ts",
                         "apps/api/src/%2e%2e/route.ts"):
            with self.subTest(relative=relative):
                self.rejected(report(finding(file=relative)), report())
        self.save_pair(report(finding()), report())
        process = subprocess.run([sys.executable, str(Path(telemetry.__file__)),
                                  "--head", str(self.head_path),
                                  "--base", str(self.base_path),
                                  "--source-root", str(self.root / "apps"),
                                  "--out", str(self.out)],
                                 capture_output=True, text=True, check=False)
        self.assertEqual(process.returncode, 2)
        self.assertEqual(process.stderr.strip(),
                         "CodeQL sanitized telemetry INCOMPLETE (fail closed): "
                         "CATEGORY=SOURCE_ROOT")


if __name__ == "__main__":
    unittest.main()
