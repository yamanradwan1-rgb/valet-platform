"""Explicit Semgrep target selection must use verifiable, unambiguous Git paths."""

import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from semgrep_coverage import changed_targets_binary


class SemgrepChangedTargetsTests(unittest.TestCase):
    def test_tracked_hidden_tests_and_spaces_are_nul_delimited(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)

            def git(*args):
                return subprocess.run(
                    ["git", *args], cwd=root, check=True,
                    capture_output=True, text=True,
                ).stdout.strip()

            git("init", "-q")
            git("config", "user.name", "Fixture")
            git("config", "user.email", "fixture@example.invalid")
            expected = (
                ".github/workflows/security-ci.yml",
                "apps/api/test/issue309-photo-pg-activity.ts",
                "apps/api/test/a path with spaces.ts",
            )
            for path in (*expected, "apps/api/test/preview.png"):
                file = root / path
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text("initial", encoding="utf-8")
            git("add", ".")
            git("commit", "-qm", "base")
            base = git("rev-parse", "HEAD")
            for path in (*expected, "apps/api/test/preview.png"):
                (root / path).write_text("updated", encoding="utf-8")
            git("add", ".")
            git("commit", "-qm", "head")
            with patch("semgrep_coverage._REPO_ROOT", root):
                raw = changed_targets_binary(base)
            self.assertTrue(raw.endswith(b"\0"))
            self.assertEqual(raw.count(b"\0"), len(expected))
            self.assertEqual(
                set(raw[:-1].decode("utf-8").split("\0")), set(expected),
            )

    def test_invalid_commit_and_git_error_fail_closed(self):
        for base in ("", "bad", "0" * 40):
            with self.subTest(base=base), self.assertRaises(ValueError):
                changed_targets_binary(base)

    def test_unavailable_and_symlink_targets_fail_before_scan(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            with patch("semgrep_coverage._REPO_ROOT", root):
                with patch("semgrep_coverage.changed_eligible_paths",
                           return_value={"apps/api/test/missing.ts"}):
                    with self.assertRaisesRegex(ValueError, "missing or unsafe"):
                        changed_targets_binary("a" * 40)
                with patch("semgrep_coverage.changed_eligible_paths",
                           return_value={"apps/api/test/outside.ts"}):
                    link = root / "apps/api/test/outside.ts"
                    link.parent.mkdir(parents=True, exist_ok=True)
                    target = root.parent / "outside-reference.ts"
                    try:
                        link.symlink_to(target)
                    except (OSError, NotImplementedError):
                        self.skipTest("Symlink creation unavailable")
                    with self.assertRaisesRegex(ValueError, "missing or unsafe"):
                        changed_targets_binary("a" * 40)

    def test_cli_invalid_base_has_no_binary_targets_on_stdout(self):
        script = Path(__file__).with_name("semgrep_coverage.py")
        result = subprocess.run(
            [sys.executable, str(script), "--changed-targets", "invalid"],
            capture_output=True, check=False,
        )
        self.assertEqual(result.returncode, 2)
        self.assertEqual(result.stdout, b"")
        self.assertIn(b"INCOMPLETE", result.stderr)

    @unittest.skipUnless(os.name == "posix" and shutil.which("bash"),
                         "Bash wrapper execution needs a Unix shell")
    def test_bash_wrapper_passes_spaced_hidden_targets_and_checks_git_failure(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = Path(__file__).parent
            security = root / "scripts/security"
            security.mkdir(parents=True)
            for name in ("semgrep_coverage.py", "run-semgrep-with-changed-targets.sh"):
                shutil.copyfile(source / name, security / name)
            bin_dir = root / "bin"
            bin_dir.mkdir()
            scanner = bin_dir / "semgrep"
            scanner.write_text(
                "#!/usr/bin/env bash\nprintf '%s\\0' \"$@\" > \"$SEMGREP_ARGV\"\n",
                encoding="utf-8",
            )
            scanner.chmod(0o755)

            def git(*args):
                return subprocess.run(["git", *args], cwd=root, check=True,
                                      capture_output=True, text=True).stdout.strip()

            git("init", "-q")
            git("config", "user.name", "Fixture")
            git("config", "user.email", "fixture@example.invalid")
            targets = (".github/workflows/security-ci.yml",
                       "apps/api/test/photo with spaces.ts")
            for name in targets:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("base", encoding="utf-8")
            git("add", ".")
            git("commit", "-qm", "base")
            base = git("rev-parse", "HEAD")
            for name in targets:
                (root / name).write_text("head", encoding="utf-8")
            git("add", ".")
            git("commit", "-qm", "head")
            capture = root / "semgrep-argv.nul"
            env = {**os.environ, "PATH": f"{bin_dir}:{os.environ['PATH']}",
                   "SEMGREP_ARGV": str(capture)}
            command = ["bash", str(security / "run-semgrep-with-changed-targets.sh")]
            result = subprocess.run([*command, base], cwd=root, env=env,
                                    capture_output=True, check=False)
            self.assertEqual(result.returncode, 0, result.stderr)
            args = capture.read_bytes().decode("utf-8").rstrip("\0").split("\0")
            self.assertTrue(set(targets).issubset(args))
            self.assertIn(f"--baseline-commit={base}", args)
            capture.unlink()
            result = subprocess.run([*command, "0" * 40], cwd=root, env=env,
                                    capture_output=True, check=False)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(capture.exists())


if __name__ == "__main__":
    unittest.main()
