#!/usr/bin/env node
// Independent blob-hash and assignment QA for RB-002, source read-only.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [sourceArg, continuationArg] = process.argv.slice(2);
if (!sourceArg || !continuationArg) throw new Error('Usage: verify-rebaseline-source.mjs SOURCE_DIR CONTINUATION_DIR');
const source = resolve(sourceArg), root = resolve(continuationArg);
const sourceSha = 'd67b2a4a4897b4a73d21aba630fc5ab52ff9169b';
const dir = join(root, 'rebaselines', sourceSha);
const readJson = name => JSON.parse(readFileSync(join(dir, name), 'utf8'));
const summary = readJson('summary.json');
const newFiles = readJson('new-source-candidates.json');
const stale = readJson('invalidated-published-reviews.json');
const reusable = readJson('reusable-published-reviews.json');
const changed = readJson('git-diff-inventory.json');
const roster = JSON.parse(readFileSync(join(root, 'checkpoints', 'C010-d67b2a4a-assignment-roster.json'), 'utf8'));
const git = (...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' }).trim();
if (git('rev-parse', 'HEAD') !== sourceSha || git('rev-parse', 'HEAD^{tree}') !== summary.current_tree_sha) throw new Error('Source identity mismatch');
if (git('status', '--porcelain')) throw new Error('Source changed during QA');
const verifyOne = (item) => {
  const listing = git('ls-tree', 'HEAD', '--', item.path);
  const match = /^\d+ blob ([a-f0-9]{40})\t/.exec(listing);
  if (!match) throw new Error('No Git blob for ' + item.path);
  const bytes = execFileSync('git', ['-C', source, 'cat-file', 'blob', match[1]]);
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== (item.sha256 ?? item.new_hash)) throw new Error('SHA mismatch ' + item.path);
  if (item.lines != null) {
    const body = bytes.toString('utf8');
    const count = body.length ? body.split('\n').length - Number(body.endsWith('\n')) : 0;
    if (count !== item.lines) throw new Error('Line mismatch ' + item.path);
  }
};
if (changed.length !== 138 || newFiles.length !== 68 || stale.length !== 52 || reusable.length !== 1620) throw new Error('Manifest totals mismatch');
for (const item of [...newFiles, ...stale]) verifyOne(item);
const sample = reusable.filter((_, index) => index % 79 === 0);
for (const item of sample) verifyOne(item);
const assignedPaths = roster.assignments.map(item => item.path);
if (assignedPaths.length !== 161 || new Set(assignedPaths).size !== 161) throw new Error('Roster overlap');
const priority = new Set([...newFiles, ...stale].map(item => item.path));
if ([...priority].some(path => !assignedPaths.includes(path))) throw new Error('Missing priority assignment');
const remaining = readFileSync(join(dir, 'current-remaining-files.txt'), 'utf8').trim().split('\n');
if (remaining.length !== summary.current_remaining || new Set(remaining).size !== remaining.length) throw new Error('Remaining inventory mismatch');
const qa = {
  result: 'PASS', source_commit: sourceSha, source_tree: summary.current_tree_sha,
  all_new_blob_sha256_and_line_counts_verified: newFiles.length,
  all_stale_blob_sha256_verified: stale.length,
  unchanged_review_sha256_samples_verified: sample.length,
  unique_C010_assignments: assignedPaths.length,
  mandatory_delta_assignments_verified: priority.size,
  unique_remaining: remaining.length,
  source_clean: true,
  runtime_tests: 'NOT_EXECUTED — STATIC_AUDIT_ONLY',
  limitations: ['Cross-component dependency impact remains to be reviewed', 'Semantic reviews of new/stale paths are pending worker results'],
};
writeFileSync(join(dir, 'independent-qa.json'), JSON.stringify(qa, null, 2) + '\n');
process.stdout.write(JSON.stringify(qa, null, 2) + '\n');
