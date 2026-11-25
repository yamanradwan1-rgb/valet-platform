"""Inactive prototype: reconcile raw CodeQL delta with individual GitHub alerts.

No API mutations, workflow integration, signing infrastructure or new dependencies.
GitHub-native state is the decision source, not this historical identity catalog.
The protected GitHub workflow/credential boundary must be established before use.
"""
from datetime import datetime, timedelta, timezone
import hashlib
import http.client
import json
from pathlib import Path
import re
import ssl
from urllib.parse import urlencode

import codeql_gate as gate
import codeql_delta_telemetry as telemetry

REPO = "yamanradwan1-rgb/valet-platform"
REPO_ID = 1327249029
OWNER_ID = 295649470
PR = 466
REF = "refs/pull/466/merge"
IDS = {50, 51, 52, 53, 54, 55, 56, 57, 61}
API = "/repos/" + REPO
SHA = re.compile(r"[0-9a-f]{40}\Z")
UPLOAD = re.compile(r"[0-9a-fA-F-]{36}\Z")


def require(ok):
    if not ok:
        raise gate.InvalidScan("native CodeQL disposition evidence incomplete")


def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def parse(raw):
    require(type(raw) is bytes and 0 < len(raw) <= gate.MAX_BYTES)
    try:
        return json.loads(raw, object_pairs_hook=gate._object_no_duplicates,
                          parse_constant=gate._reject_non_json_constant)
    except (ValueError, UnicodeError, RecursionError):
        raise gate.InvalidScan("invalid native CodeQL evidence") from None


class GitHubRead:
    """GET only; no redirects, proxies, raw payload logging or token persistence."""
    def __init__(self, token):
        require(isinstance(token, str) and 0 < len(token) <= 16384
                and token.isascii() and not any(c.isspace() for c in token))
        self.token = token

    def get(self, path, query=None, sarif=False):
        require(path.startswith(API) and "?" not in path)
        if query:
            path += "?" + urlencode(query)
        connection = http.client.HTTPSConnection(
            "api.github.com", timeout=20, context=ssl.create_default_context())
        try:
            connection.request("GET", path, headers={
                "Authorization": "Bearer " + self.token,
                "Accept": "application/sarif+json" if sarif else "application/vnd.github+json",
                "User-Agent": "vaylet-native-codeql-readback",
                "X-GitHub-Api-Version": "2022-11-28",
            })
            response = connection.getresponse()
            # This narrowly scoped proof never needs more than one page.
            require(response.status == 200 and not response.getheader("Link"))
            return parse(response.read(gate.MAX_BYTES + 1))
        except (OSError, http.client.HTTPException):
            raise gate.InvalidScan("native CodeQL readback unavailable") from None
        finally:
            connection.close()


def _identity(row):
    return (row["ruleId"], row["path"], row["line"], row["severity"],
            row["primaryLocationLineHashSha256"], row["messageSha256"])


def _catalog():
    path = Path(__file__).with_name("native_disposition_reference.json")
    rows = parse(path.read_bytes())
    require(type(rows) is list and len(rows) == 9)
    indexed = {}
    for row in rows:
        number = int(row["id"].removeprefix("FP-"))
        key = (row["rule"], row["path"], row["line"], row["severity"],
               row["fingerprint_sha256"], row["message_sha256"])
        require(number in IDS and key not in indexed and row["severity"] == "HIGH")
        indexed[key] = (number, row)
    require({n for n, _ in indexed.values()} == IDS)
    return indexed


def _blocked(head, base, summary):
    previous = {}
    current = {}
    for row in base:
        previous.setdefault(row["key"], []).append(row["severity"])
    for row in head:
        current.setdefault(row["key"], []).append(row)
    delta = []
    for key, rows in current.items():
        now = sorted(rows, key=lambda x: -gate.RANK[x["severity"]])
        old = sorted(previous.get(key, []), key=gate.RANK.__getitem__, reverse=True)
        for i, row in enumerate(now):
            if (i >= len(old) or gate.RANK[row["severity"]] > gate.RANK[old[i]]) \
                    and row["severity"] in ("HIGH", "CRITICAL"):
                # Never allocate one disposition across duplicated raw occurrences.
                require(len(now) == 1 and len(old) <= 1)
                delta.append(row)
    require(len(delta) == summary["blocked"])
    return delta


def _scope(api, root, scanned, base):
    require(SHA.fullmatch(scanned) and SHA.fullmatch(base))
    require(telemetry._git(root, "rev-parse", "HEAD").decode().strip() == scanned)
    repo = api.get(API)
    require(repo["id"] == REPO_ID and repo["full_name"] == REPO
            and repo["owner"]["id"] == OWNER_ID and repo["default_branch"] == "main")
    pr = api.get(API + "/pulls/466")
    require(pr["number"] == PR and pr["state"] == "open"
            and pr["base"]["ref"] == "main" and pr["base"]["sha"] == base
            and pr["base"]["repo"]["id"] == REPO_ID
            and pr["head"]["repo"]["id"] == REPO_ID
            and pr["merge_commit_sha"] == scanned
            and SHA.fullmatch(pr["head"]["sha"]))
    parents = telemetry._git(root, "show", "-s", "--format=%P", scanned).decode().split()
    require(parents == [base, pr["head"]["sha"]])


def _native_mapping(api, upload, scanned, scan, analysis_key, category):
    require(UPLOAD.fullmatch(upload))
    upload_state = api.get(API + "/code-scanning/sarifs/" + upload)
    require(upload_state["processing_status"] == "complete")
    records = api.get(API + "/code-scanning/analyses",
                      {"sarif_id": upload, "ref": REF, "per_page": 100})
    require(type(records) is list and len(records) == 1)
    analysis = records[0]
    require(type(analysis["id"]) is int and analysis["id"] > 0
            and analysis["sarif_id"] == upload and analysis["ref"] == REF
            and analysis["commit_sha"] == scanned
            and analysis["analysis_key"] == analysis_key
            and analysis["category"] == category
            and analysis["tool"]["name"] == "CodeQL"
            and analysis["tool"]["version"] == scan.version
            and analysis["error"] == "" and analysis["warning"] == ""
            and analysis["results_count"] == len(scan.alerts))
    # GitHub returns a subset of uploaded SARIF plus alertNumber; it is used
    # solely to correlate identities, never as a replacement for raw scans.
    enriched = api.get(API + "/code-scanning/analyses/" + str(analysis["id"]), sarif=True)
    require(enriched["version"] == "2.1.0" and len(enriched["runs"]) == 1)
    results = enriched["runs"][0]["results"]
    require(type(results) is list)
    mapping = {}
    for row in results:
        key = (row["ruleId"], gate._location(row),
               row["locations"][0]["physicalLocation"]["region"]["startLine"],
               digest(row["partialFingerprints"]["primaryLocationLineHash"]),
               digest(row["message"]["text"]))
        number = row["properties"]["github/alertNumber"]
        require(type(key[2]) is int and key[2] > 0 and type(number) is int and number > 0
                and key not in mapping)
        mapping[key] = number
    require(len(set(mapping.values())) == len(mapping))
    return mapping


def evaluate(*, head_path, base_path, root, scanned, base, upload, api,
             analysis_key, category, now):
    """Candidate-only pure verdict with live GET readback; never alters alerts.

    Caller must bind paths to the actual head/base scanner output and GitHub
    event. Candidate-controlled Actions are NOT an independent trust root.
    All malformed/missing evidence raises; callers MUST fail the gate.
    """
    try:
        require(Path(head_path).resolve() != Path(base_path).resolve())
        head_scan, base_scan = gate.load_scan(head_path), gate.load_scan(base_path)
        summary = gate.compare(head_scan, base_scan)
        result = {"raw": summary, "native_false_positive": 0,
                  "remaining_blocked": summary["blocked"]}
        if not summary["blocked"]:
            return result
        delta = _blocked(telemetry._rows(head_path, head_scan),
                         telemetry._rows(base_path, base_scan), summary)
        catalog = _catalog()
        eligible = [(row, catalog[_identity(row)]) for row in delta if _identity(row) in catalog]
        if not eligible:
            return result
        require(now.tzinfo is timezone.utc and head_scan.version == "2.27.6"
                and head_scan.category in ("/language:javascript-typescript", "/language:javascript-typescript/")
                and analysis_key == ".github/workflows/security-ci.yml:sast-codeql"
                and category in ("/language:javascript-typescript", "/language:javascript-typescript/"))
        _scope(api, root, scanned, base)
        mapping = _native_mapping(api, upload, scanned, head_scan, analysis_key, category)
        for row, (number, reference) in eligible:
            require(telemetry._source_pin(root, row["path"], row["line"], {})
                    == reference["source_sha256"])
            entry = telemetry._git(root, "ls-tree", "-z", scanned, "--", row["path"])
            require(entry == ("100644 blob " + reference["git_blob"] + "\t" + row["path"] + "\0").encode())
            key = (row["ruleId"], row["path"], row["line"],
                   row["primaryLocationLineHashSha256"], row["messageSha256"])
            require(mapping.get(key) == number)
            alert_path = API + "/code-scanning/alerts/" + str(number)
            alert = api.get(alert_path, {"ref": REF})
            require(alert["number"] == number and alert["rule"]["id"] == row["ruleId"]
                    and alert["rule"]["security_severity_level"] == "high"
                    and alert["tool"]["name"] == "CodeQL")
            if alert["state"] != "dismissed":
                continue
            if alert["dismissed_reason"] != "false positive" or alert["dismissed_by"]["id"] != OWNER_ID:
                continue
            require(isinstance(alert["dismissed_comment"], str)
                    and bool(alert["dismissed_comment"].strip()))
            at = datetime.strptime(alert["dismissed_at"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
            if not timedelta(0) <= now - at < timedelta(days=30):
                continue
            instances = api.get(alert_path + "/instances", {"ref": REF, "per_page": 100})
            require(type(instances) is list)
            matching = [i for i in instances if i["ref"] == REF and i["commit_sha"] == scanned
                        and i["analysis_key"] == analysis_key and i["category"] == category]
            require(len(matching) == 1)
            instance = matching[0]
            require(instance["state"] == "dismissed"
                    and instance["location"]["path"] == row["path"]
                    and instance["location"]["start_line"] == row["line"]
                    and digest(instance["message"]["text"]) == row["messageSha256"])
            result["native_false_positive"] += 1
            result["remaining_blocked"] -= 1
        _scope(api, root, scanned, base)
        return result
    except gate.InvalidScan:
        raise
    except (KeyError, IndexError, TypeError, ValueError, AttributeError, OSError,
            RuntimeError, UnicodeError, RecursionError):
        raise gate.InvalidScan("native CodeQL disposition evidence incomplete") from None
