"""SARIF 2.1.0 invocation notification levels and fail-closed coverage."""

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import codeql_gate as gate
from test_codeql_gate import SECRET, finding, report


KINDS = ("toolExecutionNotifications", "toolConfigurationNotifications")


def notice(level, *, message=SECRET):
    return {"level": level, "message": {"text": message}}


class CodeQLNotificationLevelTests(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.folder = Path(folder.name)

    def save(self, name, payload):
        path = self.folder / name
        path.write_text(json.dumps(payload), encoding="utf-8")
        return path

    def scan_pair(self, head, base):
        head_scan = gate.load_scan(self.save("head.sarif", head))
        base_scan = gate.load_scan(self.save("base.sarif", base))
        return head_scan, base_scan

    def cli(self, head, base):
        head_path = self.save("head.sarif", head)
        base_path = self.save("base.sarif", base)
        output = self.folder / "summary.json"
        return subprocess.run(
            [sys.executable, str(Path(gate.__file__)),
             "--head", str(head_path), "--base", str(base_path), "--out", str(output)],
            text=True, capture_output=True, check=False,
        )

    def test_note_and_none_are_informational_in_both_channels(self):
        head, base = report(finding()), report(finding())
        for payload in (head, base):
            invocation = payload["runs"][0]["invocations"][0]
            for kind in KINDS:
                invocation[kind] = [notice("note"), notice("none")]
        head_scan, base_scan = self.scan_pair(head, base)
        self.assertEqual(head_scan.notifications, (1, 1, 0, 0, 0, 1, 1, 0, 0, 0))
        self.assertEqual(base_scan.notifications, head_scan.notifications)
        summary = gate.compare(head_scan, base_scan)
        self.assertEqual((summary["existing"], summary["new"], summary["blocked"]),
                         (1, 0, 0))
        result = self.cli(head, base)
        self.assertEqual(result.returncode, 0)
        self.assertNotIn(SECRET, result.stdout + result.stderr)
        self.assertNotIn(SECRET, (self.folder / "summary.json").read_text())

    def test_real_run_sized_trace_count_is_not_unknown(self):
        head, base = report(), report()
        for payload, count in ((head, 10563), (base, 10556)):
            invocation = payload["runs"][0]["invocations"][0]
            invocation[KINDS[0]] = [notice("none", message="trace")] * count
        head_scan, base_scan = self.scan_pair(head, base)
        self.assertEqual(head_scan.notifications[1], 10563)
        self.assertEqual(base_scan.notifications[1], 10556)
        self.assertEqual(gate.compare(head_scan, base_scan)["blocked"], 0)

    def test_new_high_still_blocks_with_none_and_note_notifications(self):
        head, base = report(finding()), report()
        for payload in (head, base):
            invocation = payload["runs"][0]["invocations"][0]
            invocation[KINDS[0]] = [notice("none"), notice("note")]
        self.assertEqual(gate.compare(*self.scan_pair(head, base))["blocked"], 1)
        self.assertEqual(self.cli(head, base).returncode, 1)

    def test_unknown_and_malformed_levels_fail_on_either_side(self):
        invalid_levels = ("debug", "trace", "None", "none ", "WARNING",
                          "", None, 42, True, [], {})
        for level in invalid_levels:
            for side in ("head", "base"):
                with self.subTest(level=level, side=side):
                    head, base = report(), report()
                    payload = head if side == "head" else base
                    invocation = payload["runs"][0]["invocations"][0]
                    invocation[KINDS[0]] = [notice(level)]
                    with self.assertRaisesRegex(gate.InvalidScan, "error or warning"):
                        gate.compare(*self.scan_pair(head, base))
        for side in ("head", "base"):
            with self.subTest(missing_level=side):
                head, base = report(), report()
                invocation = (head if side == "head" else base)["runs"][0]["invocations"][0]
                invocation[KINDS[1]] = [{"message": {"text": SECRET}}]
                with self.assertRaisesRegex(gate.InvalidScan, "error or warning"):
                    gate.compare(*self.scan_pair(head, base))

    def test_warning_error_and_failed_execution_remain_blocking(self):
        for level in ("warning", "error"):
            for kind in KINDS:
                for side in ("head", "base", "both"):
                    with self.subTest(level=level, kind=kind, side=side):
                        head, base = report(), report()
                        targets = (head, base) if side == "both" else (
                            (head,) if side == "head" else (base,))
                        for payload in targets:
                            payload["runs"][0]["invocations"][0][kind] = [notice(level)]
                        with self.assertRaisesRegex(gate.InvalidScan, "error or warning"):
                            gate.compare(*self.scan_pair(head, base))
        for side in ("head", "base"):
            with self.subTest(failed_execution=side):
                head, base = report(), report()
                payload = head if side == "head" else base
                invocation = payload["runs"][0]["invocations"][0]
                invocation[KINDS[0]] = [notice("none")]
                invocation["executionSuccessful"] = False
                with self.assertRaisesRegex(gate.InvalidScan, "successful execution"):
                    self.scan_pair(head, base)

    def test_unknown_level_does_not_leak_raw_messages(self):
        head, base = report(), report()
        invocation = base["runs"][0]["invocations"][0]
        invocation[KINDS[1]] = [notice("debug")]
        result = self.cli(head, base)
        self.assertEqual(result.returncode, 2)
        self.assertIn("config_unknown=1", result.stderr)
        self.assertNotIn(SECRET, result.stdout + result.stderr)
        self.assertFalse((self.folder / "summary.json").exists())


if __name__ == "__main__":
    unittest.main()
