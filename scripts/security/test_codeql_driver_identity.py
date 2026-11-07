"""CodeQL CLI SARIF driver identity and provenance regressions."""

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import codeql_gate as gate
from test_codeql_gate import SECRET, finding, report


class CodeQLDriverIdentityTests(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.folder = Path(folder.name)

    def save(self, filename, data):
        path = self.folder / filename
        path.write_text(json.dumps(data), encoding="utf-8")
        return path

    def compare(self, head, base):
        head_path = self.save("head.sarif", head)
        base_path = self.save("base.sarif", base)
        return gate.compare(gate.load_scan(head_path), gate.load_scan(base_path))

    @staticmethod
    def named(name, *, semantic=False):
        data = report(finding(), version="2.27.4")
        driver = data["runs"][0]["tool"]["driver"]
        driver["name"] = name
        if semantic:
            driver["semanticVersion"] = driver.pop("version")
        return data

    def test_exact_documented_driver_names_are_accepted(self):
        for name in ("CodeQL", "CodeQL command-line toolchain"):
            with self.subTest(name=name):
                head = self.named(name, semantic=True)
                base = self.named(name)
                summary = self.compare(head, base)
                self.assertEqual(summary["existing"], 1)
                self.assertEqual(summary["new"], 0)
                self.assertEqual(summary["blocked"], 0)

    def test_different_accepted_driver_names_are_not_comparable(self):
        codeql = self.named("CodeQL", semantic=True)
        toolchain = self.named("CodeQL command-line toolchain")
        for head, base in ((codeql, toolchain), (toolchain, codeql)):
            with self.assertRaisesRegex(gate.InvalidScan, "identity"):
                self.compare(head, base)

    def test_lookalike_or_unknown_driver_names_fail_closed(self):
        fake_names = (
            "CodeQL CLI",
            "CodeQL command-line toolchain ",
            "codeql",
            "FakeCodeQL",
            "CodeQL " + SECRET,
        )
        for fake_name in fake_names:
            with self.subTest(name=fake_name):
                head = self.named(fake_name)
                with self.assertRaisesRegex(gate.InvalidScan, "CodeQL CLI"):
                    self.compare(head, self.named("CodeQL"))

    def test_new_high_still_blocks_for_alternate_driver(self):
        head = self.named("CodeQL", semantic=True)
        base = self.named("CodeQL")
        head_run = head["runs"][0]
        head_run["results"].append(finding(
            rule="js/new-high", hash_value="new-high-location"))
        head_run["tool"]["driver"]["rules"].append({
            "id": "js/new-high",
            "properties": {"security-severity": "8.1"},
        })
        summary = self.compare(head, base)
        self.assertEqual((summary["existing"], summary["new"], summary["blocked"]),
                         (1, 1, 1))

    def test_forged_driver_does_not_leak_secrets(self):
        head = self.named("CodeQL " + SECRET)
        head["runs"][0]["results"][0]["message"]["text"] = SECRET
        head_path = self.save("head.sarif", head)
        base_path = self.save("base.sarif", self.named("CodeQL"))
        output_path = self.folder / "sanitized.json"
        process = subprocess.run(
            [sys.executable, str(Path(gate.__file__)),
             "--head", str(head_path), "--base", str(base_path),
             "--out", str(output_path)],
            capture_output=True, text=True, check=False,
        )
        self.assertEqual(process.returncode, 2)
        self.assertNotIn(SECRET, process.stdout + process.stderr)
        self.assertFalse(output_path.exists())


if __name__ == "__main__":
    unittest.main()
