#!/usr/bin/env python3
"""Fail-closed security CI report validation and baseline-aware gates.

Only sanitized metadata is published. Raw scanner output stays on the runner.
No finding is called a confirmed exploit by this script.
"""
import json
import os
import sys
from pathlib import Path

REPORTS = Path("security-reports")
BLOCK = {"HIGH", "CRITICAL"}


def load(path):
    if not path or not Path(path).is_file() or not Path(path).stat().st_size:
        raise ValueError(f"Missing or empty scanner report: {path}")
    with open(path, encoding="utf-8") as stream:
        return json.load(stream)


def text(value):
    return str(value or "").replace("\n", " ").replace("\r", " ").replace("|", "/")[:240]


def severity(value):
    if isinstance(value, str):
        value = value.upper()
        return {"ERROR": "HIGH", "WARNING": "MEDIUM", "INFO": "LOW",
                "MODERATE": "MEDIUM"}.get(value, value)
    return "UNRATED"


def semgrep(data):
    if not isinstance(data, dict) or not isinstance(data.get("results"), list):
        raise ValueError("Invalid Semgrep result format")
    if not isinstance(data.get("errors"), list) or data["errors"]:
        raise ValueError("Semgrep scan/parser errors or missing errors field")
    paths = data.get("paths", {}).get("scanned")
    if not isinstance(paths, list) or not paths:
        raise ValueError("Semgrep scanned paths missing/empty")
    results = []
    for finding in data["results"]:
        extra = finding.get("extra") or {}
        meta = extra.get("metadata") or {}
        level = severity(meta.get("impact") or extra.get("severity"))
        results.append({"id": text(finding.get("check_id")),
                        "file": text(finding.get("path")),
                        "line": (finding.get("start") or {}).get("line"),
                        "severity": level})
    return results


def trivy(data):
    if not isinstance(data, dict) or not isinstance(data.get("Results"), list):
        raise ValueError("Invalid Trivy result format")
    results = []
    for section in data["Results"]:
        target = text(section.get("Target"))
        for vuln in section.get("Vulnerabilities") or []:
            results.append({"kind": "vulnerability", "file": target,
                            "id": text(vuln.get("VulnerabilityID")),
                            "package": text(vuln.get("PkgName")),
                            "version": text(vuln.get("InstalledVersion")),
                            "severity": severity(vuln.get("Severity"))})
        for issue in section.get("Misconfigurations") or []:
            cause = issue.get("CauseMetadata") or {}
            results.append({"kind": "misconfiguration", "file": target,
                            "id": text(issue.get("ID")),
                            "package": text(cause.get("Resource")),
                            "line": cause.get("StartLine"), "version": "",
                            "severity": severity(issue.get("Severity"))})
    return results


def osv(data):
    if not isinstance(data, dict) or not isinstance(data.get("results"), list):
        raise ValueError("Invalid OSV result format")
    results = []
    for group in data["results"]:
        source = (group.get("source") or {}).get("path") or ""
        for pkg in group.get("packages") or []:
            info = pkg.get("package") or {}
            for vuln in pkg.get("vulnerabilities") or []:
                metadata = vuln.get("database_specific") or {}
                level = severity(metadata.get("severity"))
                if level == "UNRATED":
                    for score in vuln.get("severity") or []:
                        value = score.get("score")
                        try:
                            number = float(value)
                        except (ValueError, TypeError):
                            continue
                        level = ("CRITICAL" if number >= 9 else "HIGH" if number >= 7
                                 else "MEDIUM" if number >= 4 else "LOW")
                        break
                results.append({"id": text(vuln.get("id")), "file": text(source),
                                "package": text(info.get("name")),
                                "version": text(info.get("version")),
                                "severity": level})
    return results


def gitleaks(data):
    if not isinstance(data, list):
        raise ValueError("Invalid Gitleaks result format")
    return [{"id": text(x.get("RuleID")), "file": text(x.get("File")),
             "line": x.get("StartLine"), "commit": text(x.get("Commit")),
             "severity": "SECRET"} for x in data]


def fingerprint(item):
    # Severity intentionally excluded: escalating an existing issue to HIGH must gate.
    return (item.get("kind", ""), item.get("file", ""), item.get("id", ""),
            item.get("package", ""), item.get("version", ""), item.get("line", ""))


def run(scanner, head_path, base_path=None):
    parsers = {"semgrep": semgrep, "trivy": trivy, "osv": osv, "gitleaks": gitleaks}
    if scanner not in parsers:
        raise ValueError("Unknown scanner")
    parser = parsers[scanner]
    head = parser(load(head_path))
    base = parser(load(base_path)) if base_path else []
    previous = {fingerprint(item): item["severity"] for item in base}
    new = [item for item in head if fingerprint(item) not in previous or
           (item["severity"] in BLOCK and previous[fingerprint(item)] not in BLOCK)]
    # Gitleaks scans *only* newly introduced commits/files, always gate any secret.
    # OSV advisories without severity must be reviewed, not silently treated as safe.
    blocked = [item for item in new if item["severity"] in BLOCK or
               (scanner == "gitleaks") or
               (scanner == "osv" and item["severity"] == "UNRATED")]
    REPORTS.mkdir(exist_ok=True)
    path = REPORTS / f"{scanner}-sanitized.json"
    path.write_text(json.dumps({"scanner": scanner, "total": len(head),
                                "new": len(new), "blocked": len(blocked),
                                "findings": new[:500]}, indent=2) + "\n",
                    encoding="utf-8")
    status = "FAIL" if blocked else "PASS"
    row = (f"| {scanner} | {len(head)} | {len(new)} | {len(blocked)} | {status} |\n")
    print(row.strip())
    if os.getenv("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
            f.write("### Security CI: " + scanner + "\n"
                    "| Scanner | Findings | New | Gated | Result |\n"
                    "| --- | ---: | ---: | ---: | --- |\n" + row +
                    "\nCandidate findings require human triage; raw reports are not uploaded.\n")
    return 1 if blocked else 0


if __name__ == "__main__":
    try:
        if len(sys.argv) not in (3, 4):
            raise ValueError("Usage: ci_gate.py SCANNER HEAD_REPORT [BASE_REPORT]")
        sys.exit(run(*sys.argv[1:]))
    except (ValueError, OSError, TypeError, KeyError, json.JSONDecodeError) as error:
        print(f"Security scan INCOMPLETE (fail closed): {error}", file=sys.stderr)
        sys.exit(2)
