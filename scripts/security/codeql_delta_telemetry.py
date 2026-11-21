#!/usr/bin/env python3
"""Opt-in, source-pinned telemetry for CodeQL's existing sanitized delta gate.

The gate owns the verdict. This program only annotates its exact existing
summary, after verifying the same head/base inputs and committed head sources.
"""

import argparse
from collections import defaultdict
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

import codeql_gate as gate


MAX_SOURCE_BYTES = 8 * 1024 * 1024
SAFE_RULE_ID = re.compile(r"js/[a-z][a-z0-9-]{0,95}\Z", re.ASCII)
SAFE_CATEGORIES = frozenset({
    "SOURCE_ROOT", "SARIF_INPUT", "SUMMARY_READBACK", "SUMMARY_MISMATCH",
    "SARIF_ROWS", "SARIF_ROW_COUNT", "SARIF_RULE_ID", "SARIF_REGION",
    "SOURCE_PIN", "SOURCE_LINE_RANGE", "DELTA_COUNT", "OUTPUT_WRITE",
    "UNCLASSIFIED",
})


class TelemetryIncomplete(gate.InvalidScan):
    """Static diagnostic only; never carry SARIF values or exception text."""

    def __init__(self, category: str):
        if category not in SAFE_CATEGORIES:
            raise ValueError("invalid telemetry diagnostic category")
        self.category = category
        super().__init__(category)


@contextmanager
def _diagnose(category: str):
    try:
        yield
    except TelemetryIncomplete:
        raise
    except (gate.InvalidScan, OSError, ValueError, RuntimeError, UnicodeError,
            TypeError, KeyError, IndexError):
        raise TelemetryIncomplete(category) from None


def _git(root: Path, *args: str) -> bytes:
    try:
        result = subprocess.run(["git", *args], cwd=root, capture_output=True,
                                check=False)
    except OSError:
        raise gate.InvalidScan("cannot verify committed CodeQL source") from None
    if result.returncode:
        raise gate.InvalidScan("cannot verify committed CodeQL source")
    return result.stdout


def _source_pin(root: Path, relative: str, line: int, cache: dict) -> str:
    if relative in cache:
        digest, line_count = cache[relative]
    else:
        source = root.joinpath(*relative.split("/"))
        try:
            if source.is_symlink() or source.resolve(strict=True) != source.absolute():
                raise gate.InvalidScan("CodeQL source is not a regular tracked file")
            if not source.is_file():
                raise gate.InvalidScan("CodeQL source is not a regular tracked file")
        except (OSError, RuntimeError):
            raise gate.InvalidScan("cannot verify committed CodeQL source") from None
        entry = _git(root, "ls-tree", "-z", "HEAD", "--", relative)
        try:
            metadata, recorded = entry.rstrip(b"\0").split(b"\t", 1)
            mode, kind, oid = metadata.decode("ascii").split(" ")
            if (not entry.endswith(b"\0") or recorded != relative.encode("utf-8")
                    or mode not in ("100644", "100755") or kind != "blob"
                    or not re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", oid)):
                raise ValueError("untrusted tree entry")
            size = int(_git(root, "cat-file", "-s", oid).strip())
            if size > MAX_SOURCE_BYTES:
                raise ValueError("oversized source blob")
            committed = _git(root, "cat-file", "blob", oid)
            if len(committed) != size or source.read_bytes() != committed:
                raise ValueError("source differs from committed HEAD")
        except (ValueError, UnicodeError, OSError):
            raise gate.InvalidScan("CodeQL source does not match committed HEAD") from None
        digest = hashlib.sha256(committed).hexdigest()
        line_count = len(committed.splitlines())
        cache[relative] = (digest, line_count)
    if line > line_count:
        raise TelemetryIncomplete("SOURCE_LINE_RANGE")
    return digest


def _rows(path: Path, scan: gate.Scan) -> list[dict]:
    # load_scan already validated the complete SARIF, including duplicate keys.
    data = json.loads(path.read_bytes(), object_pairs_hook=gate._object_no_duplicates,
                      parse_constant=gate._reject_non_json_constant)
    results = data["runs"][0]["results"]
    if len(results) != len(scan.alerts):
        raise TelemetryIncomplete("SARIF_ROW_COUNT")
    rows = []
    for result, (identity, severity) in zip(results, scan.alerts):
        rule_id, relative, primary_hash, message_hash = identity
        region = result["locations"][0]["physicalLocation"].get("region")
        if not isinstance(region, dict) or type(region.get("startLine")) is not int:
            raise TelemetryIncomplete("SARIF_REGION")
        line = region["startLine"]
        if not 0 < line <= 2147483647:
            raise TelemetryIncomplete("SARIF_REGION")
        rows.append({"key": identity, "severity": severity, "line": line,
                     "ruleId": rule_id, "path": relative,
                     "primaryLocationLineHashSha256": hashlib.sha256(
                         primary_hash.encode("utf-8")).hexdigest(),
                     "messageSha256": message_hash})
    return rows


def _delta(head: list[dict], base: list[dict], root: Path,
           expected: dict) -> list[dict]:
    previous = defaultdict(list)
    current = defaultdict(list)
    for row in base:
        previous[row["key"]].append(row["severity"])
    for row in head:
        current[row["key"]].append(row)
    pins = {}
    details = []
    for key, rows in current.items():
        now = sorted(rows, key=lambda row: (-gate.RANK[row["severity"]], row["line"]))
        old = sorted(previous.get(key, []), key=gate.RANK.__getitem__, reverse=True)
        for index, row in enumerate(now):
            severity = row["severity"]
            if index < len(old) and gate.RANK[severity] <= gate.RANK[old[index]]:
                continue
            if severity not in ("HIGH", "CRITICAL"):
                continue
            # Unpublished identities participate in the gate comparison only.
            # Every emitted rule ID must still pass the public-format check.
            if not SAFE_RULE_ID.fullmatch(row["ruleId"]):
                raise TelemetryIncomplete("SARIF_RULE_ID")
            pin = _source_pin(root, row["path"], row["line"], pins)
            details.append({"ruleId": row["ruleId"], "startLine": row["line"],
                            "severity": severity,
                            "primaryLocationLineHashSha256": row[
                                "primaryLocationLineHashSha256"],
                            "messageSha256": row["messageSha256"],
                            "sourceBlobSha256": pin})
    if len(details) != expected["blocked"]:
        raise TelemetryIncomplete("DELTA_COUNT")
    return sorted(details, key=lambda row: (
        row["startLine"], row["ruleId"], row["severity"],
        row["primaryLocationLineHashSha256"], row["messageSha256"]))


def augment(head_path: Path, base_path: Path, out: Path, root: Path) -> dict:
    with _diagnose("SOURCE_ROOT"):
        if head_path.resolve() == base_path.resolve():
            raise gate.InvalidScan("CodeQL head and baseline must use separate files")
        if Path(os.fsdecode(_git(root, "rev-parse", "--show-toplevel").strip())).resolve() != root:
            raise gate.InvalidScan("CodeQL source root is not the Git checkout")
    with _diagnose("SARIF_INPUT"):
        head_scan, base_scan = gate.load_scan(head_path), gate.load_scan(base_path)
        summary = gate.compare(head_scan, base_scan)
    with _diagnose("SUMMARY_READBACK"):
        persisted = json.loads(out.read_bytes(), object_pairs_hook=gate._object_no_duplicates,
                               parse_constant=gate._reject_non_json_constant)
    if persisted != summary:
        raise TelemetryIncomplete("SUMMARY_MISMATCH")
    with _diagnose("SARIF_ROWS"):
        head_rows, base_rows = _rows(head_path, head_scan), _rows(base_path, base_scan)
    with _diagnose("SOURCE_PIN"):
        details = _delta(head_rows, base_rows, root, summary)
    return {**summary, "newHighCriticalDelta": details}


def main() -> int:
    parser = argparse.ArgumentParser(description="Opt-in sanitized CodeQL alert telemetry")
    parser.add_argument("--head", required=True)
    parser.add_argument("--base", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--source-root", required=True)
    args = parser.parse_args()
    try:
        out = Path(args.out)
        with _diagnose("SOURCE_ROOT"):
            root = Path(args.source_root).resolve(strict=True)
        result = augment(Path(args.head), Path(args.base), out, root)
        # Atomic update: a failure never leaves a partial or unverified artifact.
        tmp = None
        try:
            with _diagnose("OUTPUT_WRITE"):
                with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8",
                                                 dir=out.parent, delete=False) as file:
                    tmp = Path(file.name)
                    file.write(json.dumps(result, sort_keys=True) + "\n")
                os.replace(tmp, out)
        finally:
            if tmp is not None:
                tmp.unlink(missing_ok=True)
        print(f"CodeQL sanitized telemetry: {len(result['newHighCriticalDelta'])} source-pinned alerts")
        return 0
    except (gate.InvalidScan, OSError, ValueError, RuntimeError, UnicodeError,
            TypeError, KeyError, IndexError) as error:
        category = error.category if isinstance(error, TelemetryIncomplete) else "UNCLASSIFIED"
        print(f"CodeQL sanitized telemetry INCOMPLETE (fail closed): CATEGORY={category}",
              file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
