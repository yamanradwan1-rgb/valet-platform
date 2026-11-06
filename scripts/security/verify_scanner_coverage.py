#!/usr/bin/env python3
"""Verify pnpm lockfile scan coverage before the baseline-aware security gate.

Trivy JSON can prove coverage through its package target. OSV v2 JSON reports
vulnerabilities, not an inventory of clean lockfiles. For a clean OSV result,
the workflow MUST run the scanner against --lockfile=/src/pnpm-lock.yaml and
pass --explicit-lockfile only after checking that scanner's actual exit code.
This flag is an assertion by trusted workflow code, not evidence from JSON.
"""

import argparse
import json
import sys
from pathlib import Path, PurePosixPath

LOCKFILE = "pnpm-lock.yaml"
CONTAINER_ROOT = "/src"


def lockfile_at(root: Path) -> Path:
    if not root.is_dir():
        raise ValueError("Scanner checkout is missing")
    lockfile = root / LOCKFILE
    if lockfile.is_symlink() or not lockfile.is_file() or lockfile.stat().st_size == 0:
        raise ValueError("Required pnpm lockfile is missing or empty")
    return lockfile


def repo_target(value: object, root: Path, *, directory: bool = False) -> Path:
    """Accept only existing checkout paths reported beneath the /src mount."""
    if not isinstance(value, str) or not value or "\\" in value or "\x00" in value:
        raise ValueError("Scanner reported an invalid target path")
    if directory and value == CONTAINER_ROOT:
        return root
    if value.startswith(CONTAINER_ROOT + "/"):
        value = value[len(CONTAINER_ROOT) + 1:]
    elif value.startswith("/"):
        raise ValueError("Scanner reported a target outside its checkout")
    if "//" in value or any(part in {".", ".."} for part in value.split("/")):
        raise ValueError("Scanner reported a noncanonical target path")
    path = PurePosixPath(value)
    if path.is_absolute() or not path.parts or ":" in path.parts[0]:
        raise ValueError("Scanner reported an invalid target path")
    target = root.joinpath(*path.parts)
    if not target.resolve().is_relative_to(root.resolve()):
        raise ValueError("Scanner target is outside its checkout")
    if not (target.is_dir() if directory else target.is_file()):
        raise ValueError("Scanner target is not an existing checkout path")
    return target


def verify_trivy(data: object, root: Path) -> None:
    if not isinstance(data, dict) or data.get("ArtifactName") != CONTAINER_ROOT:
        raise ValueError("Trivy filesystem target is missing or unexpected")
    if data.get("ArtifactType") != "filesystem" or not isinstance(data.get("Results"), list):
        raise ValueError("Trivy filesystem results are missing or invalid")
    found = False
    for result in data["Results"]:
        if not isinstance(result, dict):
            raise ValueError("Trivy result entry is invalid")
        target = repo_target(result.get("Target"), root)
        if target == root / LOCKFILE:
            if result.get("Class") != "lang-pkgs" or result.get("Type") != "pnpm":
                raise ValueError("Trivy did not identify the pnpm dependency target")
            packages = result.get("Packages") or []
            findings = result.get("Vulnerabilities") or []
            if not isinstance(packages, list) or not isinstance(findings, list):
                raise ValueError("Trivy dependency evidence is malformed")
            if not packages and not findings:
                raise ValueError("Trivy pnpm target contains no extraction evidence")
            found = True
    if not found:
        raise ValueError("Trivy did not report scanning pnpm-lock.yaml")


def verify_osv(data: object, root: Path, explicit_lockfile: bool, exit_code: int) -> None:
    if not isinstance(data, dict) or not isinstance(data.get("results"), list):
        raise ValueError("OSV scan results are missing or invalid")
    found_packages = False
    for result in data["results"]:
        if not isinstance(result, dict) or not isinstance(result.get("source"), dict):
            raise ValueError("OSV source evidence is missing")
        source = result["source"]
        kind = source.get("type")
        if kind not in {"lockfile", "sbom", "git"}:
            raise ValueError("OSV reported an unexpected source type")
        target = repo_target(source.get("path"), root, directory=kind == "git")
        packages = result.get("packages")
        if not isinstance(packages, list):
            raise ValueError("OSV package results are malformed")
        if kind == "lockfile" and target == root / LOCKFILE and packages:
            found_packages = True
    if not found_packages:
        if not explicit_lockfile or exit_code != 0:
            raise ValueError("OSV empty report cannot prove pnpm package coverage")


def verify(scanner: str, report: Path, checkout: Path, exit_code: int,
           *, explicit_lockfile: bool = False) -> None:
    root = checkout.resolve(strict=True)
    lockfile_at(root)
    if scanner == "trivy":
        if exit_code != 0 or explicit_lockfile:
            raise ValueError("Unexpected Trivy scan invocation or exit status")
    elif scanner == "osv":
        if exit_code not in {0, 1}:
            raise ValueError("OSV scan failed or found no packages")
    else:
        raise ValueError("Unsupported security scanner")
    if not report.is_file() or report.stat().st_size == 0:
        raise ValueError("Scanner JSON report is missing or empty")
    data = json.loads(report.read_text(encoding="utf-8"))
    if scanner == "trivy":
        verify_trivy(data, root)
    else:
        verify_osv(data, root, explicit_lockfile, exit_code)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scanner", choices=("trivy", "osv"))
    parser.add_argument("report", type=Path)
    parser.add_argument("checkout", type=Path)
    parser.add_argument("--scan-exit-code", type=int, required=True)
    parser.add_argument("--explicit-lockfile", action="store_true")
    args = parser.parse_args()
    try:
        verify(args.scanner, args.report, args.checkout, args.scan_exit_code,
               explicit_lockfile=args.explicit_lockfile)
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as error:
        print(f"Security scan coverage INCOMPLETE (fail closed): {error}", file=sys.stderr)
        return 2
    print(f"{args.scanner}: pnpm-lock.yaml coverage verified")
    return 0


if __name__ == "__main__":
    sys.exit(main())
