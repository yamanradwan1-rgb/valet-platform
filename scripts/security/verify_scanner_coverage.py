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


def required_text(value: object) -> bool:
    """Require an actual nonblank scanner identity, not a truthy placeholder."""
    return isinstance(value, str) and bool(value.strip())


def validate_trivy_entries(entries: object, *, kind: str) -> list:
    if not isinstance(entries, list):
        raise ValueError(f"Trivy {kind} evidence is malformed")
    keys = ("Name", "Version") if kind == "package" else (
        "VulnerabilityID", "PkgName", "InstalledVersion")
    for entry in entries:
        if not isinstance(entry, dict) or not all(required_text(entry.get(key)) for key in keys):
            raise ValueError(f"Trivy {kind} lacks a valid identity and version")
    return entries


def validate_osv_packages(packages: object) -> list:
    if not isinstance(packages, list):
        raise ValueError("OSV package results are malformed")
    for entry in packages:
        if not isinstance(entry, dict) or not isinstance(entry.get("package"), dict):
            raise ValueError("OSV package identity is missing")
        identity = entry["package"]
        if not required_text(identity.get("name")) or not required_text(identity.get("version")):
            raise ValueError("OSV package name or version is missing")
        findings = entry.get("vulnerabilities", [])
        if not isinstance(findings, list):
            raise ValueError("OSV vulnerabilities are malformed")
        if any(not isinstance(vuln, dict) or not required_text(vuln.get("id"))
               for vuln in findings):
            raise ValueError("OSV vulnerability ID is missing")
    return packages


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
    if data.get("ArtifactType") not in {"repository", "filesystem"} or not isinstance(data.get("Results"), list):
        raise ValueError("Trivy checkout results are missing or invalid")
    found = False
    for result in data["Results"]:
        if not isinstance(result, dict):
            raise ValueError("Trivy result entry is invalid")
        target = repo_target(result.get("Target"), root)
        if target == root / LOCKFILE:
            if result.get("Class") != "lang-pkgs" or result.get("Type") != "pnpm":
                raise ValueError("Trivy did not identify the pnpm dependency target")
            packages = validate_trivy_entries(result.get("Packages", []), kind="package")
            findings = validate_trivy_entries(result.get("Vulnerabilities", []), kind="vulnerability")
            if not packages and not findings:
                raise ValueError("Trivy pnpm target contains no extraction evidence")
            found = True
    if not found:
        raise ValueError("Trivy did not report scanning pnpm-lock.yaml")


def verify_osv(data: object, root: Path, explicit_lockfile: bool, exit_code: int) -> None:
    if not isinstance(data, dict) or not isinstance(data.get("results"), list):
        raise ValueError("OSV scan results are missing or invalid")
    found_packages = False
    found_vulnerabilities = False
    for result in data["results"]:
        if not isinstance(result, dict) or not isinstance(result.get("source"), dict):
            raise ValueError("OSV source evidence is missing")
        source = result["source"]
        kind = source.get("type")
        if kind not in {"lockfile", "sbom", "git"}:
            raise ValueError("OSV reported an unexpected source type")
        target = repo_target(source.get("path"), root, directory=kind == "git")
        packages = validate_osv_packages(result.get("packages"))
        if any(entry.get("vulnerabilities") for entry in packages):
            found_vulnerabilities = True
        if kind == "lockfile" and target == root / LOCKFILE and packages:
            found_packages = True
    if not found_packages and (data["results"] or not explicit_lockfile or exit_code != 0):
        raise ValueError("OSV report does not prove pnpm-lock.yaml package coverage")
    if exit_code == 1 and not found_vulnerabilities:
        raise ValueError("OSV found-vulnerabilities exit conflicts with empty vulnerability data")


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
