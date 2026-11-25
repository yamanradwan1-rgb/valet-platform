"""Synthetic native disposition contract; no live API credentials or mutations."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import codeql_gate as gate
import native_codeql_dispositions as native
from test_codeql_gate import report, finding

RULE = "js/insufficient-password-hash"
CATEGORY = "/language:javascript-typescript"
ANALYSIS = ".github/workflows/security-ci.yml:sast-codeql"
HEAD = "a"*40
BASE = "b"*40
PR_HEAD = "c"*40
UPLOAD = "01234567-1234-1234-1234-0123456789ab"
NOW = datetime(2026, 11, 26, tzinfo=timezone.utc)


class FakeAPI:
    def __init__(self):
        self.responses = {}
        self.calls = []

    def get(self, path, query=None, sarif=False):
        self.calls.append((path, query, sarif))
        value = self.responses[path]
        if isinstance(value, Exception):
            raise value
        return deepcopy(value)


class NativeDispositionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.head = self.root/"head.sarif"
        self.base = self.root/"base.sarif"
        self.api = FakeAPI()
        self.rows = []
        self.raw = []
        self.ref = {}
        for i, number in enumerate(sorted(native.IDS)):
            path = "src/fp" + str(number) + ".ts"
            f = finding(rule=RULE, file=path, hash_value="synthetic-fp-"+str(number),
                        message="synthetic "+str(number), source="synthetic")
            row = {"id":"FP-"+str(number),"rule":RULE,"path":path,"line":100,
                   "severity":"HIGH","fingerprint_sha256":native.digest(f["partialFingerprints"]["primaryLocationLineHash"]),
                   "message_sha256":native.digest(f["message"]["text"]),
                   "source_sha256":"d"*64,"git_blob":"e"*40}
            key = (RULE,path,100,"HIGH",row["fingerprint_sha256"],row["message_sha256"])
            self.ref[key] = (number,row)
            self.raw.append(f)
            enriched = deepcopy(f)
            enriched["properties"] = {"github/alertNumber": number}
            self.rows.append(enriched)
            alert_path = native.API+"/code-scanning/alerts/"+str(number)
            self.api.responses[alert_path] = {
                "number": number, "rule":{"id":RULE,"security_severity_level":"high"},
                "tool":{"name":"CodeQL"}, "state":"dismissed",
                "dismissed_reason":"false positive", "dismissed_by":{"id":native.OWNER_ID},
                "dismissed_comment":"synthetic independent Owner rationale",
                "dismissed_at":"2026-11-25T00:00:00Z"}
            self.api.responses[alert_path+"/instances"] = [{
                "ref":native.REF,"commit_sha":HEAD,"analysis_key":ANALYSIS,
                "category":CATEGORY,"state":"dismissed","location":{"path":path,"start_line":100},
                "message":{"text":f["message"]["text"]}}]
        self.api.responses[native.API] = {
            "id":native.REPO_ID,"full_name":native.REPO,"owner":{"id":native.OWNER_ID},"default_branch":"main"}
        self.api.responses[native.API+"/pulls/466"] = {
            "number":466,"state":"open","base":{"ref":"main","sha":BASE,"repo":{"id":native.REPO_ID}},
            "head":{"sha":PR_HEAD,"repo":{"id":native.REPO_ID}},"merge_commit_sha":HEAD}
        self.api.responses[native.API+"/code-scanning/sarifs/"+UPLOAD] = {"processing_status":"complete"}
        self.analysis = {"id":123,"sarif_id":UPLOAD,"ref":native.REF,"commit_sha":HEAD,
                         "analysis_key":ANALYSIS,"category":CATEGORY,"tool":{"name":"CodeQL","version":"2.27.6"},
                         "error":"","warning":"","results_count":9}
        self.api.responses[native.API+"/code-scanning/analyses"] = [self.analysis]
        self.api.responses[native.API+"/code-scanning/analyses/123"] = {"version":"2.1.0","runs":[{"results":self.rows}]}
        self.head_doc = report(*self.raw, query=RULE,version="2.27.6",category=CATEGORY)
        self.base_doc = report(query=RULE,version="2.27.6",category=CATEGORY)
        self.addCleanup(patch.stopall)
        patch.object(native,"_catalog",return_value=self.ref).start()
        patch.object(native.telemetry,"_source_pin",return_value="d"*64).start()
        def git(root,*args):
            if args[0]=="rev-parse":
                return (HEAD+"\n").encode()
            if args[0]=="show":
                return (BASE+" "+PR_HEAD+"\n").encode()
            if args[0]=="ls-tree":
                return ("100644 blob "+"e"*40+"\t"+args[-1]+"\0").encode()
            raise AssertionError("unexpected Git command")
        patch.object(native.telemetry,"_git",side_effect=git).start()

    def evaluate(self, **kwargs):
        self.head.write_text(json.dumps(self.head_doc),encoding="utf-8")
        self.base.write_text(json.dumps(self.base_doc),encoding="utf-8")
        params = dict(head_path=self.head,base_path=self.base,root=self.root,scanned=HEAD,
                      base=BASE,upload=UPLOAD,api=self.api,analysis_key=ANALYSIS,category=CATEGORY,now=NOW)
        params.update(kwargs)
        return native.evaluate(**params)

    def alert(self, number=50):
        return self.api.responses[native.API+"/code-scanning/alerts/"+str(number)]

    def instance(self, number=50):
        return self.api.responses[native.API+"/code-scanning/alerts/"+str(number)+"/instances"][0]

    def test_exact_nine_native_owner_decisions_preserve_raw(self):
        out = self.evaluate()
        self.assertEqual(out["raw"]["blocked"],9)
        self.assertEqual(out["native_false_positive"],9)
        self.assertEqual(out["remaining_blocked"],0)
        self.assertEqual(out["raw"]["new"],9)

    def test_open_alert_stays_blocked(self):
        self.alert()["state"]="open"
        self.assertEqual(self.evaluate()["remaining_blocked"],1)

    def test_agent_dismissal_stays_blocked(self):
        self.alert()["dismissed_by"]["id"]=123
        self.assertEqual(self.evaluate()["remaining_blocked"],1)

    def test_other_reason_stays_blocked(self):
        self.alert()["dismissed_reason"]="won't fix"
        self.assertEqual(self.evaluate()["remaining_blocked"],1)

    def test_expired_dismissal_stays_blocked(self):
        self.alert()["dismissed_at"]="2026-10-26T00:00:00Z"
        self.assertEqual(self.evaluate()["remaining_blocked"],1)

    def test_future_dismissal_stays_blocked(self):
        self.alert()["dismissed_at"]="2026-11-27T00:00:00Z"
        self.assertEqual(self.evaluate()["remaining_blocked"],1)

    def test_new_high_always_blocks(self):
        self.head_doc["runs"][0]["results"].append(
            finding(rule=RULE,file="src/unchanged.ts",hash_value="unapproved"))
        self.analysis["results_count"]=10
        out=self.evaluate()
        self.assertEqual(out["raw"]["blocked"],10)
        self.assertEqual(out["remaining_blocked"],1)

    def test_critical_escalation_cannot_match(self):
        for doc in (self.head_doc,self.base_doc):
            doc["runs"][0]["tool"]["driver"]["rules"][0]["properties"]["security-severity"]="9.5"
        out=self.evaluate()
        self.assertEqual(out["raw"]["blocked"],9)
        self.assertEqual(out["remaining_blocked"],9)
        self.assertEqual(self.api.calls,[])

    def test_native_alert_state_is_not_pr_instance_state(self):
        self.instance()["state"]="open"
        with self.assertRaises(gate.InvalidScan):
            self.evaluate()
        self.assertIn((native.API+"/code-scanning/alerts/50", None, False), self.api.calls)

    def test_native_missing_optional_warning(self):
        del self.analysis["warning"]
        self.assertEqual(self.evaluate()["remaining_blocked"],0)

    def test_native_warning_fails(self):
        self.analysis["warning"]="synthetic warning"
        with self.assertRaises(gate.InvalidScan):
            self.evaluate()

    def test_new_critical_with_nine_high_always_blocks(self):
        other="js/unsafe-query"
        for doc in (self.head_doc,self.base_doc):
            doc["runs"][0]["tool"]["driver"]["rules"].append({
                "id":other,"properties":{"tags":["security"],"security-severity":"9.5"}})
        self.head_doc["runs"][0]["results"].append(finding(rule=other,file="src/unchanged.ts",hash_value="critical"))
        self.analysis["results_count"]=10
        out=self.evaluate()
        self.assertEqual(out["native_false_positive"],9)
        self.assertEqual(out["raw"]["blocked"],10)
        self.assertEqual(out["remaining_blocked"],1)

    def test_duplicate_occurrence_fails(self):
        self.head_doc["runs"][0]["results"].append(deepcopy(self.raw[0]))
        with self.assertRaises(gate.InvalidScan):
            self.evaluate()

    def test_unknown_source_identity_stays_blocked(self):
        self.raw[0]["partialFingerprints"]["primaryLocationLineHash"]="changed"
        out=self.evaluate()
        self.assertEqual(out["remaining_blocked"],1)

    def test_changed_source_bytes_fails(self):
        native.telemetry._source_pin.return_value="f"*64
        with self.assertRaises(gate.InvalidScan):
            self.evaluate()

    def test_dismissed_alert_wrong_instance_state_fails(self):
        self.instance()["state"]="open"
        with self.assertRaises(gate.InvalidScan):
            self.evaluate()

    def test_wrong_instance_commit_fails(self):
        self.instance()["commit_sha"]="f"*40
        with self.assertRaises(gate.InvalidScan):
            self.evaluate()

    def test_wrong_native_number_fails(self):
        self.rows[0]["properties"]["github/alertNumber"]=100
        with self.assertRaises(gate.InvalidScan):
            self.evaluate()

    def test_no_enriched_raw_identity_fails(self):
        del self.rows[0]["partialFingerprints"]
        with self.assertRaises(gate.InvalidScan):
            self.evaluate()

    def test_native_upload_pending_fails(self):
        self.api.responses[native.API+"/code-scanning/sarifs/"+UPLOAD]["processing_status"]="pending"
        with self.assertRaises(gate.InvalidScan):
            self.evaluate()

    def test_wrong_analysis_commit_fails(self):
        self.analysis["commit_sha"]="f"*40
        with self.assertRaises(gate.InvalidScan):
            self.evaluate()

    def test_wrong_analysis_tool_fails(self):
        self.analysis["tool"]["version"]="2.27.7"
        with self.assertRaises(gate.InvalidScan):
            self.evaluate()

    def test_wrong_live_base_fails(self):
        self.api.responses[native.API+"/pulls/466"]["base"]["sha"]="f"*40
        with self.assertRaises(gate.InvalidScan):
            self.evaluate()

    def test_no_api_data_fails(self):
        self.api.responses[native.API+"/code-scanning/sarifs/"+UPLOAD]=gate.InvalidScan("synthetic unavailable")
        with self.assertRaises(gate.InvalidScan):
            self.evaluate()

    def test_malformed_raw_fails(self):
        self.head_doc["runs"][0]["invocations"][0]["executionSuccessful"]=False
        with self.assertRaises(gate.InvalidScan):
            self.evaluate()

    def test_no_new_findings_requires_no_native_read(self):
        self.base_doc=deepcopy(self.head_doc)
        out=self.evaluate()
        self.assertEqual(out["remaining_blocked"],0)
        self.assertEqual(self.api.calls,[])


class ReferenceTests(unittest.TestCase):
    def test_exact_nine_reference_source_blobs(self):
        rows=native._catalog()
        self.assertEqual({n for n,_ in rows.values()},native.IDS)
        for _,row in rows.values():
            raw=subprocess.check_output(["git","show","2bc6c983:"+row["path"]])
            self.assertEqual(native.hashlib.sha256(raw).hexdigest(),row["source_sha256"])
            oid=subprocess.check_output(["git","rev-parse","2bc6c983:"+row["path"]]).decode().strip()
            self.assertEqual(oid,row["git_blob"])


if __name__=="__main__":
    unittest.main()
