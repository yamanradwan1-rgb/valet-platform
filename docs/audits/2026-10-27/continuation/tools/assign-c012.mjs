#!/usr/bin/env node
// Immutable C012 assignment from verified, published C011 remaining inventory.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

if (!process.argv[2]) throw new Error('Usage: assign-c012.mjs <continuation-root>');
const root = resolve(process.argv[2]), checkpoint = join(root, 'checkpoints');
const source = 'd67b2a4a4897b4a73d21aba630fc5ab52ff9169b';
const tree = '8731302512f8db4edb8bbb1cdc50b208a0dcb5b8';
const previous = 'b653218e75ccc90d4429530044ab402a67974c72';
const summary = JSON.parse(readFileSync(join(checkpoint, 'C011-d67b2a4a-coverage-summary.json'), 'utf8'));
if (summary.source_commit !== source || summary.current_remaining !== 2823 ||
    summary.current_fully_reviewed !== 1956 || summary.current_reviewed_lines !== 229863) {
  throw new Error('C011 baseline not verified');
}
const remaining = readFileSync(join(checkpoint, 'C011-d67b2a4a-current-remaining.txt'), 'utf8').trimEnd().split('\n').map(p => p.trim());
if (remaining.length !== 2823 || remaining.some(p => !p) || new Set(remaining).size !== remaining.length) {
  throw new Error('Remaining inventory corrupt');
}
const roles = [
  {owner: 'W1', count: 25, accepts: p => p.startsWith('apps/api/src/modules/management/'), rank: [/authoriz|permission|presence|contact|staff/, /controller|service/, /.*/]},
  {owner: 'W2', count: 25, accepts: p => p.startsWith('apps/api/src/modules/') && !p.startsWith('apps/api/src/modules/management/'), rank: [/payment|handoff|parking|retrieval|auth|security|transaction/, /worker|service|controller/, /.*/]},
  {owner: 'W3', count: 25, accepts: p => p.startsWith('packages/database/'), rank: [/migration|constraint|integrity|transaction|security/, /.*/]},
  {owner: 'W4', count: 25, accepts: p => p.startsWith('apps/dashboard/src/'), rank: [/auth|role|permission|location|state|operation/, /.*/]},
  {owner: 'W5', count: 25, accepts: p => p.startsWith('apps/api/test/guest-') || p.startsWith('apps/api/src/modules/management/guest-information-') || p.startsWith('apps/api/src/modules/guest/'), rank: [/auth|privacy|session|tenant|race|access/, /.*/]},
  {owner: 'W6', count: 25, accepts: p => p.startsWith('apps/valet-native/src/'), rank: [/auth|session|offline|queue|location|permission|incident/, /.*/]},
  {owner: 'W7', count: 25, accepts: p => p.startsWith('packages/contracts/'), rank: [/auth|session|permission|shift|role|presence|api/, /.*/]},
];
const transferOwners = {
  W6: [...Array(10).fill('W2'), ...Array(10).fill('W4'), ...Array(5).fill('W5')],
  W7: [...Array(10).fill('W1'), ...Array(10).fill('W3'), ...Array(5).fill('W5')],
};
const assignments = [], transfers = [], selected = new Set();
const scratch = 'D:/kndoom/vaylet test onely/tmp/cos-audit-20261029-results';
for (const role of roles) {
  const rank = p => role.rank.findIndex(r => r.test(p));
  const picks = remaining.filter(p => !selected.has(p) && role.accepts(p))
    .sort((a,b) => rank(a)-rank(b) || a.localeCompare(b)).slice(0,role.count);
  if (picks.length !== role.count) throw new Error('Insufficient paths for '+role.owner+': '+picks.length);
  picks.forEach((path,index) => {
    if (selected.has(path)) throw new Error('Duplicate '+path);
    selected.add(path);
    const reviewer = transferOwners[role.owner]?.[index] ?? role.owner;
    const file = reviewer === role.owner ? `C012-${reviewer}-review-records.json` : `C012-transferred-${role.owner}-review-records.json`;
    const result_path = `${scratch}/${reviewer}/${file}`;
    assignments.push({batch:'C012', source_commit:source, path, original_owner:role.owner,
      assigned_reviewer:reviewer, status:'assigned', priority:'unreviewed_current_source', result_path});
    if (reviewer !== role.owner) transfers.push({batch:'C012', source_commit:source, path,
      original_owner:role.owner, actual_reviewer:reviewer, status:'assigned_pending_review',
      reason:'W6/W7 existing COS conversations failed before receiving tasks; preserved logical ownership',
      result_path});
  });
}
const workerNames = ['W1','W2','W3','W4','W5'];
if (assignments.length !== 175 || transfers.length !== 50 || selected.size !== 175 ||
    workerNames.some(w => assignments.filter(a => a.assigned_reviewer === w).length !== 35)) {
  throw new Error('C012 roster/transfer imbalance');
}
const roster = {batch:'C012',source_commit:source,source_tree:tree,immutable:true,
  previous_published_audit_commit:previous,
  workers:Object.fromEntries(roles.map(r => [r.owner,r.count])),
  actual_reviewers:Object.fromEntries(workerNames.map(w => [w,35])),assignments};
writeFileSync(join(checkpoint,'C012-d67b2a4a-assignment-roster.json'),JSON.stringify(roster,null,2)+'\n');
writeFileSync(join(checkpoint,'C012-d67b2a4a-ownership-transfers.json'),JSON.stringify({
  batch:'C012',source_commit:source,failed_roles:['W6','W7'],count:50,transfers},null,2)+'\n');
console.log(JSON.stringify({source_commit:source,assigned:175,logical_roles:7,actual_reviewers:roster.actual_reviewers,
  transferred:50,remaining_after_batch_if_accepted:remaining.length-175}));
