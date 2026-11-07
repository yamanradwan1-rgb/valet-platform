"""Prove security baselines against real, disposable Git commit graphs."""

import subprocess
import tempfile
import unittest
from pathlib import Path

from resolve_scan_base import resolve


ZERO = "0" * 40


class SecurityBaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name) / "source"
        self.repo.mkdir()
        self.git("init", "-q", "-b", "main")
        self.git("config", "user.name", "CI Fixture")
        self.git("config", "user.email", "fixture@example.invalid")
        self.initial = self.make_commit("main.txt", "original")
        self.git("update-ref", "refs/remotes/origin/main", self.initial)
        self.git("checkout", "-q", "-b", "feat/first-push")
        self.feature = self.make_commit("feature.txt", "new scoped change")

    def git(self, *args):
        return subprocess.run(
            ["git", *args], cwd=self.repo, capture_output=True, text=True,
            check=True,
        ).stdout.strip()

    def make_commit(self, filename, content):
        (self.repo / filename).write_text(content, encoding="utf-8")
        self.git("add", filename)
        self.git("commit", "-qm", "fixture revision")
        return self.git("rev-parse", "HEAD")

    def args(self, **changes):
        values = {
            "SECURITY_EVENT": "push", "SECURITY_BEFORE": ZERO,
            "SECURITY_REF": "refs/heads/feat/first-push",
            "SECURITY_DEFAULT_BRANCH": "main", "SECURITY_PR_BASE": "",
        }
        values.update(changes)
        return values

    def test_first_feature_push_uses_main_fork_point_not_entire_history(self):
        resolved = resolve(self.args(), cwd=self.repo)
        self.assertEqual(resolved.base, self.initial)
        self.assertEqual(resolved.source, "new-branch-fork-point")
        self.assertEqual(self.git("rev-list", "--count", f"{resolved.base}..HEAD"), "1")

    def test_pr_uses_merge_base_when_main_advanced_independently(self):
        self.git("checkout", "-q", "main")
        advanced = self.make_commit("main-advance.txt", "other team's change")
        self.git("update-ref", "refs/remotes/origin/main", advanced)
        self.git("checkout", "-q", "feat/first-push")
        pr = resolve(self.args(SECURITY_EVENT="pull_request", SECURITY_PR_BASE=advanced), cwd=self.repo)
        first_push = resolve(self.args(), cwd=self.repo)
        self.assertEqual(pr.base, self.initial)
        self.assertEqual(first_push.base, self.initial)
        self.assertNotEqual(pr.base, advanced)

    def test_pr_synthetic_merge_checkout_uses_current_base_parent(self):
        self.git("checkout", "-q", "main")
        advanced = self.make_commit("main-advance.txt", "a separate main change")
        self.git("merge", "-q", "--no-ff", "feat/first-push", "-m", "synthetic PR merge")
        result = resolve(self.args(SECURITY_EVENT="pull_request", SECURITY_PR_BASE=advanced),
                         cwd=self.repo)
        self.assertEqual(result.base, advanced)
        changed = self.git("diff", "--name-only", result.base, "HEAD").splitlines()
        self.assertEqual(changed, ["feature.txt"])

    def test_regular_push_uses_previous_branch_head_exactly(self):
        previous = self.feature
        self.make_commit("follow-up.txt", "changed")
        found = resolve(self.args(SECURITY_BEFORE=previous), cwd=self.repo)
        self.assertEqual(found.base, previous)
        self.assertEqual(found.source, "previous-push")

    def test_force_push_with_available_previous_head_still_compares_previous(self):
        previous = self.feature
        self.git("reset", "-q", "--hard", self.initial)
        self.make_commit("replacement.txt", "new feature direction")
        result = resolve(self.args(SECURITY_BEFORE=previous), cwd=self.repo)
        self.assertEqual(result.base, previous)

    def test_default_branch_first_push_cannot_inherit_itself_as_baseline(self):
        with self.assertRaisesRegex(ValueError, "no safe first-push"):
            resolve(self.args(SECURITY_REF="refs/heads/main"), cwd=self.repo)

    def test_tag_first_push_cannot_avoid_security_scan(self):
        with self.assertRaisesRegex(ValueError, "no safe first-push"):
            resolve(self.args(SECURITY_REF="refs/tags/v1.0"), cwd=self.repo)

    def test_missing_remote_default_branch_fails_closed(self):
        self.git("update-ref", "-d", "refs/remotes/origin/main")
        with self.assertRaisesRegex(ValueError, "unavailable"):
            resolve(self.args(), cwd=self.repo)

    def test_unreachable_previous_push_commit_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "unavailable"):
            resolve(self.args(SECURITY_BEFORE="a" * 40), cwd=self.repo)

    def test_malformed_before_and_missing_pr_base_fail_closed(self):
        for before in ("", "broken", "0" * 39, "a" * 41):
            with self.subTest(before=before), self.assertRaises(ValueError):
                resolve(self.args(SECURITY_BEFORE=before), cwd=self.repo)
        with self.assertRaisesRegex(ValueError, "invalid"):
            resolve(self.args(SECURITY_EVENT="pull_request"), cwd=self.repo)

    def test_unknown_event_and_invalid_default_branch_fail_closed(self):
        with self.assertRaisesRegex(ValueError, "requires a push"):
            resolve(self.args(SECURITY_EVENT="workflow_dispatch"), cwd=self.repo)
        with self.assertRaises(ValueError):
            resolve(self.args(SECURITY_DEFAULT_BRANCH="--oops"), cwd=self.repo)


if __name__ == "__main__":
    unittest.main()
