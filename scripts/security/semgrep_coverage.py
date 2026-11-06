"""Identify empty incremental Semgrep scans without weakening fail-closed checks."""

import json
import re
import sys
from pathlib import Path


_REPO_ROOT = Path(__file__).resolve().parents[2]
_SCANNED_ROOTS = frozenset({"apps", "packages", "scripts", "infra"})
_MAX_DIAGNOSTIC_ERRORS = 3
_MAX_PATH_CHARS = 160
_SAFE_SEGMENT = re.compile(r"[A-Za-z0-9_.-]+\Z", re.ASCII)
_ERROR_TYPES = {
    "parse error": "parse_error",
    "lexical error": "lexical_error",
    "partial parsing": "partial_parsing",
    "syntax error": "syntax_error",
    "semgreperror": "semgrep_error",
    "semgrep warning": "semgrep_warning",
    "invalid rule": "invalid_rule",
    "invalid configuration": "invalid_configuration",
    "scan error": "scan_error",
    "timeout": "timeout",
    "timeout error": "timeout",
    "out of memory": "out_of_memory",
    "too many matches": "too_many_matches",
    "internal error": "internal_error",
}
_ERROR_LEVELS = {
    "error": "error",
    "warning": "warning",
    "warn": "warning",
    "info": "info",
    "fatal": "fatal",
}


def _safe_repo_path(raw: object) -> str | None:
    """Allow only real files below the scanner's known repository roots."""
    if not isinstance(raw, str) or not raw or len(raw) > _MAX_PATH_CHARS:
        return None
    if "\\" in raw or any(ord(char) < 32 or ord(char) > 126 for char in raw):
        return None
    path = Path(raw)
    if path.is_absolute():
        try:
            path = path.relative_to(_REPO_ROOT)
        except ValueError:
            return None
    if (
        not path.parts
        or path.parts[0] not in _SCANNED_ROOTS
        or any(part in {".", ".."} or not _SAFE_SEGMENT.fullmatch(part) for part in path.parts)
    ):
        return None
    try:
        resolved = (_REPO_ROOT / path).resolve()
        is_scanned_file = resolved.is_relative_to(_REPO_ROOT) and resolved.is_file()
    except (OSError, RuntimeError, ValueError):
        return None
    if not is_scanned_file:
        return None
    return path.as_posix()


def _safe_line(raw: object) -> int | None:
    return raw if type(raw) is int and 1 <= raw <= 1_000_000 else None


def _error_location(error: dict) -> tuple[str | None, int | None]:
    spans = error.get("spans")
    first_span = spans[0] if isinstance(spans, list) and spans else None
    span = first_span if isinstance(first_span, dict) else {}
    path = _safe_repo_path(error.get("path")) or _safe_repo_path(span.get("file"))
    start = span.get("start")
    if not isinstance(start, dict):
        start = error.get("start")
    if not isinstance(start, dict):
        start = {}
    return path, _safe_line(start.get("line")) or _safe_line(error.get("line"))


def _safe_error_summary(errors: list) -> str:
    """Never forward scanner messages, snippets, arbitrary fields or paths."""
    parts = []
    for entry in errors[:_MAX_DIAGNOSTIC_ERRORS]:
        if not isinstance(entry, dict):
            parts.append("type=unstructured")
            continue
        raw_type = entry.get("type")
        error_type = (
            _ERROR_TYPES.get(raw_type.casefold(), "unrecognized")
            if isinstance(raw_type, str) and len(raw_type) <= 64
            else "unrecognized"
        )
        fields = [f"type={error_type}"]
        code = entry.get("code")
        if type(code) is int and 0 <= code <= 255:
            fields.append(f"code={code}")
        level = entry.get("level")
        if isinstance(level, str) and len(level) <= 32:
            fields.append(f"level={_ERROR_LEVELS.get(level.casefold(), 'unrecognized')}")
        path, line = _error_location(entry)
        if path:
            fields.append(f"path={path}")
            if line is not None:
                fields.append(f"line={line}")
        parts.append(",".join(fields))
    return f"error_count={len(errors)}; first={len(parts)}; " + "; ".join(parts)


def classify_coverage(report_path: str | Path) -> str:
    data = json.loads(Path(report_path).read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("results"), list):
        raise ValueError("Invalid Semgrep report")
    if not isinstance(data.get("errors"), list):
        raise ValueError("Semgrep reported errors or omitted error metadata")
    if data["errors"]:
        raise ValueError(
            "Semgrep reported errors or omitted error metadata; "
            + _safe_error_summary(data["errors"])
        )
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
