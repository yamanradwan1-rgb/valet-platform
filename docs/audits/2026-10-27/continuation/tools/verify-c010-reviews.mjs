#!/usr/bin/env node
// Prime quality gate: source identity, path ownership, canonical hashes, ranges and substantive records.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [sourceArg, continuationArg, resultsArg, strictArg] = process.argv.slice(2);
if (!sourceArg || !continuationArg || !resultsArg) throw new Error('Usage: verify-c010-reviews.mjs SOURCE_DIR CONTINUATION_DIR RESULTS_DIR [--strict]');
const source = resolve(sourceArg), root = resolve(continuationArg), results = resolve(resultsArg);
const fullSha = 'd67b2a4a4897b4a73d21aba630fc5ab52ff9169b';
const tree = '8731302512f8db4edb8bbb1cdc50b208a0dcb5b8';
const git = (...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' }).trim();
if (git('rev-parse', 'HEAD') !== fullSha || git('rev-parse', 'HEAD^{tree}') !== tree || git('status', '--porcelain')) throw new Error('Pinned source changed');
const roster = JSON.parse(readFileSync(join(root, 'checkpoints', 'C010-d67b2a4a-assignment-roster.json'), 'utf8'));
const transfer = JSON.parse(readFileSync(join(root, 'checkpoints', 'C010-d67b2a4a-ownership-transfers.json'), 'utf8'));
if (roster.source_commit !== fullSha || transfer.source_commit !== fullSha) throw new Error('Roster source mismatch');
const byPath = new Map(roster.assignments.map(item => [item.path, item]));
const moved = new Map(transfer.transfers.map(item => [item.path, item]));
const roleName = value => String(value ?? '').toLowerCase().replace(/^worker-([1-7])$/, 'w$1');
const files = [
  ...['W1', 'W2', 'W3', 'W4', 'W5'].map(w => [w, `C010-${w}-review-records.json`]),
  ['W1', 'C010-transferred-W7-review-records.json'],
  ['W2', 'C010-transferred-W6-review-records.json'],
  ['W3', 'C010-transferred-W7-review-records.json'],
  ['W4', 'C010-transferred-W6-review-records.json'],
  ['W4', 'C010-transferred-W7-review-records.json'],
  ['W5', 'C010-transferred-W6-review-records.json'],
  ['Prime', 'C010-transferred-W7-review-records.json'],
];
const entries = execFileSync('git', ['-C', source, 'ls-tree', '-rz', 'HEAD']).toString('utf8').split('\0').filter(Boolean);
const blobs = new Map(entries.map(item => {
  const match = /^\d+ blob ([a-f0-9]{40})\t(.+)$/.exec(item);
  if (!match) throw new Error('Unexpected source tree entry ' + item);
  return [match[2], match[1]];
}));
const blobMeta = new Map();
function metadata(path) {
  if (blobMeta.has(path)) return blobMeta.get(path);
  if (!blobs.has(path)) throw new Error('Missing source file ' + path);
  const bytes = execFileSync('git', ['-C', source, 'cat-file', 'blob', blobs.get(path)], { maxBuffer: 30 * 1024 * 1024 });
  const text = bytes.toString('utf8');
  const value = { hash: createHash('sha256').update(bytes).digest('hex'), lines: text.length ? text.split('\n').length - Number(text.endsWith('\n')) : 0 };
  blobMeta.set(path, value);
  return value;
}
const accepted = [], errors = [], seen = new Set(), sourceFiles = [];
for (const [owner, basename] of files) {
  const file = join(results, owner, basename);
  if (!existsSync(file)) continue;
  let records;
  try { records = JSON.parse(readFileSync(file, 'utf8')); }
  catch (error) { errors.push(`${file}: invalid JSON ${String(error)}`); continue; }
  if (!Array.isArray(records)) { errors.push(`${file}: expected JSON array`); continue; }
  sourceFiles.push({ owner, basename, records: records.length });
  for (const item of records) {
    const path = item.path;
    if (!path || !byPath.has(path)) { errors.push(`Unknown path in ${basename}: ${path}`); continue; }
    if (seen.has(path)) { errors.push(`Duplicate reviewed path ${path}`); continue; }
    seen.add(path);
    const original = byPath.get(path), handoff = moved.get(path);
    const expectedReviewer = handoff?.actual_reviewer ?? original.assigned_reviewer;
    const expectedOriginal = handoff?.original_owner ?? original.original_owner;
    const hash = metadata(path);
    const issue = [];
    if (owner !== expectedReviewer || roleName(item.actual_reviewer ?? item.reviewer) !== roleName(expectedReviewer)) issue.push('actual reviewer/owner mismatch');
    if (roleName(item.original_owner ?? item.original_worker ?? item.worker) !== roleName(expectedOriginal)) issue.push('original owner mismatch');
    if (item.source_commit !== fullSha || item.batch !== 'C010') issue.push('source/batch mismatch');
    if (item.source_sha256 !== hash.hash) issue.push('content SHA256 mismatch');
    if (item.status !== 'fully_reviewed') issue.push('partial status');
    const ranges = (item.read_ranges ?? []).map(r => Array.isArray(r) ? { start: r[0], end: r[1] } : r).sort((a,b) => a.start-b.start);
    if (!ranges.length || ranges[0].start !== 1 || ranges.at(-1).end !== hash.lines) issue.push('incomplete read range');
    for (let k = 0; k < ranges.length; k++) {
      const r = ranges[k];
      if (!Number.isInteger(r.start) || !Number.isInteger(r.end) || r.start > r.end || r.end > hash.lines || k && r.start > ranges[k - 1].end + 1) issue.push('invalid/gapped line range');
    }
    for (const field of ['semantic_review_notes', 'callers_consumers', 'invariants_error_checks', 'limits']) {
      if (typeof item[field] !== 'string' || item[field].trim().length < 25) issue.push(`thin/missing ${field}`);
    }
    if (!Array.isArray(item.test_refs ?? item.test_references) || (item.test_refs ?? item.test_references).length === 0) issue.push('missing test context');
    if (issue.length) errors.push(`${path}: ${[...new Set(issue)].join('; ')}`);
    else accepted.push({ path, original_owner: expectedOriginal, actual_reviewer: expectedReviewer, source_sha256: hash.hash, lines: hash.lines, record_file: file, finding_ids: item.finding_ids ?? [] });
  }
}
const missing = roster.assignments.map(item => item.path).filter(path => !seen.has(path));
const summary = {
  source_commit: fullSha, tree, batch: 'C010', expected: roster.assignments.length,
  valid: accepted.length, invalid: errors.length, missing: missing.length,
  currently_credited_base: 1620, provisional_fully_reviewed_if_QA_accepted: 1620 + accepted.length,
  provisional_reviewed_lines_if_QA_accepted: 187430 + accepted.reduce((sum, item) => sum + item.lines, 0),
  source_files: sourceFiles, errors, missing_paths: missing,
  tests: 'NOT_EXECUTED — STATIC_AUDIT_ONLY',
};
writeFileSync(join(results, 'Prime', 'C010-qa-provisional.json'), JSON.stringify(summary, null, 2) + '\n');
writeFileSync(join(results, 'Prime', 'C010-qa-accepted.json'), JSON.stringify(accepted, null, 2) + '\n');
process.stdout.write(JSON.stringify({ expected: summary.expected, valid: summary.valid, invalid: summary.invalid, missing: summary.missing, source_files: sourceFiles, errors: errors.slice(0, 15) }, null, 2) + '\n');
if (errors.length || strictArg === '--strict' && missing.length) process.exitCode = 1;
