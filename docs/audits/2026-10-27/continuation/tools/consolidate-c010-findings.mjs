import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [continuationRoot, scratchRoot] = process.argv.slice(2);
if (!continuationRoot || !scratchRoot) throw new Error('Usage: consolidate-c010-findings.mjs <continuation-root> <scratch-root>');

const sourceSha = 'd67b2a4a4897b4a73d21aba630fc5ab52ff9169b';
const inputs = [
  ['W3', 'C010-W3-candidate-findings.json'],
  ['W4', 'C010-W4-finding-candidates.json'],
  ['W5', 'C010-W5-candidate-findings.json'],
];
const byWorker = inputs.map(([worker, filename]) => {
  const value = JSON.parse(readFileSync(join(scratchRoot, worker, filename), 'utf8'));
  if (value.source_commit !== sourceSha || value.batch !== 'C010') throw new Error(`Invalid source provenance: ${worker}/${filename}`);
  const entries = value.findings ?? value.candidate_findings;
  if (!Array.isArray(entries) || !entries.length) throw new Error(`Missing candidate evidence ${filename}`);
  return { worker, source_scratch_name: filename, findings: entries, ...(value.previous_dashboard_findings_rechecked ? { previous_dashboard_findings_rechecked: value.previous_dashboard_findings_rechecked } : {}), ...(value.cross_component_dependency_impact ? { cross_component_dependency_impact: value.cross_component_dependency_impact } : {}) };
});
const findingIds = byWorker.flatMap(group => group.findings.map(item => item.id));
if (new Set(findingIds).size !== 4 || findingIds.length !== 4) throw new Error(`Unexpected candidate IDs: ${findingIds.join(', ')}`);
const historicalP1 = JSON.parse(readFileSync(join(scratchRoot, 'W1', 'C010-W1-SEC-011-issue-363-recheck.json'), 'utf8'));
if (historicalP1.finding_id !== 'SEC-011' || historicalP1.source_commit !== sourceSha ||
    historicalP1.coverage_credit !== 0 || historicalP1.verdict !== 'CONFIRMED_STATIC_PATH_PERSISTS') {
  throw new Error('Invalid historical SEC-011 independent recheck');
}
const output = {
  batch: 'C010', source_commit: sourceSha,
  validation: 'STATIC_AUDIT_ONLY',
  executed_runtime_tests: 0,
  new_confirmed_p0_p1: 0,
  confidence_caveat: 'These four new source candidates have differing confidence; none is a runtime-exploited or production-confirmed result. Existing SEC-011 has a separate independent static recheck with zero added coverage credit.',
  by_worker: byWorker,
  historical_p1_independent_recheck: historicalP1,
  prior_issue_state_observed_2026_10_29: [
    { issue: 363, id: 'SEC-011', github_state: 'OPEN', source_status: 'CONFIRMED_STATIC_PATH_PERSISTS', notes: 'Existing P1 MFA recovery ceremony binding independently traced by W1 and source spot-verified by Prime; runtime unverified.' },
    { issue: 356, id: 'CUST-001', github_state: 'CLOSED', source_status: 'RESOLVED_IN_CURRENT_MAIN_CANDIDATE', notes: 'W5 compared old Guest copy flow with patched source; no runtime suite.' },
    { issue: 360, id: 'CUST-002', github_state: 'CLOSED', source_status: 'RESOLVED_IN_CURRENT_MAIN_CANDIDATE', notes: 'W5 checked Guest button accessible name under loading.' },
    { issue: 354, id: 'DASH-01', github_state: 'CLOSED', source_status: 'SOURCE_FIX_PRESENT', notes: 'Bounded focus/visibility KPI refresh source exists; no runtime tests in C010.' },
  ],
};
const dest = join(continuationRoot, 'checkpoints', 'C010-d67b2a4a-finding-evidence.json');
writeFileSync(dest, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ destination: dest, ids: findingIds, sourceSha, priorIssues: output.prior_issue_state_observed_2026_10_29.length }));
