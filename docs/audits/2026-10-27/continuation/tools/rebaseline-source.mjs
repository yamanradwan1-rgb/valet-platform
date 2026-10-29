#!/usr/bin/env node
// Documentation-only, deterministic current-source rebaseline. Never edits product source.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';

const [sourceArg, continuationArg, previousSha] = process.argv.slice(2);
if (!sourceArg || !continuationArg || !previousSha) {
  throw new Error('Usage: node rebaseline-source.mjs SOURCE_DIR CONTINUATION_DIR PREVIOUS_SOURCE_SHA');
}
const source = resolve(sourceArg);
const continuation = resolve(continuationArg);
const previousLedgerPath = join(continuation, 'checkpoints', 'C009-2c181fc3-current-ledger.csv');
const sourceGit = (...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024 }).trim();
const sha = sourceGit('rev-parse', 'HEAD');
const tree = sourceGit('rev-parse', 'HEAD^{tree}');
if (sourceGit('status', '--porcelain')) throw new Error('Source worktree is not clean');
if (previousSha === sha) throw new Error('New source must differ from the previous source');
const previous = sourceGit('rev-parse', previousSha);
if (previous !== previousSha) throw new Error('Previous source SHA is not exact');

function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
    else if (c === '\n' && !quoted) {
      row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (quoted) throw new Error('Unclosed CSV quoted field');
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headers = rows.shift();
  if (new Set(headers).size !== headers.length) throw new Error('Duplicate CSV columns');
  return { headers, records: rows.map((parts, i) => {
    if (parts.length !== headers.length) throw new Error(`Malformed CSV row ${i + 2}: ${parts.length}`);
    return Object.fromEntries(headers.map((name, j) => [name, parts[j]]));
  }) };
}
const encode = (s) => '"' + String(s ?? '').replaceAll('"', '""') + '"';
const serializeCsv = (headers, records) => [headers.join(','), ...records.map(row => headers.map(key => encode(row[key])).join(','))].join('\n') + '\n';
const base = parseCsv(readFileSync(previousLedgerPath, 'utf8').replace(/^\uFEFF/, ''));
const byPath = new Map(base.records.map(row => [row.path, row]));
if (byPath.size !== base.records.length) throw new Error('Duplicate prior ledger paths');
const priorEligible = base.records.filter(row => row.authored_code_candidate === 'True');
const priorReviewed = priorEligible.filter(row => row.current_status === 'fully_reviewed');
if (base.records.length !== 7509 || priorEligible.length !== 4711 || priorReviewed.length !== 1672) {
  throw new Error('C009 input totals do not match the verified published baseline');
}
const priorLines = priorEligible.reduce((sum, row) => sum + Number(row.lines), 0);
const priorReviewedLines = priorReviewed.reduce((sum, row) => sum + Number(row.lines), 0);
if (priorLines !== 611038 || priorReviewedLines !== 193240) throw new Error('C009 line totals differ from published evidence');

const entries = execFileSync('git', ['-C', source, 'ls-tree', '-rz', 'HEAD'], { maxBuffer: 10 * 1024 * 1024 })
  .toString('utf8').split('\0').filter(Boolean);
const blobs = new Map(entries.map(item => {
  const match = /^(\d+) blob ([0-9a-f]{40})\t(.+)$/.exec(item);
  if (!match) throw new Error('Unexpected Git tree entry: ' + item);
  return [match[3], { mode: match[1], oid: match[2] }];
}));
const codes = new Set(['.ts', '.tsx', '.mjs', '.sql', '.js', '.ps1', '.cjs', '.prisma', '.kt']);
const category = (path) => {
  if (path.startsWith('apps/api/')) return 'backend';
  if (path.startsWith('apps/customer/')) return 'customer';
  if (path.startsWith('apps/dashboard/')) return 'dashboard';
  if (path.startsWith('apps/valet-native/')) return 'native';
  if (path.startsWith('apps/valet/')) return 'employee';
  if (path.startsWith('packages/database/')) return 'database';
  if (path.startsWith('packages/contracts/')) return 'contracts';
  if (path.startsWith('packages/employee-client/')) return 'employee';
  if (path.startsWith('packages/')) return 'packages';
  if (path.startsWith('scripts/') || path.startsWith('.github/')) return 'infrastructure';
  return 'root_or_other';
};
const diffZ = execFileSync('git', ['-C', source, 'diff', '--name-status', '-z', '--find-renames', previous, sha]);
const parts = diffZ.toString('utf8').split('\0').filter(Boolean);
const changes = []; const changeByPath = new Map();
for (let i = 0; i < parts.length;) {
  const status = parts[i++]; const oldPath = parts[i++];
  const path = /^[RC]/.test(status) ? parts[i++] : oldPath;
  const change = { status, path, ...(oldPath !== path ? { previous_path: oldPath } : {}) };
  changes.push(change); changeByPath.set(path, change);
}
const gitBytes = (path) => {
  const item = blobs.get(path);
  if (!item) throw new Error('Missing current Git blob: ' + path);
  return execFileSync('git', ['-C', source, 'cat-file', 'blob', item.oid], { maxBuffer: 30 * 1024 * 1024 });
};
const contentMeta = (path) => {
  const bytes = gitBytes(path), text = bytes.toString('utf8');
  return { sha256: createHash('sha256').update(bytes).digest('hex'), lines: text.length ? text.split('\n').length - Number(text.endsWith('\n')) : 0 };
};
const reviewedStale = [], reusable = [], newCandidates = [], removed = [], next = [];
for (const previousRow of base.records) {
  const row = { ...previousRow }, change = changeByPath.get(row.path);
  if (!blobs.has(row.path)) {
    removed.push({ path: row.path, prior_status: row.current_status, eligible: row.authored_code_candidate === 'True' });
    continue;
  }
  row.current_baseline_sha = sha;
  if (change) {
    const meta = contentMeta(row.path);
    row.lines = String(meta.lines);
    row.current_source_sha256 = meta.sha256;
    if (row.authored_code_candidate === 'True' && row.current_status === 'fully_reviewed') {
      reviewedStale.push({ path: row.path, previous_review_batch: row.current_review_batch || row.audit_batch, previous_reviewer: row.current_reviewer || row.reviewer, previous_hash: previousRow.current_source_sha256, new_hash: meta.sha256, old_lines: Number(previousRow.lines), new_lines: meta.lines });
      row.current_status = 'not_reviewed'; row.classification = 'MODIFIED_REVIEW_STALE';
      row.current_review_batch = ''; row.current_reviewer = ''; row.current_review_source_sha256 = '';
      row.current_review_notes = 'Changed since completed review; full current-source semantic review required.';
      row.current_review_finding_ids = '';
    } else row.classification = 'PREVIOUSLY_UNREVIEWED';
  } else {
    row.classification = row.authored_code_candidate === 'True' && row.current_status === 'fully_reviewed'
      ? 'UNCHANGED_REVIEW_VALID' : 'PREVIOUSLY_UNREVIEWED';
    if (row.authored_code_candidate === 'True' && row.current_status === 'fully_reviewed') reusable.push({ path: row.path, sha256: row.current_source_sha256, previous_review_batch: row.current_review_batch || row.audit_batch });
  }
  next.push(row);
}
for (const [path] of blobs) {
  if (byPath.has(path)) continue;
  const meta = contentMeta(path), eligible = codes.has(extname(path).toLowerCase());
  const row = Object.fromEntries(base.headers.map(key => [key, '']));
  Object.assign(row, {
    path, category: category(path), lines: String(meta.lines), status: 'not_reviewed',
    authored_code_candidate: String(eligible ? 'True' : 'False'), starting_status: 'not_reviewed',
    source_commit: sha, current_baseline_sha: sha, current_source_sha256: meta.sha256,
    current_status: 'not_reviewed', classification: 'NEW_UNREVIEWED',
    review_notes: 'New current-main path; not previously credited.',
  });
  next.push(row);
  if (eligible) newCandidates.push({ path, sha256: meta.sha256, lines: meta.lines, category: row.category });
}
next.sort((a, b) => a.path.localeCompare(b.path, 'en'));
if (next.length !== blobs.size || new Set(next.map(row => row.path)).size !== next.length) throw new Error('Current-source tracked-path accounting failed');
const eligible = next.filter(row => row.authored_code_candidate === 'True');
const reviewed = eligible.filter(row => row.current_status === 'fully_reviewed');
const remaining = eligible.filter(row => row.current_status !== 'fully_reviewed');
const totalLines = eligible.reduce((sum, row) => sum + Number(row.lines), 0);
const reviewedLines = reviewed.reduce((sum, row) => sum + Number(row.lines), 0);
if (reviewed.length !== priorReviewed.length - reviewedStale.length || eligible.length !== priorEligible.length + newCandidates.length - removed.filter(row => row.eligible).length) throw new Error('Rebaseline accounting invariant failed');
const summary = {
  checkpoint: 'REBASELINE-' + sha.slice(0, 8), previous_source_sha: previous, current_source_sha: sha, current_tree_sha: tree,
  published_audit_commit: sourceGit('rev-parse', 'refs/remotes/origin/audit/vaylet-full-audit-2026-10-27'),
  current_tracked: next.length, prior_tracked: base.records.length,
  changed_paths: changes.length, added_paths: changes.filter(item => item.status.startsWith('A')).length,
  modified_paths: changes.filter(item => item.status.startsWith('M')).length,
  removed_paths: removed.length, renamed_paths: changes.filter(item => /^[RC]/.test(item.status)).length,
  stale_reviewed: reviewedStale.length, reusable_reviewed: reusable.length,
  new_source_candidates: newCandidates.length, candidate_files: eligible.length,
  candidate_lines: totalLines, current_fully_reviewed: reviewed.length,
  current_reviewed_lines: reviewedLines, current_remaining: remaining.length,
  file_percent: reviewed.length / eligible.length * 100,
  line_percent: reviewedLines / totalLines * 100,
  runtime_tests_executed: 0, dependency_impact_review: 'PENDING_TARGETED_REVIEW',
};
const output = join(continuation, 'rebaselines', sha);
mkdirSync(output, { recursive: true });
const saveJson = (name, data) => writeFileSync(join(output, name), JSON.stringify(data, null, 2) + '\n');
saveJson('summary.json', summary);
saveJson('git-diff-inventory.json', changes);
saveJson('invalidated-published-reviews.json', reviewedStale);
saveJson('reusable-published-reviews.json', reusable);
saveJson('new-source-candidates.json', newCandidates);
saveJson('historical-removed-files.json', removed);
saveJson('verification.json', { source_clean: true, source_tree: tree, unique_current_paths: true, matched_prior_C009_totals: true, duplicate_coverage: false, runtime_tests_executed: 0, limitations: ['Dependency-impact review remains pending', 'New and changed source not yet semantically reviewed'] });
writeFileSync(join(output, 'current-coverage-ledger.csv'), serializeCsv(base.headers, next));
writeFileSync(join(output, 'current-remaining-files.txt'), remaining.map(row => row.path).join('\n') + '\n');
process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
