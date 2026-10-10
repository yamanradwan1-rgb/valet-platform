"""Summarize free security scanners without treating failed scans as clean."""

import json
import os
import sys
from pathlib import Path


ROOT = Path("security-reports")
MODE = sys.argv[1] if len(sys.argv) == 2 else ""
EXPECTED = {
    "static": ["semgrep.json", "trivy.json", "gitleaks.json", "osv.json", "pnpm-audit.json"],
    "dast": ["dashboard.json", "api.json"],
}
STEP_NAMES = {
    "static": ["SEMGREP", "TRIVY", "GITLEAKS", "OSV", "PNPM_AUDIT"],
    "dast": ["ZAP_DASHBOARD", "ZAP_API"],
}


def read_report(name):
    path = ROOT / name
    if not path.is_file() or not path.stat().st_size:
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (UnicodeError, ValueError):
        return None


def count(name, data):
    if name == "semgrep.json":
        return str(len(data.get("results", []))) if isinstance(data, dict) else "Invalid format"
    if name == "trivy.json":
        if not isinstance(data, dict):
            return "Invalid format"
        return str(sum(len(x.get("Vulnerabilities") or []) + len(x.get("Misconfigurations") or [])
                       for x in data.get("Results", [])))
    if name == "gitleaks.json":
        return str(len(data)) if isinstance(data, list) else "Invalid format"
    if name == "osv.json":
        return f"{len(data.get('results', []))} result groups (see JSON)" if isinstance(data, dict) else "Invalid format"
    if name == "pnpm-audit.json":
        if not isinstance(data, dict):
            return "Invalid format"
        vulns = data.get("metadata", {}).get("vulnerabilities", {})
        return str(sum(v for k, v in vulns.items() if k != "total" and isinstance(v, int))) \
            if isinstance(vulns, dict) else "JSON available; see report"
    if name.endswith(".json"):
        if not isinstance(data, dict):
            return "Invalid format"
        sites = data.get("site", [])
        return str(sum(len(site.get("alerts", [])) for site in sites)) if isinstance(sites, list) else "Invalid format"
    return "Unknown"


if MODE not in EXPECTED:
    raise SystemExit("Usage: summarize_audit.py static|dast")

rows = ["### " + ("Static Security Audit" if MODE == "static" else "Local-only ZAP Audit"), "",
        "| Tool report | Candidate findings |", "| --- | ---: |"]
missing = []
for filename in EXPECTED[MODE]:
    data = read_report(filename)
    result = count(filename, data) if data is not None else "Invalid format"
    if data is None or result == "Invalid format":
        missing.append(filename)
    rows.append(f"| {filename} | {result if data is not None else 'INCOMPLETE'} |")

failed_steps = [name for name in STEP_NAMES[MODE]
                if os.getenv(f"{name}_OUTCOME", "success") != "success"]

rows += ["", "Findings are unverified leads, not confirmed exploits."]
if MODE == "dast":
    rows.append("Only ephemeral localhost services were targeted. This is an unauthenticated scan;")
    rows.append("role/tenant BOLA, IDOR, MFA and business-logic paths need separate tests.")
if missing:
    rows.append("**Scanner report missing or invalid:** " + ", ".join(missing))
if failed_steps:
    rows.append("**Scanner failed:** " + ", ".join(failed_steps))

body = "\n".join(rows) + "\n"
ROOT.mkdir(parents=True, exist_ok=True)
(ROOT / "SUMMARY.md").write_text(body, encoding="utf-8")
print(body)
if os.getenv("GITHUB_STEP_SUMMARY"):
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as summary:
        summary.write(body)
if missing or failed_steps:
    raise SystemExit(1)
