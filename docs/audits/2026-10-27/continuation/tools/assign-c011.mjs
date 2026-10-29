#!/usr/bin/env node
// Deterministic C011 roster from the remotely verified C010 remaining inventory.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('Usage: assign-c011.mjs <continuation-root>');
const checkpoint = join(root, 'checkpoints');
const source = 'd67b2a4a4897b4a73d21aba630fc5ab52ff9169b';
const tree = '8731302512f8db4edb8bbb1cdc50b208a0dcb5b8';
const summary = JSON.parse(readFileSync(join(checkpoint, 'C010-d67b2a4a-coverage-summary.json'), 'utf8'));
if (summary.source_commit !== source || summary.current_remaining !== 2998 || summary.current_fully_reviewed !== 1781) {
  throw new Error('C010 is not the pinned published baseline');
}
const remaining = readFileSync(join(checkpoint, 'C010-d67b2a4a-current-remaining.txt'), 'utf8').trimEnd().split('\n').map(x => x.trim());
if (remaining.length !== 2998 || new Set(remaining).size !== remaining.length) throw new Error('C010 remaining inventory is invalid');

const used = new Set();
const roles = [
  { owner: 'W1', count: 25, accepts: p => p.startsWith('apps/api/src/modules/management/') && !/guest|customer/.test(p), order: [/authorization|permission|audit|privacy/, /controller|service/, /.*/] },
  { owner: 'W2', count: 25, accepts: p => /^apps\/api\/src\/modules\/(valet-sessions|parking|retrieval|tracking|shifts)\//.test(p) && !/guest/.test(p), order: [/command|state|audit|concurren|session/, /.*/] },
  { owner: 'W3', count: 25, accepts: p => p.startsWith('packages/database/'), order: [/security|migration|integrity|constraint|transaction/, /.*/] },
  { owner: 'W4', count: 25, accepts: p => p.startsWith('apps/dashboard/src/'), order: [/auth|permission|session|location|operations/, /.*/] },
  { owner: 'W5', count: 25, accepts: p => p.startsWith('apps/api/test/guest-') || p.startsWith('apps/api/src/modules/management/guest-information-'), order: [/authoriz|session|concurren|tenant|privacy|race/, /.*/] },
  { owner: 'W6', count: 25, accepts: p => p.startsWith('apps/valet-native/src/'), order: [/auth|session|offlin|queue|i18n|location|permission/, /.*/] },
  { owner: 'W7', count: 25, accepts: p => p.startsWith('packages/contracts/'), order: [/session|shift|auth|role|audit|presence/, /.*/] },
];
const transfersTo = {
  W6: ['W2','W2','W2','W2','W2','W2','W2','W2','W2','W2', 'W4','W4','W4','W4','W4','W4','W4','W4','W4','W4', 'W5','W5','W5','W5','W5'],
  W7: ['W1','W1','W1','W1','W1','W1','W1','W1','W1','W1', 'W3','W3','W3','W3','W3','W3','W3','W3','W3','W3', 'W5','W5','W5','W5','W5'],
};
const assignments = [];
const transfers = [];
const resultRoot = 'D:/kndoom/vaylet test onely/tmp/cos-audit-20261029-results';
for (const role of roles) {
  const rank = p => role.order.findIndex(re => re.test(p));
  const picks = remaining.filter(p => !used.has(p) && role.accepts(p))
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).slice(0, role.count);
  if (picks.length !== role.count) throw new Error(`Only ${picks.length} available for ${role.owner}`);
  picks.forEach((path, i) => {
    if (used.has(path)) throw new Error('Duplicate path ' + path);
    used.add(path);
    const actual = transfersTo[role.owner]?.[i] ?? role.owner;
    const resultFile = role.owner === actual ? `C011-${actual}-review-records.json` : `C011-transferred-${role.owner}-review-records.json`;
    const resultPath = `${resultRoot}/${actual}/${resultFile}`;
    assignments.push({ batch: 'C011', source_commit: source, path, original_owner: role.owner, assigned_reviewer: actual, status: 'assigned', priority: 'unreviewed_current_source', result_path: resultPath });
    if (role.owner !== actual) transfers.push({ batch: 'C011', source_commit: source, path, original_owner: role.owner, actual_reviewer: actual,
      reason: 'Original COS W6/W7 conversations failed before receiving tasks; direct reassignment in immutable C011 roster', status: 'assigned_pending_review', result_path: resultPath });
  });
}
if (assignments.length !== 175 || transfers.length !== 50 || used.size !== 175) throw new Error('Invalid assignment totals');
for (const worker of ['W1','W2','W3','W4','W5']) {
  if (assignments.filter(a => a.assigned_reviewer === worker).length !== 35) throw new Error('Reviewer capacity imbalance: ' + worker);
}
const batch = { batch: 'C011', source_commit: source, source_tree: tree, immutable: true, previous_published_audit_commit: 'db7501715316fa75705e9f96b0b91cd70f3deac6', workers: Object.fromEntries(roles.map(x => [x.owner, x.count])), actual_reviewers: Object.fromEntries(['W1','W2','W3','W4','W5'].map(w => [w, 35])), assignments };
writeFileSync(join(checkpoint, 'C011-d67b2a4a-assignment-roster.json'), JSON.stringify(batch, null, 2) + '\n');
writeFileSync(join(checkpoint, 'C011-d67b2a4a-ownership-transfers.json'), JSON.stringify({ batch: 'C011', source_commit: source, failed_roles: ['W6','W7'], count: transfers.length, transfers }, null, 2) + '\n');
console.log(JSON.stringify({ assigned: assignments.length, owners: batch.workers, actualReviewers: batch.actual_reviewers, ownershipTransfers: transfers.length, remainingAfterC011IfAccepted: remaining.length - assignments.length }));
