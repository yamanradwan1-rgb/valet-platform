"""Identify empty incremental Semgrep scans without weakening fail-closed checks."""

import json
import sys
from pathlib import Path


def classify_coverage(report_path: str | Path) -> str:
    data = json.loads(Path(report_path).read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("results"), list):
        raise ValueError("Invalid Semgrep report")
    if not isinstance(data.get("errors"), list) or data["errors"]:
        raise ValueError("Semgrep reported errors or omitted error metadata")
    paths = data.get("paths")
    scanned = paths.get("scanned") if isinstance(paths, dict) else None
    if not isinstance(scanned, list):
        raise ValueError("Semgrep scan coverage missing")
    if not scanned and data["results"]:
        raise ValueError("Semgrep findings contradict zero scanned paths")
    return "fallback" if not scanned else "covered"


if __name__ == "__main__":
    try:
        if len(sys.argv) != 2:
            raise ValueError("Usage: semgrep_coverage.py REPORT")
        print(classify_coverage(sys.argv[1]))
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as error:
        print(f"Semgrep coverage INCOMPLETE (fail closed): {error}", file=sys.stderr)
        sys.exit(2)
