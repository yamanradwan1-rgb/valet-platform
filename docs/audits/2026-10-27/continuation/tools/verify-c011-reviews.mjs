#!/usr/bin/env node
// Prime independent C011 quality gate. Never credits worker claims without canonical blob proof.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [sourceArg, continuationArg, resultsArg, strictFlag] = process.argv.slice(2);
if (!sourceArg || !continuationArg || !resultsArg) throw new Error('Usage: verify-c011-reviews.mjs SOURCE_DIR CONTINUATION_DIR RESULTS_DIR [--strict]');
const source = resolve(sourceArg), root = resolve(continuationArg), results = resolve(resultsArg);
const fullSha = 'd67b2a4a4897b4a73d21aba630fc5ab52ff9169b', tree = '8731302512f8db4edb8bbb1cdc50b208a0dcb5b8';
const git = (...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' }).trim();
if (git('rev-parse','HEAD') !== fullSha || git('rev-parse','HEAD^{tree}') !== tree || git('status','--porcelain')) throw new Error('Pinned source changed');

const roster = JSON.parse(readFileSync(join(root, 'checkpoints', 'C011-d67b2a4a-assignment-roster.json'), 'utf8'));
const handoffs = JSON.parse(readFileSync(join(root, 'checkpoints', 'C011-d67b2a4a-ownership-transfers.json'), 'utf8'));
const fallback = JSON.parse(readFileSync(join(root, 'checkpoints', 'C011-d67b2a4a-w1-fallback-addendum.json'), 'utf8'));
if (roster.source_commit !== fullSha || roster.source_tree !== tree || roster.assignments.length !== 175 ||
    handoffs.source_commit !== fullSha || ![50,75].includes(handoffs.transfers.length) || !roster.immutable ||
    fallback.source_commit !== fullSha || fallback.transfers.length !== 35) throw new Error('Roster provenance mismatch');
const byPath = new Map(roster.assignments.map(item => [item.path, item]));
if (byPath.size !== 175) throw new Error('Duplicate roster path');
const fallbackMap = new Map(fallback.transfers.map(item => [item.path, item]));
if (fallbackMap.size !== 35) throw new Error('Duplicate fallback transfer');
for (const [path, item] of fallbackMap) {
  const original = byPath.get(path);
  if (!original || original.assigned_reviewer !== 'W1' || item.original_assigned_reviewer !== 'W1' ||
      item.original_owner !== original.original_owner || !['W2','W4'].includes(item.actual_reviewer)) {
    throw new Error('Fallback membership invalid: '+path);
  }
}
const effectiveReviewer = assignment => fallbackMap.get(assignment.path)?.actual_reviewer ?? assignment.assigned_reviewer;
const transferMap = new Map(handoffs.transfers.map(item => [item.path, item]));
if (transferMap.size !== handoffs.transfers.length) throw new Error('Duplicate transfer path');
for (const [path, handoff] of transferMap) {
  const a = byPath.get(path);
  const reviewer = handoffs.transfers.length === 75 ? effectiveReviewer(a ?? {}) : a?.assigned_reviewer;
  if (!a || a.original_owner !== handoff.original_owner || reviewer !== handoff.actual_reviewer ||
      reviewer === a.original_owner) throw new Error('Invalid original owner transfer: ' + path);
}
if (handoffs.transfers.length === 75) {
  for (const item of roster.assignments) {
    const needsTransfer = effectiveReviewer(item) !== item.original_owner;
    if (transferMap.has(item.path) !== needsTransfer) throw new Error('Effective transfer accounting mismatch: ' + item.path);
  }
}

const expectedFiles = new Map();
for (const item of roster.assignments) {
  const reviewer = effectiveReviewer(item);
  const basename = item.original_owner === reviewer
    ? `C011-${reviewer}-review-records.json`
    : `C011-transferred-${item.original_owner}-review-records.json`;
  const file = join(results, reviewer, basename);
  if (!expectedFiles.has(file)) expectedFiles.set(file, []);
  expectedFiles.get(file).push(item.path);
}
const entries = execFileSync('git', ['-C', source, 'ls-tree', '-rz', 'HEAD']).toString('utf8').split('\0').filter(Boolean);
const blobs = new Map(entries.map(raw => {
  const match = /^\d+ blob ([a-f0-9]{40})\t(.+)$/.exec(raw);
  if (!match) throw new Error('Unexpected source tree entry: ' + raw);
  return [match[2],match[1]];
}));
const cached = new Map();
function blobMetadata(path) {
  if (cached.has(path)) return cached.get(path);
  if (!blobs.has(path)) throw new Error('Source path missing: ' + path);
  const bytes = execFileSync('git', ['-C', source, 'cat-file', 'blob', blobs.get(path)], { maxBuffer: 30 * 1024 * 1024 });
  const text = bytes.toString('utf8');
  const value = { source_sha256: createHash('sha256').update(bytes).digest('hex'), lines: text ? text.split('\n').length - Number(text.endsWith('\n')) : 0 };
  cached.set(path, value); return value;
}

const accepted = [], errors = [], seen = new Set(), files = [];
for (const [file, expectedPaths] of expectedFiles) {
  if (!existsSync(file)) continue;
  let records;
  try { records = JSON.parse(readFileSync(file, 'utf8')); }
  catch(error) { errors.push(`Invalid JSON ${file}: ${error}`); continue; }
  if (!Array.isArray(records)) { errors.push(`Expected array: ${file}`); continue; }
  files.push({ file, records: records.length, expected: expectedPaths.length });
  const expected = new Set(expectedPaths);
  for (const record of records) {
    const path = record.path;
    if (!path || !expected.has(path)) { errors.push(`Path not in assigned result file ${file}: ${path}`); continue; }
    if (seen.has(path)) { errors.push(`Duplicate completed path: ${path}`); continue; }
    seen.add(path);
    const assignment = byPath.get(path), meta = blobMetadata(path);
    const flaws = [];
    if (record.batch !== 'C011' || record.source_commit !== fullSha) flaws.push('batch/source mismatch');
    if (record.status !== 'fully_reviewed') flaws.push('status partial');
    if (record.source_sha256 !== meta.source_sha256) flaws.push('canonical blob SHA256 mismatch');
    const normalize = value => String(value ?? '').toUpperCase().replace(/^WORKER-/, 'W');
    if (normalize(record.original_owner ?? record.original_worker ?? record.worker) !== assignment.original_owner) flaws.push('original owner mismatch');
    if (normalize(record.actual_reviewer ?? record.reviewer) !== effectiveReviewer(assignment)) flaws.push('actual reviewer mismatch');
    const ranges = (record.read_ranges ?? []).map(x => Array.isArray(x) ? { start: x[0], end: x[1] } : x).sort((a,b) => a.start - b.start);
    if (!ranges.length || ranges[0].start !== 1 || ranges.at(-1).end !== meta.lines) flaws.push('incomplete read ranges');
    for (let index = 0; index < ranges.length; index++) {
      const x = ranges[index];
      if (!Number.isInteger(x.start) || !Number.isInteger(x.end) || x.start > x.end || x.end > meta.lines ||
          index && x.start !== ranges[index - 1].end + 1) flaws.push('gap/overlap/invalid read ranges');
    }
    for (const key of ['semantic_review_notes','callers_consumers','invariants_error_checks','limits']) {
      if (typeof record[key] !== 'string' || record[key].trim().length < 25) flaws.push(`thin ${key}`);
    }
    if (!Array.isArray(record.test_refs ?? record.test_references) || !(record.test_refs ?? record.test_references).length) flaws.push('no test references/context');
    if (!Array.isArray(record.finding_ids ?? [])) flaws.push('finding IDs not array');
    if (flaws.length) errors.push(`${path}: ${[...new Set(flaws)].join(', ')}`);
    else accepted.push({ path, original_owner: assignment.original_owner, actual_reviewer: effectiveReviewer(assignment), source_sha256: meta.source_sha256, lines: meta.lines, record_file: file, finding_ids: record.finding_ids ?? [] });
  }
}
const missing = roster.assignments.map(item => item.path).filter(path => !seen.has(path));
const report = { batch:'C011', source_commit:fullSha, tree, expected:175, valid:accepted.length, invalid:errors.length, missing:missing.length,
  initial_ownership_transfers:50, fallback_transfers:35, effective_unique_transfers:75,
  current_base_files:1781, current_base_lines:206343, if_accepted_files:1781+accepted.length,
  if_accepted_lines:206343+accepted.reduce((n,x)=>n+x.lines,0), source_files:files, errors, missing_paths:missing,
  tests:'NOT_EXECUTED — STATIC_AUDIT_ONLY' };
writeFileSync(join(results,'Prime','C011-qa-provisional.json'),JSON.stringify(report,null,2)+'\n');
writeFileSync(join(results,'Prime','C011-qa-accepted.json'),JSON.stringify(accepted,null,2)+'\n');
console.log(JSON.stringify({ expected:175,valid:report.valid,invalid:report.invalid,missing:report.missing,files,errors:errors.slice(0,12) },null,2));
if (errors.length || strictFlag === '--strict' && missing.length) process.exitCode=1;
