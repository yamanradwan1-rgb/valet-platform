#!/usr/bin/env node
// Promote only independently QA-accepted source reviews into current-source C010 accounting.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [continuationArg, resultsArg] = process.argv.slice(2);
if (!continuationArg || !resultsArg) throw new Error('Usage: promote-c010.mjs CONTINUATION_DIR RESULTS_DIR');
const root = resolve(continuationArg), results = resolve(resultsArg);
const source = 'd67b2a4a4897b4a73d21aba630fc5ab52ff9169b', short = 'd67b2a4a';
const baseline = join(root, 'rebaselines', source);
const qa = JSON.parse(readFileSync(join(results, 'Prime', 'C010-qa-provisional.json'), 'utf8'));
const accepted = JSON.parse(readFileSync(join(results, 'Prime', 'C010-qa-accepted.json'), 'utf8'));
const roster = JSON.parse(readFileSync(join(root, 'checkpoints', `C010-${short}-assignment-roster.json`), 'utf8'));
const transfersPath = join(root, 'checkpoints', `C010-${short}-ownership-transfers.json`);
const transfers = JSON.parse(readFileSync(transfersPath, 'utf8'));
const before = JSON.parse(readFileSync(join(baseline, 'summary.json'), 'utf8'));
if (qa.source_commit !== source || qa.valid !== 161 || qa.invalid !== 0 || qa.missing !== 0 ||
    accepted.length !== 161 || roster.assignments.length !== 161 || transfers.transfers.length !== 50 ||
    before.current_fully_reviewed !== 1620 || before.current_remaining !== 3159) {
  throw new Error('C010 not independently QA-complete; refusing promotion');
}

function csv(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
    else if (c === '\n' && !quoted) { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (quoted) throw new Error('Unclosed ledger CSV quote');
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const fields = rows.shift();
  return { fields, rows: rows.map((values, i) => {
    if (values.length !== fields.length) throw new Error('Invalid CSV row ' + (i + 2));
    return Object.fromEntries(fields.map((field, j) => [field, values[j]]));
  }) };
}
const quote = value => '"' + String(value ?? '').replaceAll('"', '""') + '"';
const input = csv(readFileSync(join(baseline, 'current-coverage-ledger.csv'), 'utf8'));
const paths = new Map(accepted.map(item => [item.path, item]));
if (paths.size !== 161) throw new Error('Duplicate accepted path');
const records = new Map();
const outputRecords = [];
for (const acceptedItem of accepted) {
  if (!records.has(acceptedItem.record_file)) {
    const list = JSON.parse(readFileSync(acceptedItem.record_file, 'utf8'));
    records.set(acceptedItem.record_file, new Map(list.map(item => [item.path, item])));
  }
  const record = records.get(acceptedItem.record_file).get(acceptedItem.path);
  if (!record || record.source_sha256 !== acceptedItem.source_sha256) throw new Error('Accepted review record changed: ' + acceptedItem.path);
  outputRecords.push({ ...record, original_owner: acceptedItem.original_owner, actual_reviewer: acceptedItem.actual_reviewer });
}
outputRecords.sort((a, b) => a.path.localeCompare(b.path));
const rows = input.rows.map(previousRow => {
  const row = { ...previousRow }, verified = paths.get(row.path);
  if (!verified) return row;
  if (row.current_status === 'fully_reviewed' || row.current_source_sha256 !== verified.source_sha256 ||
      Number(row.lines) !== verified.lines || row.current_baseline_sha !== source) {
    throw new Error('Invalid base ledger state for ' + row.path);
  }
  const record = outputRecords.find(item => item.path === row.path);
  row.current_status = 'fully_reviewed';
  row.current_review_batch = 'C010';
  row.current_reviewer = verified.actual_reviewer;
  row.current_review_source_sha256 = verified.source_sha256;
  row.current_review_notes = record.semantic_review_notes;
  row.current_review_finding_ids = (record.finding_ids ?? []).join(';');
  row.dependency_impact_review = 'REVIEWED_CURRENT_SOURCE_C010';
  row.classification = previousRow.classification === 'MODIFIED_REVIEW_STALE' ? 'MODIFIED_REVIEW_VALIDATED'
    : previousRow.classification === 'NEW_UNREVIEWED' ? 'NEW_REVIEWED_C010' : 'CURRENT_REVIEWED_C010';
  return row;
});
const eligible = rows.filter(row => row.authored_code_candidate === 'True');
const reviewed = eligible.filter(row => row.current_status === 'fully_reviewed');
const remaining = eligible.filter(row => row.current_status !== 'fully_reviewed');
const reviewedLines = reviewed.reduce((sum, row) => sum + Number(row.lines), 0);
const lines = eligible.reduce((sum, row) => sum + Number(row.lines), 0);
if (eligible.length !== before.candidate_files || reviewed.length !== 1781 || remaining.length !== 2998 ||
    lines !== before.candidate_lines || reviewedLines !== qa.provisional_reviewed_lines_if_QA_accepted) {
  throw new Error('Post-promotion totals do not reconcile');
}
const summary = {
  checkpoint: 'C010', source_commit: source, source_tree: before.current_tree_sha,
  parent_docs_commit: '6624e4fe50e9e2b5734797f30d936626133a31ca',
  candidate_files: eligible.length, candidate_lines: lines,
  previous_current_fully_reviewed: before.current_fully_reviewed,
  previous_current_reviewed_lines: before.current_reviewed_lines,
  newly_reviewed: 161, newly_reviewed_lines: reviewedLines - before.current_reviewed_lines,
  current_fully_reviewed: reviewed.length, current_reviewed_lines: reviewedLines,
  current_remaining: remaining.length,
  file_percent: 100 * reviewed.length / eligible.length,
  line_percent: 100 * reviewedLines / lines,
  original_worker_roles: 7, original_failed_worker_roles: ['W6', 'W7'],
  ownership_transfers: transfers.transfers.length, errors: 0,
  runtime_tests_executed: 0, static_only: true,
};
const prefix = join(root, 'checkpoints', `C010-${short}`);
writeFileSync(prefix + '-review-records.json', JSON.stringify(outputRecords, null, 2) + '\n');
writeFileSync(prefix + '-coverage-summary.json', JSON.stringify(summary, null, 2) + '\n');
writeFileSync(prefix + '-current-ledger.csv', [input.fields.join(','), ...rows.map(row => input.fields.map(key => quote(row[key])).join(','))].join('\n') + '\n');
writeFileSync(prefix + '-current-remaining.txt', remaining.map(row => row.path).join('\n') + '\n');
writeFileSync(prefix + '-qa-summary.json', JSON.stringify({
  source_sha: source, source_tree: before.current_tree_sha,
  exact_roster: 161, valid_records: qa.valid, invalid_records: qa.invalid, missing_records: qa.missing,
  unique_credited_paths: paths.size, no_product_edits: true,
  prime_static_spot_review_completed: true,
  prime_spot_review_paths: [
    'apps/api/src/modules/valet-sessions/intake-session-command.ts',
    'apps/api/src/modules/dashboard/dashboard-location-authorization.ts',
    'apps/api/src/common/database/bounded-postgres-query.ts',
    'apps/customer/src/components/primitives/btn.tsx',
  ],
  prime_spot_review_result: 'PASS — source-specific record claims and highlighted authority/transaction/deadline/focus paths match pinned source; no tests executed',
  runtime_tests: 'NOT_EXECUTED — STATIC_AUDIT_ONLY',
}, null, 2) + '\n');
const completedTransfers = transfers.transfers.map(item => ({ ...item,
  status: paths.has(item.path) ? 'fully_reviewed_prime_qa_pass' : 'pending' }));
if (completedTransfers.some(item => item.status !== 'fully_reviewed_prime_qa_pass')) throw new Error('Incomplete transfers');
writeFileSync(transfersPath, JSON.stringify({ ...transfers, transfers: completedTransfers }, null, 2) + '\n');
process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
