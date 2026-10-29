#!/usr/bin/env node
// Single-use C010 immutable assignment roster; execute once after source rebaseline.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'docs/audits/2026-10-27/continuation');
const source = 'd67b2a4a4897b4a73d21aba630fc5ab52ff9169b';
const path = join(root, 'rebaselines', source);
const summary = JSON.parse(readFileSync(join(path, 'summary.json'), 'utf8'));
if (summary.current_source_sha !== source) throw new Error('Source changed');
const newFiles = JSON.parse(readFileSync(join(path, 'new-source-candidates.json'), 'utf8'));
const staleFiles = JSON.parse(readFileSync(join(path, 'invalidated-published-reviews.json'), 'utf8'));
const remaining = readFileSync(join(path, 'current-remaining-files.txt'), 'utf8').trim().split('\n');
const byPath = new Map(remaining.map(item => [item, true]));
const priority = [...staleFiles, ...newFiles].map(item => item.path);
if (new Set(priority).size !== priority.length || priority.some(item => !byPath.has(item))) throw new Error('Priority files not in remaining inventory');

function owner(file) {
  if (file.startsWith('apps/customer/')) return 'W5';
  if (file.startsWith('apps/dashboard/')) return 'W4';
  if (file.startsWith('apps/valet-native/') || file.startsWith('packages/employee-client/') || file.startsWith('apps/valet/')) return 'W6';
  if (file.startsWith('packages/database/') || file.startsWith('packages/testing/')) return 'W3';
  if (file.startsWith('packages/') || file.startsWith('scripts/') || file.startsWith('.github/')) return 'W7';
  if (file.startsWith('apps/api/src/common/database/')) return 'W3';
  if (/^apps\/api\/test\/(?:postgres|pool-|database-operation|staff-context-lease|intake-independent-concurrency|intake-operation-concurrency)/.test(file)) return 'W3';
  if (file.startsWith('apps/api/src/modules/check-in-api/') || file.startsWith('apps/api/src/modules/vehicle-photos/') || file.startsWith('apps/api/src/modules/valet-sessions/')) return 'W2';
  if (/^apps\/api\/test\/(?:condition-photo|intake-|feature-check-in)/.test(file)) return 'W2';
  if (file.startsWith('apps/api/src/') || file.startsWith('apps/api/test/') && /auth|health|staff|dashboard/.test(file)) return 'W1';
  return 'W7';
}
const selection = new Map(); const counts = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`W${i + 1}`, 0]));
for (const file of priority) {
  const w = owner(file);
  selection.set(file, w); counts[w]++;
}
const target = 25;
for (let i = 1; i <= 7; i++) {
  const worker = `W${i}`;
  for (const file of remaining) {
    if (counts[worker] >= target) break;
    if (!selection.has(file) && owner(file) === worker) { selection.set(file, worker); counts[worker]++; }
  }
}
const batch = 'C010';
const roster = [...selection].map(([file, worker]) => ({
  batch, source_commit: source, path: file, original_owner: worker,
  assigned_reviewer: worker, status: 'assigned', priority: priority.includes(file) ? 'main_delta' : 'unreviewed_inventory',
  result_path: `D:/kndoom/vaylet test onely/tmp/cos-audit-20261029-results/${worker}/C010-${worker}-review-records.json`,
})).sort((a, b) => a.assigned_reviewer.localeCompare(b.assigned_reviewer) || a.path.localeCompare(b.path));
if (new Set(roster.map(item => item.path)).size !== roster.length || priority.some(file => !selection.has(file))) throw new Error('Overlapping or missing priority assignment');
const output = join(root, 'checkpoints', 'C010-d67b2a4a-assignment-roster.json');
if (existsSync(output)) throw new Error('Existing immutable C010 roster; refusing overwrite');
writeFileSync(output, JSON.stringify({ batch, source_commit: source, source_tree: summary.current_tree_sha, immutable: true, workers: counts, assignments: roster }, null, 2) + '\n');
process.stdout.write(JSON.stringify({ batch, source, priority: priority.length, total: roster.length, worker_counts: counts, roster: output }, null, 2) + '\n');
