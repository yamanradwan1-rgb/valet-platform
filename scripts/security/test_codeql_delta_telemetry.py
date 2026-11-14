"""Adversarial source-pinned telemetry checks; gate verdict remains authoritative."""

import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

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
            self.assertEqual(set(entry), {"ruleId", "path", "startLine", "severity",
                                         "primaryLocationLineHashSha256",
                                         "messageSha256", "sourceBlobSha256"})
            self.assertEqual(entry["ruleId"], RULE)
            self.assertEqual(entry["path"], "apps/api/src/route.ts")
            self.assertEqual(entry["startLine"], 100)
            self.assertEqual(entry["severity"], "CRITICAL")
            self.assertEqual(entry["sourceBlobSha256"],
                             hashlib.sha256(self.source_bytes).hexdigest())
        persisted = self.out.read_text()
        for forbidden in (SECRET, "raw-loc-1", "raw-loc-2", "private-message-1",
                          "private-message-2", "snippet", "partialFingerprints"):
            self.assertNotIn(forbidden, persisted)

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


if __name__ == "__main__":
    unittest.main()
