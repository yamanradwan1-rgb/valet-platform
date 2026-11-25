import unittest
from copy import deepcopy
from native_readback_diagnostic import complete

class DiagnosticTests(unittest.TestCase):
    def setUp(self):
        self.a={"error":"","warning":"","tool":{"version":"2.27.6"},"category":"/language:javascript-typescript","results_count":61}
        self.u={"processing_status":"complete"}
        self.c=[deepcopy(self.a)]
        self.e={"version":"2.1.0","runs":[{"results":[{}]*61}]}
    def test_complete(self):
        self.assertTrue(complete(self.a,self.u,self.c,self.e))
    def test_pending(self):
        self.u["processing_status"]="pending"
        self.assertFalse(complete(self.a,self.u,self.c,self.e))
    def test_wrong_analysis(self):
        self.c[0]["id"]=123
        self.assertFalse(complete(self.a,self.u,self.c,self.e))
    def test_warning(self):
        self.a["warning"]="warning"
        self.c=[deepcopy(self.a)]
        self.assertFalse(complete(self.a,self.u,self.c,self.e))
    def test_error(self):
        self.a["error"]="error"
        self.c=[deepcopy(self.a)]
        self.assertFalse(complete(self.a,self.u,self.c,self.e))
    def test_count(self):
        self.a["results_count"]=60
        self.c=[deepcopy(self.a)]
        self.assertFalse(complete(self.a,self.u,self.c,self.e))
    def test_wrong_version(self):
        self.a["tool"]["version"]="2.27.7"
        self.c=[deepcopy(self.a)]
        self.assertFalse(complete(self.a,self.u,self.c,self.e))
    def test_enriched_incomplete(self):
        self.e["runs"][0]["results"].pop()
        self.assertFalse(complete(self.a,self.u,self.c,self.e))
