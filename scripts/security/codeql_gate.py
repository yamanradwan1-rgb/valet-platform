#!/usr/bin/env python3
"""Local, fail-closed CodeQL SARIF 2.1.0 head/base security delta gate.

Both SARIFs must be produced independently with the SAME CodeQL CLI, query
suite and repository-relative source paths. GitHub UI alerts are not a gate.
Never emit SARIF messages, source snippets, rule text or raw fingerprints.
"""

import argparse
from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
import hashlib
import json
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit


MAX_BYTES = 64 * 1024 * 1024
RANK = {"LOW": 0, "MEDIUM": 1, "HIGH": 2, "CRITICAL": 3}


class InvalidScan(ValueError):
    """Invalid, incomplete or incomparable CodeQL scan (safe static messages)."""


@dataclass(frozen=True)
class Scan:
    version: str
    category: str
    tool_name: str
    alerts: tuple[tuple[tuple[str, str, str, str], str], ...]
    notifications: tuple[int, ...] = (0,) * 10


def _object_no_duplicates(pairs: list) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise InvalidScan("duplicate JSON object key")
        result[key] = value
    return result


def _reject_non_json_constant(_value: str) -> None:
    raise InvalidScan("CodeQL SARIF contains a non-JSON numeric value")


def _mapping(value: object, context: str) -> dict:
    if not isinstance(value, dict):
        raise InvalidScan(f"invalid {context} structure")
    return value


def _string(value: object, context: str) -> str:
    if not isinstance(value, str) or not value or len(value) > 2048:
        raise InvalidScan(f"missing or invalid {context}")
    return value


def _rules(run: dict) -> dict[str, dict]:
    tool = _mapping(run.get("tool"), "SARIF tool")
    driver = _mapping(tool.get("driver"), "CodeQL driver")
    if driver.get("name") not in ("CodeQL", "CodeQL command-line toolchain"):
        raise InvalidScan("SARIF was not produced by the CodeQL CLI")
    components = [driver]
    extensions = tool.get("extensions", [])
    if not isinstance(extensions, list):
        raise InvalidScan("invalid CodeQL extensions")
    components.extend(_mapping(item, "CodeQL extension") for item in extensions)
    by_id = {}
    for component in components:
        descriptors = component.get("rules", [])
        if not isinstance(descriptors, list):
            raise InvalidScan("invalid CodeQL rules")
        for item in descriptors:
            rule = _mapping(item, "CodeQL rule")
            rule_id = _string(rule.get("id"), "CodeQL rule ID")
            if rule_id in by_id and by_id[rule_id] != rule:
                raise InvalidScan("conflicting CodeQL rule descriptors")
            by_id[rule_id] = rule
    if not by_id:
        raise InvalidScan("CodeQL reports no evaluated rules")
    return by_id


def _severity(rule: dict) -> str:
    props = _mapping(rule.get("properties"), "rule properties")
    score = props.get("security-severity")
    if isinstance(score, bool) or not isinstance(score, (str, int, float)):
        raise InvalidScan("CodeQL finding has no verified security severity")
    try:
        number = Decimal(str(score))
    except InvalidOperation:
        raise InvalidScan("CodeQL finding has invalid security severity") from None
    if not number.is_finite() or not Decimal("0") < number <= Decimal("10"):
        raise InvalidScan("CodeQL finding has invalid security severity")
    if number > 9:
        return "CRITICAL"
    if number >= 7:
        return "HIGH"
    if number >= 4:
        return "MEDIUM"
    return "LOW"


def _location(result: dict) -> str:
    locations = result.get("locations")
    if not isinstance(locations, list) or not locations:
        raise InvalidScan("CodeQL finding lacks a primary location")
    primary = _mapping(locations[0], "finding location")
    physical = _mapping(primary.get("physicalLocation"), "physical location")
    artifact = _mapping(physical.get("artifactLocation"), "artifact location")
    base_id = artifact.get("uriBaseId")
    if base_id not in (None, "%SRCROOT%"):
        raise InvalidScan("CodeQL source root is not repository-relative")
    uri = _string(artifact.get("uri"), "CodeQL artifact URI")
    try:
        parsed = urlsplit(uri)
    except ValueError:
        raise InvalidScan("CodeQL primary location has an invalid URI") from None
    path = unquote(parsed.path)
    if (parsed.scheme or parsed.netloc or parsed.query or parsed.fragment
            or path.startswith("/") or "\\" in path or ":" in path
            or any(part in ("", ".", "..") for part in path.split("/"))
            or any(ord(char) < 32 for char in path)):
        raise InvalidScan("CodeQL primary location is not repository-relative")
    return path


def _check_invocations(run: dict) -> tuple[int, ...]:
    invocations = run.get("invocations", [])
    if not isinstance(invocations, list) or not invocations:
        raise InvalidScan("missing or invalid CodeQL invocations")
    counts = [0] * 10  # execution/configuration x note/none/warning/error/unknown
    for value in invocations:
        invocation = _mapping(value, "CodeQL invocation")
        if invocation.get("executionSuccessful") is not True:
            raise InvalidScan("CodeQL scan did not confirm successful execution")
        for index, kind in enumerate(("toolExecutionNotifications", "toolConfigurationNotifications")):
            notices = invocation.get(kind, [])
            if not isinstance(notices, list):
                raise InvalidScan("invalid CodeQL scan notifications")
            for entry in notices:
                notice = _mapping(entry, "CodeQL scan notification")
                level = notice.get("level", "warning")
                levels = {"note": 0, "none": 1, "warning": 2, "error": 3}
                level_index = levels.get(level, 4) if isinstance(level, str) else 4
                counts[5 * index + level_index] += 1
    return tuple(counts)


def _notice_summary(counts: tuple[int, ...]) -> str:
    names = ("exec_note", "exec_none", "exec_warning", "exec_error", "exec_unknown",
             "config_note", "config_none", "config_warning", "config_error", "config_unknown")
    return ",".join(f"{name}={count}" for name, count in zip(names, counts))


def load_scan(path: str | Path) -> Scan:
    try:
        source = Path(path)
        if not source.is_file() or source.stat().st_size > MAX_BYTES:
            raise InvalidScan("missing, empty or oversized CodeQL SARIF")
        raw = source.read_bytes()
        if not raw:
            raise InvalidScan("missing, empty or oversized CodeQL SARIF")
        data = json.loads(raw, object_pairs_hook=_object_no_duplicates,
                          parse_constant=_reject_non_json_constant)
    except InvalidScan:
        raise
    except (OSError, UnicodeError, ValueError, RecursionError, OverflowError):
        raise InvalidScan("unreadable or malformed CodeQL SARIF") from None
    log = _mapping(data, "SARIF log")
    if log.get("version") != "2.1.0":
        raise InvalidScan("unsupported CodeQL SARIF version")
    runs = log.get("runs")
    if not isinstance(runs, list) or len(runs) != 1:
        raise InvalidScan("expected exactly one CodeQL language run")
    run = _mapping(runs[0], "SARIF run")
    notifications = _check_invocations(run)
    properties = _mapping(run.get("properties"), "CodeQL SARIF properties")
    if properties.get("semmle.formatSpecifier") != "sarifv2.1.0":
        raise InvalidScan("CodeQL SARIF must use pinned sarifv2.1.0 format")
    tool = _mapping(run.get("tool"), "SARIF tool")
    driver = _mapping(tool.get("driver"), "CodeQL driver")
    # SARIF toolComponent permits either field; CodeQL SARIF samples use
    # semanticVersion alone. Require a concrete CodeQL X.Y.Z release in both.
    versions = [driver[key] for key in ("semanticVersion", "version") if key in driver]
    if (not versions or any(not isinstance(value, str) or
            not re.fullmatch(r"(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)", value)
            for value in versions) or len(set(versions)) != 1):
        raise InvalidScan("missing, malformed or conflicting CodeQL tool version")
    version = versions[0]
    automation = run.get("automationDetails", {})
    category = _string(_mapping(automation, "analysis category").get("id"),
                       "CodeQL analysis category")
    rules = _rules(run)
    findings = run.get("results")
    if not isinstance(findings, list):
        raise InvalidScan("CodeQL results are missing")
    alerts = []
    for value in findings:
        result = _mapping(value, "CodeQL result")
        if result.get("kind", "fail") not in ("fail", "review"):
            raise InvalidScan("unsupported CodeQL finding kind")
        rule_id = _string(result.get("ruleId"), "finding rule ID")
        if rule_id not in rules:
            raise InvalidScan("CodeQL finding references an unknown rule")
        rule_reference = result.get("rule", {})
        if not isinstance(rule_reference, dict):
            raise InvalidScan("invalid CodeQL result rule reference")
        if rule_reference.get("id", rule_id) != rule_id:
            raise InvalidScan("CodeQL result rule references disagree")
        rule_index = result.get("ruleIndex", rule_reference.get("index"))
        if rule_index is not None:
            if type(rule_index) is not int or rule_index < 0:
                raise InvalidScan("invalid CodeQL finding rule index")
            if rule_reference.get("index", rule_index) != rule_index:
                raise InvalidScan("CodeQL result rule indices disagree")
            tool_component = rule_reference.get("toolComponent", {})
            if not isinstance(tool_component, dict):
                raise InvalidScan("invalid CodeQL result tool reference")
            component_index = tool_component.get("index")
            if component_index is not None:
                extensions = tool.get("extensions", [])
                if type(component_index) is not int or not 0 <= component_index < len(extensions):
                    raise InvalidScan("invalid CodeQL result tool component")
                component = extensions[component_index]
            else:
                component = driver
            descriptors = _mapping(component, "rule component").get("rules", [])
            if not isinstance(descriptors, list) or rule_index >= len(descriptors):
                raise InvalidScan("CodeQL finding rule index is out of range")
            indexed = _mapping(descriptors[rule_index], "indexed rule")
            if indexed.get("id") != rule_id:
                raise InvalidScan("CodeQL finding rule index does not match its rule ID")
        partial = _mapping(result.get("partialFingerprints"), "finding fingerprints")
        fp = _string(partial.get("primaryLocationLineHash"), "CodeQL location hash")
        message = _mapping(result.get("message"), "finding message")
        detail = _string(message.get("text"), "CodeQL finding message")
        key = (rule_id, _location(result), fp,
               hashlib.sha256(detail.encode("utf-8")).hexdigest())
        alerts.append((key, _severity(rules[rule_id])))
    return Scan(version, category, driver["name"], tuple(alerts), notifications)


def compare(head: Scan, base: Scan) -> dict:
    # SARIF may list available-but-unexecuted rule descriptors. The workflow
    # runs one fixed QLS/CLI; descriptor sets do not prove query provenance.
    if (head.version != base.version or head.category != base.category
            or head.tool_name != base.tool_name):
        raise InvalidScan("CodeQL head/base tool version, identity or category differs")
    if any(head.notifications[i] or base.notifications[i] for i in (2, 3, 4, 7, 8, 9)):
        raise InvalidScan("CodeQL scan reported an error or warning; "
                          f"head={_notice_summary(head.notifications)}; "
                          f"base={_notice_summary(base.notifications)}")
    grouped_head = defaultdict(list)
    grouped_base = defaultdict(list)
    for key, severity in head.alerts:
        grouped_head[key].append(severity)
    for key, severity in base.alerts:
        grouped_base[key].append(severity)
    new, blocked = 0, 0
    for key, severities in grouped_head.items():
        latest = sorted(severities, key=RANK.__getitem__, reverse=True)
        previous = sorted(grouped_base.get(key, []), key=RANK.__getitem__, reverse=True)
        for index, severity in enumerate(latest):
            if index >= len(previous) or RANK[severity] > RANK[previous[index]]:
                new += 1
                blocked += int(severity in ("HIGH", "CRITICAL"))
    return {"scanner": "codeql", "total": len(head.alerts),
            "existing": len(head.alerts) - new, "new": new, "blocked": blocked}


def main() -> int:
    parser = argparse.ArgumentParser(description="CodeQL SARIF head/base security delta gate")
    parser.add_argument("--head", required=True)
    parser.add_argument("--base", required=True)
    parser.add_argument("--out", default="security-reports/codeql-sanitized.json")
    args = parser.parse_args()
    try:
        if Path(args.head).resolve() == Path(args.base).resolve():
            raise InvalidScan("CodeQL head and baseline must use separate files")
        summary = compare(load_scan(args.head), load_scan(args.base))
        report = Path(args.out)
        report.parent.mkdir(parents=True, exist_ok=True)
        report.write_text(json.dumps(summary, sort_keys=True) + "\n", encoding="utf-8")
        print("CodeQL: total={total} existing={existing} new={new} blocked={blocked}".format(**summary))
        return 1 if summary["blocked"] else 0
    except (InvalidScan, OSError, RuntimeError) as error:
        # Never print file paths, snippets, fingerprints, messages or JSON exceptions.
        label = str(error) if isinstance(error, InvalidScan) else "CodeQL report I/O failed"
        print(f"CodeQL INCOMPLETE (fail closed): {label}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
