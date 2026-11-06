"""Resolve a trustworthy Git comparison base for incremental security scans.

The caller must check out complete history (fetch-depth: 0). An unresolvable
baseline fails closed instead of misclassifying the repository as all-new risk.
"""

import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


_SHA = re.compile(r"[0-9a-f]{40}(?:[0-9a-f]{24})?\Z")
_ZERO_SHA = re.compile(r"0{40}(?:0{24})?\Z")


@dataclass(frozen=True)
class Comparison:
    base: str
    source: str


def git(*args: str, cwd: str | Path | None = None) -> str:
    result = subprocess.run(
        ["git", *args], cwd=cwd, text=True, capture_output=True, check=False,
    )
    if result.returncode != 0:
        raise ValueError("required Git commit or ancestry is unavailable")
    return result.stdout.strip()


def commit(sha: str, *, cwd: str | Path | None = None) -> str:
    if not _SHA.fullmatch(sha):
        raise ValueError("invalid security comparison commit")
    git("cat-file", "-e", f"{sha}^{{commit}}", cwd=cwd)
    return sha


def merge_base(ref: str, *, cwd: str | Path | None = None) -> str:
    ancestor = git("merge-base", ref, "HEAD", cwd=cwd)
    return commit(ancestor, cwd=cwd)


def resolve(environ: dict[str, str], *, cwd: str | Path | None = None) -> Comparison:
    event = environ.get("SECURITY_EVENT", "")
    if event == "pull_request":
        base = commit(environ.get("SECURITY_PR_BASE", ""), cwd=cwd)
        return Comparison(merge_base(base, cwd=cwd), "pr-merge-base")

    if event != "push":
        raise ValueError("security scan requires a push or pull_request event")

    before = environ.get("SECURITY_BEFORE", "")
    if not _ZERO_SHA.fullmatch(before):
        if _SHA.fullmatch(before):
            return Comparison(commit(before, cwd=cwd), "previous-push")
        raise ValueError("push comparison commit is invalid or missing")

    # A zero BEFORE on a new feature branch is not authorization to call every
    # historical vulnerability or secret new. Compare to the fork point instead.
    default = environ.get("SECURITY_DEFAULT_BRANCH", "")
    ref = environ.get("SECURITY_REF", "")
    if not default or git("check-ref-format", "--branch", default, cwd=cwd) != default:
        raise ValueError("default branch cannot be validated")
    if not ref.startswith("refs/heads/") or ref == f"refs/heads/{default}":
        raise ValueError("no safe first-push comparison for this ref")
    if ref == "refs/heads/":
        raise ValueError("missing feature branch name")
    upstream = f"refs/remotes/origin/{default}"
    baseline = git("rev-parse", "--verify", f"{upstream}^{{commit}}", cwd=cwd)
    commit(baseline, cwd=cwd)
    return Comparison(merge_base(baseline, cwd=cwd), "new-branch-fork-point")


def main() -> int:
    try:
        comparison = resolve(dict(os.environ))
        destination = os.environ.get("GITHUB_ENV", "")
        if not destination:
            raise ValueError("GITHUB_ENV is missing")
        with open(destination, "a", encoding="utf-8") as stream:
            stream.write(f"SECURITY_BASE_SHA={comparison.base}\n")
            stream.write(f"SCAN_RANGE={comparison.base}..HEAD\n")
        print(f"Security comparison verified: {comparison.source} ({comparison.base[:12]})")
        return 0
    except (ValueError, OSError) as error:
        print(f"Security baseline INCOMPLETE (fail closed): {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
