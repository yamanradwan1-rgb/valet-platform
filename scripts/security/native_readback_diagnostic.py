"""Temporary native read-only diagnostic. Print safe metadata only; never raw SARIF."""
import base64
import hashlib
import json
import os
import re
import sys
from types import SimpleNamespace
import native_codeql_dispositions as native
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, build_opener, HTTPRedirectHandler, ProxyHandler

REPO = "/repos/yamanradwan1-rgb/valet-platform"
REF = "refs/pull/466/merge"
SHA = "49e797035fb0f12406fdf73186cf0cf43817d8aa"
KEY = ".github/workflows/security-ci.yml:sast-codeql"
IDS = (50, 51, 52, 53, 54, 55, 56, 57, 61)
MAX = 64 * 1024 * 1024
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None
def get(path, params=None, sarif=False):
    if not path.startswith(REPO + "/"):
        raise ValueError("unapproved path")
    req = Request("https://api.github.com" + path + ("?" + urlencode(params) if params else ""),
                  method="GET", headers={"Authorization": "Bearer " + os.environ["GITHUB_TOKEN"],
                  "Accept": "application/sarif+json" if sarif else "application/vnd.github+json",
                  "X-GitHub-Api-Version": "2022-11-28",
                  "User-Agent": "vaylet-native-readback"})
    with build_opener(ProxyHandler({}), NoRedirect).open(req, timeout=20) as r:
        if r.status != 200 or r.headers.get("Link"):
            raise ValueError("incomplete API response")
        raw = r.read(MAX + 1)
    if len(raw) > MAX:
        raise ValueError("oversize response")
    return json.loads(raw)
def sha(value):
    return hashlib.sha256(value.encode()).hexdigest() if isinstance(value, str) else None
def emit(label, data):
    print(label + " " + json.dumps(data, sort_keys=True, ensure_ascii=True), flush=True)
def complete(a, upload_state, current, enriched):
    runs = enriched.get("runs", [])
    return (a.get("error") == "" and a.get("warning", "") == ""
            and a.get("tool", {}).get("version") == "2.27.6"
            and a.get("category") in ("/language:javascript-typescript", "/language:javascript-typescript/")
            and a.get("results_count") == 61
            and upload_state.get("processing_status") == "complete"
            and len(current) == 1 and current[0] == a
            and enriched.get("version") == "2.1.0"
            and len(runs) == 1 and len(runs[0].get("results", [])) == 61)

def alert_identity(alert, n, r):
    return (type(alert.get("number")) is int and alert["number"] == n
            and alert.get("rule", {}).get("id") == r["rule"]
            and alert.get("rule", {}).get("security_severity_level") == "high"
            and alert.get("tool", {}).get("name") == "CodeQL"
            and all(k in alert and alert[k] is None for k in
                    ("dismissed_by", "dismissed_reason", "dismissed_at", "dismissed_comment")))

def instance_identity(instance, r):
    message = instance.get("message")
    return (instance.get("state") == "open"
            and instance.get("location", {}).get("path") == r["path"]
            and instance.get("location", {}).get("start_line") == r["line"]
            and isinstance(message, dict)
            and isinstance(message.get("text"), str) and bool(message["text"].strip()))

def source_pins(refs, pr):
    head = pr["head"]["sha"]
    base = pr["base"]["sha"]
    merge = get(REPO + "/git/commits/" + SHA)
    candidate = get(REPO + "/git/commits/" + head)
    baseline = get(REPO + "/git/commits/" + base)
    tree = merge["tree"]["sha"]
    if not (merge["sha"] == SHA and candidate["sha"] == head and baseline["sha"] == base
            and [p["sha"] for p in merge["parents"]] == [base, head]
            and tree == candidate["tree"]["sha"]):
        raise ValueError("scanned tree mismatch")
    listing = get(REPO + "/git/trees/" + tree, {"recursive":"1"})
    if listing["sha"] != tree or listing["truncated"] is not False:
        raise ValueError("incomplete tree")
    verified = {}
    for n,r in refs.items():
        rows = [x for x in listing["tree"] if x["path"] == r["path"]]
        if len(rows) != 1 or rows[0]["mode"] != "100644" or rows[0]["type"] != "blob" or rows[0]["sha"] != r["git_blob"]:
            raise ValueError("source blob identity")
        oid = r["git_blob"]
        if oid not in verified:
            blob = get(REPO + "/git/blobs/" + oid)
            raw = base64.b64decode("".join(blob["content"].split()), validate=True)
            if blob["sha"] != oid or blob["encoding"] != "base64" or blob["size"] != len(raw):
                raise ValueError("source bytes unavailable")
            verified[oid] = (hashlib.sha256(raw).hexdigest(), len(raw.splitlines()))
        if verified[oid][0] != r["source_sha256"] or verified[oid][1] < r["line"]:
            raise ValueError("source bytes mismatch")
    emit("SOURCE_PINS", {"exact_rows":len(refs),"unique_blobs":len(verified),"scanned_tree":tree,"base_tree":baseline["tree"]["sha"]})
    return True

def main():
    cat = json.loads(Path(__file__).with_name("native_disposition_reference.json").read_bytes())
    refs = {int(r["id"][3:]): r for r in cat}
    if set(refs) != set(IDS):
        raise ValueError("reference scope")
    pr = get(REPO + "/pulls/466")
    if (pr.get("merge_commit_sha") != SHA or
        pr.get("head", {}).get("sha") != "2bc6c983762457454d1bc055b3f4630731fc4058" or
        pr.get("base", {}).get("sha") != "bfb4fdccf9d557c371313c9e357faa52e0a71014"):
        raise ValueError("PR scope changed")
    source_ok = source_pins(refs, pr)
    analyses = get(REPO + "/code-scanning/analyses", {"ref": REF, "per_page": 100})
    matches = [a for a in analyses if a.get("commit_sha")==SHA and a.get("ref")==REF and
               a.get("analysis_key")==KEY and a.get("tool",{}).get("name")=="CodeQL"]
    emit("ANALYSIS_MATCH_COUNT", len(matches))
    if len(matches) != 1:
        raise ValueError("historical analysis ambiguous")
    a = matches[0]
    aid = a["id"]
    upload = a["sarif_id"]
    if type(aid) is not int or not isinstance(upload,str) or not re.fullmatch(r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}",upload):
        raise ValueError("invalid upload identity")
    category = a.get("category")
    safe_category = category if category in ("/language:javascript-typescript","/language:javascript-typescript/") else "OTHER"
    emit("ANALYSIS", {"id":aid,"sarif_id":upload,"category":safe_category,"created_at":a.get("created_at"),
        "tool_version":a.get("tool",{}).get("version"),"results_count":a.get("results_count"),
        "error_empty":a.get("error")=="","warning_empty":a.get("warning","")=="",
        "exact_ref_commit_key":True})
    upload_state = get(REPO + "/code-scanning/sarifs/" + upload)
    emit("UPLOAD_COMPLETE", upload_state.get("processing_status")=="complete")
    current = get(REPO + "/code-scanning/analyses", {"ref":REF,"sarif_id":upload,"per_page":100})
    emit("UPLOAD_ANALYSIS_MATCH",len(current)==1 and current[0].get("id")==aid)
    enriched = get(REPO + "/code-scanning/analyses/" + str(aid), sarif=True)
    runs = enriched.get("runs",[])
    if len(runs)!=1:
        raise ValueError("unexpected SARIF runs")
    results = runs[0].get("results",[])
    emit("ENRICHED_RESULT_COUNT",len(results))
    allgood = source_ok and complete(a, upload_state, current, enriched)
    emit("MANDATORY_ANALYSIS_EVIDENCE", allgood)
    for n in IDS:
        r = refs[n]
        matches = [x for x in results if str(x.get("properties",{}).get("github/alertNumber"))==str(n)]
        info = {"number":n,"enriched_matches":len(matches)}
        if len(matches)==1:
            x=matches[0]
            p=x.get("locations",[{}])[0].get("physicalLocation",{})
            loc=p.get("artifactLocation",{})
            region=p.get("region",{})
            fp=x.get("partialFingerprints",{}).get("primaryLocationLineHash")
            msg=x.get("message",{}).get("text")
            info.update({"rule_match":x.get("ruleId")==r["rule"],"path_match":loc.get("uri")==r["path"],
                "line_match":region.get("startLine")==r["line"],"fp_present":isinstance(fp,str),
                "fp_match":sha(fp)==r["fingerprint_sha256"],"message_present":isinstance(msg,str),
                "message_match":sha(msg)==r["message_sha256"],"alert_number_integer":type(x.get("properties",{}).get("github/alertNumber")) is int})
        alert = get(REPO + "/code-scanning/alerts/" + str(n))
        info["alert_shape"] = {"number_match":alert.get("number")==n,
            "state":alert.get("state") if alert.get("state") in ("open","dismissed","fixed","closed","auto_dismissed","not_applicable") else "OTHER",
            "rule_match":alert.get("rule",{}).get("id")==r["rule"],
            "security_severity":alert.get("rule",{}).get("security_severity_level") if alert.get("rule",{}).get("security_severity_level") in ("critical","high","medium","low",None) else "OTHER",
            "rule_severity":alert.get("rule",{}).get("severity") if alert.get("rule",{}).get("severity") in ("error","warning","note",None) else "OTHER",
            "rule_keys":sorted(k for k in alert.get("rule",{}) if k in ("id","severity","security_severity_level","security_severity","name","description","tags")),
            "top_severity":alert.get("severity") if alert.get("severity") in ("critical","high","medium","low","error","warning","note",None) else "OTHER",
            "tool_match":alert.get("tool",{}).get("name")=="CodeQL",
            "dismissal_fields_present":all(k in alert for k in ("dismissed_by","dismissed_reason","dismissed_at","dismissed_comment")),
            "dismissal_fields_null":all(k in alert and alert[k] is None for k in ("dismissed_by","dismissed_reason","dismissed_at","dismissed_comment")),
            "state_is_null":alert.get("state") is None,"state_present":"state" in alert}
        info["alert_identity_no_dismissal"] = alert_identity(alert,n,r)
        instances = get(REPO + "/code-scanning/alerts/" + str(n) + "/instances",{"ref":REF,"per_page":100})
        exact = [i for i in instances if i.get("ref")==REF and i.get("commit_sha")==SHA and i.get("analysis_key")==KEY and i.get("category")==category]
        info["instance_exact_count"]=len(exact)
        if len(exact)==1:
            i=exact[0]
            msg=i.get("message")
            m=msg.get("text") if isinstance(msg,dict) else msg
            em=x.get("message",{}).get("text") if len(matches)==1 else None
            info["message_shape"]={"type":type(msg).__name__,"has_text":isinstance(msg,dict) and "text" in msg,
                "has_markdown":isinstance(msg,dict) and "markdown" in msg,
                "text_match":sha(m)==r["message_sha256"],
                "trim_match":isinstance(m,str) and sha(m.strip())==r["message_sha256"],
                "newline_match":isinstance(m,str) and sha(m.replace("\r\n","\n"))==r["message_sha256"],
                "markdown_match":isinstance(msg,dict) and sha(msg.get("markdown"))==r["message_sha256"],
                "enriched_plain_matches":isinstance(m,str) and isinstance(em,str) and m==em}
            info["instance_identity"] = instance_identity(i,r)
            info.update({"instance_open":i.get("state")=="open","instance_path_match":i.get("location",{}).get("path")==r["path"],"instance_line_match":i.get("location",{}).get("start_line")==r["line"],"instance_message_match":sha(i.get("message",{}).get("text"))==r["message_sha256"]})
        emit("ALERT",info)
        required=("rule_match","path_match","line_match","fp_match","message_match","alert_number_integer","alert_identity_no_dismissal","instance_identity","instance_open","instance_path_match","instance_line_match")
        allgood = allgood and len(matches)==1 and len(exact)==1 and all(info.get(k) is True for k in required)
    # Exercise the exact candidate production API adapter (read-only), with
    # authenticated historical head analysis count. Not raw base evaluation.
    # Count representation differences without exposing any result contents.
    from collections import Counter
    keys, numbers, issues = Counter(), Counter(), Counter()
    for result in results:
        try:
            path = native.gate._location(result)
        except (ValueError, KeyError, TypeError):
            issues["location"] += 1
            continue
        try:
            line = result["locations"][0]["physicalLocation"]["region"]["startLine"]
            fp = result["partialFingerprints"]["primaryLocationLineHash"]
            msg = result["message"]["text"]
            number = result["properties"]["github/alertNumber"]
            if type(line) is not int or line <= 0 or type(number) is not int or number <= 0:
                issues["line_or_number"] += 1
                continue
            key = (result["ruleId"],path,line,sha(fp),sha(msg))
            keys[key]+=1
            numbers[number]+=1
        except (KeyError, IndexError, TypeError, AttributeError):
            issues["identity_field"] += 1
    emit("ADAPTER_SHAPE",{"valid_rows":sum(keys.values()),"unique_keys":len(keys),
         "unique_numbers":len(numbers),"duplicate_keys":sum(v>1 for v in keys.values()),
         "duplicate_numbers":sum(v>1 for v in numbers.values()),"issues":dict(issues),
         "eligible_keys_exact":all(keys[(r["rule"],r["path"],r["line"],r["fingerprint_sha256"],r["message_sha256"])]==1 and numbers[n]==1 for n,r in refs.items())})
    class TraceRead(native.GitHubRead):
        def get(self,path,query=None,sarif=False):
            label="upload" if "/sarifs/" in path else "enriched" if sarif else "analyses"
            try:
                data=super().get(path,query,sarif)
            except native.gate.InvalidScan:
                emit("ADAPTER_GET_FAILED",label)
                raise
            emit("ADAPTER_GET_OK",label)
            return data
    adapter = native._native_mapping(TraceRead(os.environ["GITHUB_TOKEN"]),
                    upload, SHA, SimpleNamespace(version="2.27.6", alerts=(None,)*61),
                    KEY, category)
    adapter_ok = len(adapter)==61 and all(adapter.get((r["rule"],r["path"],r["line"],
                       r["fingerprint_sha256"],r["message_sha256"]))==n for n,r in refs.items())
    emit("EXACT_CANDIDATE_ADAPTER",{"all_61":len(adapter)==61,"exact_nine":adapter_ok})
    allgood = allgood and adapter_ok
    emit("EXACT_NINE_MAPPING",allgood)
    # A diagnostic success does not authorize or unblock anything.
    return 0 if allgood else 2
if __name__ == "__main__":
    try:
        sys.exit(main())
    except HTTPError as e:
        print("READBACK_HTTP_STATUS",e.code,flush=True)
        sys.exit(2)
    except (URLError, OSError, ValueError, KeyError, IndexError, TypeError, AttributeError):
        print("READBACK_INCOMPLETE",flush=True)
        sys.exit(2)
