# GitHub-native CodeQL reconciliation (isolated proposal, NOT ACTIVE)

## Decision and preservation

Owner rejects external infrastructure, custom App, external server, self-hosted
runner, additional subscription, custom signing and external verifier. The
external prototype b33def216465541fe0f548f362bb87b1800ca0e8 is preserved on
local archive/option-c-external-verifier-20261126, never integrated.
This new candidate starts at the verified ordinary CI GREEN
2bc6c983762457454d1bc055b3f4630731fc4058. Original Security CI is RED with
raw CodeQL 61 total, 52 existing, 9 new HIGH, 9 blocked. Official PR run
45696730517, CodeQL job 139495960375, sanitized artifact 15061613961.
No current workflow, gate, alert, repository configuration, visibility or
product change. Do not activate this prototype from this branch.

## Actual GitHub capability and trust reduction

Repository 1327249029, yamanradwan1-rgb/valet-platform, public personal
GitHub Free; Owner numeric ID 295649470. Independent authenticated UI
readback: zero rulesets, no classic branch protection, CodeQL advanced setup,
security check threshold High or higher and standard Only errors. New
branch ruleset form offers Require code scanning results. Currently
connected agent integration reports admin and Owner browser exposes Dismiss.
W12 later verified the authenticated Collaborators page: one collaborator,
veletpro0-lgtm. Its actual credentials and agent ownership must be checked
by Owner; a personal repository collaborator normally has write access.
No Prevent direct alert dismissals control seen on this personal repository.
GitHub allows writers to dismiss, and Actions security-events:write can
upload SARIF AND change alert state. Do not claim exclusive Owner authority
while agents can use the Owner session or upstream write credentials.
No custom App or external trust boundary will be created.

Native code_scanning rule is independent of required status check names,
but only applies when ALL alert-identified lines lie in the PR diff.
Dismissing is repository-wide, not branch/tree/CLI-locked; reason, actor,
time and optional comment are retained in the alert, which can be reopened.
No native automatic 30-day expiry or independent source/CLI attestation.
Personal alert history is not equivalent to an organization audit log.
Current same-SHA push and PR runs have conflicting results for identical
GitHub Actions check names. Generic Actions App identity is not a trusted
workflow identity. No claim that a PR cannot tamper with its own workflow.

Smallest patch if loss of full raw delta coverage were acceptable would
be one wrapper converting only raw gate exit 1 (valid findings) to a
validation success and relying on the native ruleset for blocking. REJECT
that option for this requirement: it would not necessarily block an
unresolved HIGH/CRITICAL outside the diff. Do not use continue-on-error,
rule exclusion, SARIF suppression, severity downgrade, or blanket skip.

## Narrow alternative, not integrated

native_codeql_dispositions.py is an isolated proof of the necessary
reconciliation. It uses the existing raw parser/comparator and source-pin
helper. native_disposition_reference.json is historical identity data only,
not approval. No external verifier code, new libraries, signing or state
service. Exact individual IDs 50-57 and 61, HIGH only, exact rule/path/line,
message and raw primary fingerprint hash, committed blob and source SHA256.
For every eligible raw delta occurrence, require all of:

- Actual same-repo PR466, live main comparison base, exact scanned merge
  commit and parents, real checkout.
- Current upload ID from upload-sarif, completed upload, one matching
  analysis, exact ref/commit/tool/version/category/analysis key and count.
  Official job log confirmed analysis key
  .github/workflows/security-ci.yml:sast-codeql and upload category input
  /language:javascript-typescript; actual API response schema must be verified.
- GET GitHub analysis as application/sarif+json: require exact finding
  identity and github/alertNumber. This is an enriched subset, not full
  authenticated raw SARIF. If GitHub removes or rewrites a required field,
  fail closed; do not approximate by path alone.
- GET individual native alert + exact current PR instance: dismissed,
  false positive, dismissed_by numeric Owner ID, nonempty rationale,
  age less than 30 days, exact instance location/message/commit/configuration.
  Native dismissal itself does NOT expire; this proposed raw gate refuses
  stale approvals on subsequent runs. Reopening or changing source/version
  invalidates the reconciliation. No automatic renewal.
- Any unrecognized HIGH/CRITICAL occurrence remains blocked. Duplicates or
  missing/malformed/ambiguous evidence fail. Preserve original raw counts;
  separately report native_false_positive and remaining_blocked.
- GET only, no alert mutation API, no write token required by the reader.
  API readback still relies on GitHub and the caller; not an independent
  signed verifier. A compromised candidate workflow can forge its own job
  outcome; identity check cannot distinguish an agent acting as the Owner.

No CLI/invocation is wired into existing Security CI. Prototype positive
fixtures are synthetic and never authorize a real disposition. Actual
authenticated analysis API access, native enriched SARIF/instance schema,
current alert mapping, permissions and live configuration are acceptance
blockers, not to be guessed. Prior public code-scanning API returned 401;
connected GitHub fetch disallows that endpoint. No credential extraction.

## Owner configuration, only after separate approval

1. Separate Owner browser/account and security/admin credentials from
   coding agents. Do not provide Owner PAT, session or upstream write
   identity. Owner alone maintains upstream settings and dismisses alerts.
   Safest Free-personal operating model: agents work locally or in forks,
   Owner reviews/pushes trusted changes to upstream; no upstream write
   collaborator granted to agents. Existing upload-sarif condition skips
   fork PR uploads; therefore use an Owner-reviewed upstream candidate for
   the current same-repo PR reconciliation, not a claimed green fork upload. Inspect Collaborators, installed
   integrations, PAT scopes and Actions settings yourself. If agents share
   Owner identity, owner-only dismissal cannot be enforced. Native Actions
   upload token also has alert-write capability; do not execute arbitrary
   PR scripts with that token. Restrict workflow changes to Owner-reviewed
   trusted code; never use pull_request_target to execute PR code with
   elevated credentials. Protected branch review and the actor check are
   defense-in-depth, not an independent trust proof.
2. Settings > Rulesets > New branch ruleset: main (refs/heads/main), Active,
   no bypass, require PR, restrict deletions and non-fast-forward updates,
   require current approved CI/security checks, strict up-to-date checks.
   Require code scanning results, tool CodeQL, Security alerts High or
   higher, standard Alerts Only errors. API code_scanning rule parameters:
   code_scanning_tools [{tool:"CodeQL",security_alerts_threshold:"high_or_higher",
   alerts_threshold:"errors"}]. Keep other scanner requirements unchanged.
   Protect .github/workflows and scripts/security via Owner-controlled
   review; CODEOWNERS alone is not a security boundary and a sole Owner
   cannot self-approve their own PR. Validate actual review model.
   Preserve draft PR and no merge. If a hard main no-update lock is needed
   during acceptance, Owner must explicitly accept its effect on all work.
   Verify active ruleset + effective main rules and actual native CodeQL
   check failure on current PR before considering raw gate integration.
3. W12 read-only checked all nine native alerts #50-57 and #61: all OPEN,
   HIGH, exact rule and primary path/line matching the reference catalog;
   observed on the candidate branch and another review branch. No dismissal.
   Before activation, correlate each native alert instance against
   exact current raw identity and source (not historical alert number alone).
   Verify actual GitHub analysis readback using GITHUB_TOKEN with only
   security-events:read in a trusted context. Keep raw head/base SARIF on
   runner; native upload retains GitHub's analysis/alert history and
   sanitized artifact is currently retained 7 days. Do NOT upload raw
   sensitive SARIF as public Actions artifact. GitHub does not preserve
   byte-exact raw head/base evidence from completed runners.
4. Obtain explicit Owner approval before individual False positive
   dismissals, one alert at a time with documented rationale and review
   reference. Never use bulk dismissal, another reason or query exclusions.
   No agents approve or dismiss their own findings.
5. Only after evidence and permissions verified and separate explicit
   activation approval: minimally wire the reconciliation after successful
   upload processing (id on upload-sarif step, current sarif-id output),
   preserving existing raw scan, validation, original comparator semantics,
   telemetry and other jobs. Require exit failure when remaining_blocked >0
   or readback fails, never allow a raw invalid scan through. Use the raw
   summary separately from disposition summary. Do not enable any switch
   whose absence/misconfiguration defaults to passing. Confirm exact
   pinned action output/API behavior on real GitHub before wiring.
6. Validate both workflows on same final PR HEAD, native rule enforcement,
   nine individually reviewed dispositions, extra HIGH/CRITICAL including
   untouched-line finding, reopened/wrong-actor alert, invalid SARIF,
   failed upload and stale head/base. Do not merge/deploy. Native check
   caching/TOCTOU after reopening remains a known limitation; run fresh
   validation after any disposition change. Do not claim atomic revocation.

## References

- https://docs.github.com/en/code-security/concepts/code-scanning/merge-protection
- https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/manage-your-configuration/set-merge-protection
- https://docs.github.com/en/code-security/how-tos/manage-security-alerts/manage-code-scanning-alerts/triage-alerts-in-pull-requests
- https://docs.github.com/en/code-security/how-tos/manage-security-alerts/manage-code-scanning-alerts/resolve-alerts
- https://docs.github.com/en/code-security/how-tos/manage-security-alerts/manage-code-scanning-alerts/enable-delegated-alert-dismissal
- https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
- https://docs.github.com/en/rest/code-scanning/code-scanning
- https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration/permission-levels-for-a-personal-account-repository

## Tests

python -B -m unittest discover -s scripts/security -p 'test_codeql_native_dispositions.py' -v
python -B -m unittest discover -s scripts/security -p 'test_codeql*.py' -v

No live alert mutation, repository settings, visibility, scan, push, merge,
deployment or exception activation.
