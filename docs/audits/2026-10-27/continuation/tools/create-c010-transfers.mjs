#!/usr/bin/env node
// Preserve failed role ownership while transferring exact unreviewed paths.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'docs/audits/2026-10-27/continuation');
const batch = 'C010', source = 'd67b2a4a4897b4a73d21aba630fc5ab52ff9169b';
const roster = JSON.parse(readFileSync(join(root, 'checkpoints', 'C010-d67b2a4a-assignment-roster.json'), 'utf8'));
if (roster.batch !== batch || roster.source_commit !== source) throw new Error('Roster identity mismatch');
function reviewer(item) {
  const p = item.path;
  if (item.assigned_reviewer === 'W6') {
    if (p.startsWith('packages/employee-client/') ||
      /native-check-in-workflow|native-condition-photo-camera|native-condition-photo-owner/.test(p)) return 'W2';
    if (p.includes('/i18n/') || p.includes('/test/')) return 'W5';
    return 'W4';
  }
  if (item.assigned_reviewer === 'W7') {
    if (p.startsWith('packages/contracts/')) return 'Prime';
    if (/^apps\/api\/test\/(?:anti-abuse|api-|app\.controller)/.test(p) ||
      p.includes('issue319-private-ownership.test')) return 'W1';
    if (p.includes('runtime-metric-window') || p.includes('issue336-evidence-summary') ||
      p.includes('vitest.config.mjs')) return 'W3';
    return 'W4';
  }
  throw new Error('Unexpected original role: ' + item.assigned_reviewer);
}
const transfers = roster.assignments
  .filter(item => item.assigned_reviewer === 'W6' || item.assigned_reviewer === 'W7')
  .map(item => ({ batch, source_commit: source, path: item.path,
    original_owner: item.assigned_reviewer, actual_reviewer: reviewer(item),
    reason: 'Original COS worker failed during browser-conversation startup before receiving task',
    status: 'assigned_pending_review',
    result_path: `D:/kndoom/vaylet test onely/tmp/cos-audit-20261029-results/${reviewer(item)}/C010-transferred-${item.assigned_reviewer}-review-records.json`,
  }));
const counts = Object.fromEntries([...new Set(transfers.map(item => item.actual_reviewer))]
  .map(w => [w, transfers.filter(item => item.actual_reviewer === w).length]));
if (transfers.length !== 50 || new Set(transfers.map(item => item.path)).size !== 50 ||
  counts.W1 !== 7 || counts.W2 !== 13 || counts.W3 !== 5 || counts.W4 !== 17 || counts.W5 !== 4 || counts.Prime !== 4) {
  throw new Error('Unexpected transfer counts: ' + JSON.stringify(counts));
}
const output = join(root, 'checkpoints', 'C010-d67b2a4a-ownership-transfers.json');
if (existsSync(output)) throw new Error('Refusing to overwrite existing transfer record');
writeFileSync(output, JSON.stringify({ batch, source_commit: source, original_failed_roles: ['W6', 'W7'], counts, transfers }, null, 2) + '\n');
process.stdout.write(JSON.stringify({ total: transfers.length, counts }, null, 2) + '\n');
