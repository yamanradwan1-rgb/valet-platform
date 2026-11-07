"""Adversarial contract tests for Trivy/OSV lockfile coverage evidence."""

import json
import tempfile
import unittest
from pathlib import Path

from verify_scanner_coverage import verify


class ScannerCoverageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "checkout"
        self.root.mkdir()
        (self.root / "pnpm-lock.yaml").write_text("lockfileVersion: '9.0'\n", encoding="utf-8")
        self.report = Path(self.temp.name) / "report.json"

    def check(self, scanner, data, *, exit_code=0, explicit=False):
        self.report.write_text(json.dumps(data), encoding="utf-8")
        verify(scanner, self.report, self.root, exit_code, explicit_lockfile=explicit)

    @staticmethod
    def trivy_result(*, severity="HIGH", with_findings=True, with_packages=False):
        result = {"Target": "pnpm-lock.yaml", "Class": "lang-pkgs", "Type": "pnpm"}
        if with_findings:
            result["Vulnerabilities"] = [{"VulnerabilityID": "CVE-2026-0001",
                                          "PkgName": "dependency", "InstalledVersion": "1.0",
                                          "Severity": severity}]
        if with_packages:
            result["Packages"] = [{"Name": "dependency", "Version": "1.0"}]
        return result

    def trivy(self, results, *, artifact_type="repository"):
        return {"SchemaVersion": 2, "ArtifactName": "/src", "ArtifactType": artifact_type,
                "Results": results}

    @staticmethod
    def osv(*, path="/src/pnpm-lock.yaml", packages=None):
        if packages is None:
            packages = [{"package": {"name": "dependency", "version": "1.0"},
                         "vulnerabilities": [{"id": "GHSA-2026-0001"}]}]
        return {"results": [{"source": {"path": path, "type": "lockfile"},
                             "packages": packages}]}

    def test_trivy_real_report_target_shape_with_findings(self):
        # Actual sanitized Security CI #91 identified file "pnpm-lock.yaml".
        self.check("trivy", self.trivy([self.trivy_result()]))

    def test_trivy_valid_no_finding_scan_with_package_evidence(self):
        for artifact_type in ("repository", "filesystem"):
            with self.subTest(artifact_type=artifact_type):
                self.check("trivy", self.trivy([
                    self.trivy_result(with_findings=False, with_packages=True)],
                    artifact_type=artifact_type))

    def test_trivy_rejects_fake_pnpm_package_entries(self):
        for invalid in ({}, None, "x", {"Name": "dependency"},
                        {"Name": "dependency", "Version": " "},
                        {"Name": " ", "Version": "1.0"},
                        {"Name": "dependency", "Version": 1}):
            with self.subTest(entry=invalid), self.assertRaises(ValueError):
                result = self.trivy_result(with_findings=False)
                result["Packages"] = [invalid]
                self.check("trivy", self.trivy([result]))

    def test_trivy_rejects_fake_vulnerabilities_even_when_packages_valid(self):
        for invalid in ({}, None, "x", {"VulnerabilityID": "CVE-1"},
                        {"VulnerabilityID": "  ", "PkgName": "dep", "InstalledVersion": "1"},
                        {"VulnerabilityID": "CVE-1", "PkgName": "dep", "InstalledVersion": " "},
                        {"VulnerabilityID": "CVE-1", "PkgName": "", "InstalledVersion": "1"}):
            with self.subTest(entry=invalid), self.assertRaises(ValueError):
                result = self.trivy_result(with_findings=False, with_packages=True)
                result["Vulnerabilities"] = [invalid]
                self.check("trivy", self.trivy([result]))

    def test_trivy_valid_vulnerabilities_alone_prove_pnpm_extraction(self):
        self.check("trivy", self.trivy([self.trivy_result()]))

    def test_trivy_checks_every_package_and_vulnerability_not_just_first(self):
        for field in ("Packages", "Vulnerabilities"):
            result = self.trivy_result(with_packages=True)
            result[field].append({})
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.check("trivy", self.trivy([result]))

    def test_trivy_scan_with_extra_existing_repo_target(self):
        (self.root / "infra").mkdir()
        (self.root / "infra" / "main.tf").write_text("", encoding="utf-8")
        report = self.trivy([self.trivy_result(),
                             {"Target": "infra/main.tf", "Class": "config", "Type": "terraform"}])
        self.check("trivy", report)

    def test_trivy_empty_or_missing_result_inventory_does_not_pass(self):
        for value in ([], None, "not-a-list"):
            with self.subTest(results=value), self.assertRaises(ValueError):
                self.check("trivy", self.trivy(value))
        with self.assertRaises(ValueError):
            self.check("trivy", {"ArtifactName": "/src", "ArtifactType": "filesystem"})

    def test_trivy_other_target_or_no_dependency_extraction_fails(self):
        (self.root / "other.lock").write_text("test", encoding="utf-8")
        with self.assertRaises(ValueError):
            self.check("trivy", self.trivy([{"Target": "other.lock", "Class": "lang-pkgs",
                                             "Type": "npm", "Packages": [{"Name": "foo"}]}]))
        with self.assertRaises(ValueError):
            self.check("trivy", self.trivy([self.trivy_result(with_findings=False)]))
        with self.assertRaises(ValueError):
            self.check("trivy", self.trivy([{"Target": "pnpm-lock.yaml", "Class": "lang-pkgs",
                                             "Type": "npm", "Packages": [{"Name": "foo"}]}]))

    def test_trivy_wrong_artifact_identity_or_crash_fails(self):
        for key, wrong in (("ArtifactName", "/tmp"), ("ArtifactType", "image")):
            data = self.trivy([self.trivy_result()])
            data[key] = wrong
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.check("trivy", data)
        for code in (1, 2, 139):
            with self.subTest(exit_code=code), self.assertRaises(ValueError):
                self.check("trivy", self.trivy([self.trivy_result()]), exit_code=code)

    def test_osv_real_report_source_shape_with_findings(self):
        # Actual sanitized Security CI #91 identified file "/src/pnpm-lock.yaml".
        self.check("osv", self.osv(), exit_code=1)

    def test_osv_clean_result_requires_explicit_lockfile_and_zero_exit(self):
        with self.assertRaises(ValueError):
            self.check("osv", {"results": []})
        with self.assertRaises(ValueError):
            self.check("osv", {"results": []}, exit_code=1, explicit=True)
        self.check("osv", {"results": []}, exit_code=0, explicit=True)

    def test_osv_nonempty_results_require_actual_pnpm_source_packages(self):
        (self.root / "apps").mkdir()
        (self.root / "apps" / "other.lock").write_text("test", encoding="utf-8")
        other = {"source": {"path": "/src/apps/other.lock", "type": "lockfile"},
                 "packages": [{"package": {"name": "other", "version": "1"}}]}
        for payload in ({"results": [other]}, self.osv(packages=[]),
                        {"results": [other] + self.osv(packages=[])["results"]},
                        {"results": [{"source": {"path": "/src", "type": "git"},
                                      "packages": []}]}):
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                self.check("osv", payload, explicit=True, exit_code=0)
        self.check("osv", {"results": [other] + self.osv()["results"]}, exit_code=1)

    def test_osv_rejects_fake_package_entries(self):
        for invalid in ({}, None, "x", {"package": {}},
                        {"package": {"name": "dep"}},
                        {"package": {"name": " ", "version": "1"}},
                        {"package": {"name": "dep", "version": " "}},
                        {"package": {"name": "dep", "version": 1}}):
            with self.subTest(entry=invalid), self.assertRaises(ValueError):
                self.check("osv", self.osv(packages=[invalid]), explicit=True)

    def test_osv_rejects_fake_vulnerability_ids(self):
        for invalid in ({}, None, "x", {"id": ""}, {"id": "   "}, {"id": 123}):
            with self.subTest(entry=invalid), self.assertRaises(ValueError):
                package = {"package": {"name": "dep", "version": "1.0"},
                           "vulnerabilities": [invalid]}
                self.check("osv", self.osv(packages=[package]), explicit=True)

    def test_osv_checks_every_package_and_vulnerability_not_just_first(self):
        good = {"package": {"name": "dep", "version": "1.0"},
                "vulnerabilities": [{"id": "GHSA-VALID"}]}
        with self.assertRaises(ValueError):
            self.check("osv", self.osv(packages=[good, {}]), exit_code=1)
        with self.assertRaises(ValueError):
            self.check("osv", self.osv(packages=[{
                "package": good["package"],
                "vulnerabilities": [{"id": "GHSA-VALID"}, {}]}]), exit_code=1)

    def test_osv_valid_clean_package_evidence_has_no_false_positive(self):
        self.check("osv", self.osv(packages=[
            {"package": {"name": "dep", "version": "1.0"}, "vulnerabilities": []}]))

    def test_osv_exit_one_without_any_advisory_fails(self):
        payload = self.osv(packages=[
            {"package": {"name": "dep", "version": "1.0"}, "vulnerabilities": []}])
        with self.assertRaises(ValueError):
            self.check("osv", payload, exit_code=1, explicit=True)

    def test_osv_recursively_discovered_sources_within_checkout_are_valid(self):
        (self.root / "apps").mkdir()
        (self.root / "apps" / "other.lock").write_text("test", encoding="utf-8")
        extra = {"source": {"path": "/src/apps/other.lock", "type": "lockfile"},
                 "packages": [{"package": {"name": "extra", "version": "1"}}]}
        with self.assertRaises(ValueError):
            self.check("osv", {"results": [extra]})
        with self.assertRaises(ValueError):
            self.check("osv", {"results": [extra]}, explicit=True)
        self.check("osv", {"results": self.osv()["results"] + [extra]}, exit_code=1)
        with self.assertRaises(ValueError):
            self.check("osv", {"results": [{"source": {"path": "/src", "type": "git"},
                                            "packages": []}]}, explicit=True)

    def test_osv_unexpected_source_and_missing_source_fail_even_if_explicit(self):
        for value in ("/tmp/pnpm-lock.yaml", "/src/../pnpm-lock.yaml",
                      "../../pnpm-lock.yaml", "C:/pnpm-lock.yaml", "\\src\\pnpm-lock.yaml"):
            with self.subTest(path=value), self.assertRaises(ValueError):
                self.check("osv", self.osv(path=value), exit_code=1, explicit=True)
        with self.assertRaises(ValueError):
            self.check("osv", {"results": [{"packages": [{}]}]}, explicit=True)

    def test_osv_wrong_type_or_malformed_packages_fail(self):
        for data in ({"results": [None]}, {"results": "none"},
                     {"results": [{"source": {"path": "/src/pnpm-lock.yaml",
                                    "type": "git"}, "packages": [{}]}]},
                     {"results": [{"source": {"path": "/src/pnpm-lock.yaml",
                                    "type": "lockfile"}, "packages": "invalid"}]}):
            with self.subTest(data=data), self.assertRaises(ValueError):
                self.check("osv", data, explicit=True)

    def test_missing_or_empty_checkout_lockfile_never_passes(self):
        for scanner, data in (("trivy", self.trivy([self.trivy_result()])),
                              ("osv", self.osv())):
            lockfile = self.root / "pnpm-lock.yaml"
            for change in ("empty", "missing"):
                with self.subTest(scanner=scanner, change=change):
                    if change == "empty":
                        lockfile.write_text("", encoding="utf-8")
                    else:
                        lockfile.unlink(missing_ok=True)
                    with self.assertRaises(ValueError):
                        self.check(scanner, data, explicit=scanner == "osv")
                    lockfile.write_text("lockfileVersion: '9.0'\n", encoding="utf-8")

    def test_corrupted_missing_or_wrong_json_fails(self):
        with self.assertRaises(ValueError):
            verify("trivy", self.report, self.root, 0)
        for raw in ("", "{broken", "null", "[]"):
            with self.subTest(raw=raw):
                self.report.write_text(raw, encoding="utf-8")
                with self.assertRaises((ValueError, json.JSONDecodeError)):
                    verify("trivy", self.report, self.root, 0)

    def test_trivy_rejects_outside_and_missing_targets_even_with_pnpm(self):
        for target in ("/etc/passwd", "../../etc/passwd", "missing.lock",
                       "//src/pnpm-lock.yaml", "pnpm-lock.yaml/../other.lock"):
            data = self.trivy([self.trivy_result(), {"Target": target}])
            with self.subTest(target=target), self.assertRaises(ValueError):
                self.check("trivy", data)

    def test_osv_exit_128_or_crash_must_not_accept_explicit_flag(self):
        for exit_code in (2, 127, 128, 139):
            with self.subTest(exit_code=exit_code), self.assertRaises(ValueError):
                self.check("osv", {"results": []}, exit_code=exit_code, explicit=True)


if __name__ == "__main__":
    unittest.main()
