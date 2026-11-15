# CodeQL source-pinned delta telemetry — Issue #416

This is an optional diagnostic extension of the existing CodeQL security gate.
It does not alter which findings count as new or which severities block CI.
The original `codeql_gate.py` CLI and summary are unchanged by default.

In Security CI, the same pinned CodeQL CLI and query suite scan HEAD and the
verified comparison base in one job. The existing gate writes
`security-reports/codeql-sanitized.json` and returns its original verdict.
Afterward, `codeql_delta_telemetry.py` verifies both complete SARIF files,
recomputes the exact gate summary, and atomically augments that report with
`newHighCriticalDelta`, even when the gate has blocked new HIGH/CRITICAL findings.
Missing files, mismatched scanner versions/categories, scan notifications,
invalid primary regions, unsafe paths, missing Git files, modified source bytes,
or contradictory gate counts stop telemetry with exit code 2.

Each element has the validated `ruleId`, repository-relative `path`, positive
`startLine`, `severity`, SHA256 of the SARIF `primaryLocationLineHash`, the
existing SHA256 of the SARIF message text, and `sourceBlobSha256`. The source
digest is SHA256 of the *exact regular file blob committed at HEAD*, checked
against the working-tree bytes; symlinks and missing/untracked files are
rejected. Duplicate findings are accounted for using the same sorted multiset
and severity escalation logic as the blocking gate. Only new HIGH/CRITICAL
findings appear in this additional field. No raw fingerprint, SARIF message,
source snippet, source bytes, or credentials are copied into the artifact.

Future reviewers can use a delta element to identify the exact source version
and primary line associated with an alert, then review that alert and its
context through authorized source inspection. A source pin is evidence for
review, not proof that a finding is a false positive. This feature adds no
allowlist, blanket suppression, waiver, or CodeQL gate exception. SARIF
provenance still depends on the existing workflow running the pinned scanner;
the fields alone are not a cryptographic attestation of scanner execution.

Validation: `python3 -m unittest discover -s scripts/security -p 'test_codeql*.py' -v`.
