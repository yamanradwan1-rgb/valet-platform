# Manual security audit (free tools)

Open **Actions > Manual Security Audit > Run workflow**, choose `all`, then run.
There are deliberately **no push, PR, or schedule triggers**; rerun only when wanted.
The normal CI remains unchanged. The repository can stay **private**.

## Coverage

- **Semgrep Community:** static code security patterns.
- **Trivy:** vulnerable dependencies and infrastructure misconfiguration.
- **Gitleaks CLI:** full available Git history, with secrets and source excerpts
  removed from the uploaded report. Rotate any real exposed credentials.
- **OSV-Scanner + pnpm audit:** independent JavaScript dependency advisories.
- **ZAP:** passive Dashboard baseline and OpenAPI-driven API scan. The optional
  active API scan runs **only** against the temporary API and PostgreSQL
  provisioned on the GitHub-hosted test runner; production is not targeted.

Download the `static-security-*` and `dast-security-*` artifacts from the run's
Summary page. JSON and HTML are retained for seven days. Each job writes a
`SUMMARY.md`, and missing/invalid scanner reports fail the summary check, rather
than masquerading as zero findings. Review results before filing issues or
blocking releases: automated findings can be false positives or duplicates.

## Known gaps / safety

- There is **no guaranteed complete vulnerability discovery**: authenticated
  tenant isolation (BOLA/IDOR), MFA and role boundaries, checkout/parking/
  retrieval/payment business rules, and Native-specific security require
  separate purpose-built tests.
- DAST is limited to throwaway local services, synthetic credentials, mock SMS,
  disabled external payment/push. There is no production URL or secret input.
- Reports may reveal vulnerable endpoints or source context. Keep the repo
  private and restrict access to uploaded Actions artifacts. GitHub-hosted
  runner minutes are subject to the account's private-repository free quota.
- **Do not temporarily switch a commercial/private repository to Public.**
  Published Git history and secrets can be copied before it becomes private.
- Only authorized maintainers should start active scans. Use `scope=static` if
  the temporary test API fails to start; do not substitute a public endpoint.
