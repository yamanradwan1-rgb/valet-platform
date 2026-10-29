#!/usr/bin/env node
// Deterministic disjoint C013 roster from the last remotely verified C012 inventory.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

if(!process.argv[2]) throw new Error('Usage: assign-c013.mjs CONTINUATION_DIR');
const root=resolve(process.argv[2]),cp=join(root,'checkpoints');
const source='d67b2a4a4897b4a73d21aba630fc5ab52ff9169b';
const tree='8731302512f8db4edb8bbb1cdc50b208a0dcb5b8';
const prior='bd72d274f2bad6e09655ad7a4e062374810094d5';
const summary=JSON.parse(readFileSync(join(cp,'C012-d67b2a4a-coverage-summary.json'),'utf8'));
if(summary.source_commit!==source||summary.current_fully_reviewed!==2131||
  summary.current_reviewed_lines!==249056||summary.current_remaining!==2648) {
  throw new Error('C012 published baseline mismatch');
}
const remaining=readFileSync(join(cp,'C012-d67b2a4a-current-remaining.txt'),'utf8').trimEnd().split('\n');
if(remaining.length!==2648||new Set(remaining).size!==2648||remaining.some(p=>!p)) throw new Error('C012 remaining invalid');
const roles=[
  {owner:'W1',count:25,accepts:p=>p.startsWith('apps/api/src/modules/management/'),rank:[/auth|staff|location|presence|policy/,/controller|service/,/.*/]},
  {owner:'W2',count:25,accepts:p=>p.startsWith('apps/api/src/modules/')&&!p.startsWith('apps/api/src/modules/management/'),rank:[/auth|payment|retrieval|parking|notification/,/service|controller|transaction/,/.*/]},
  {owner:'W3',count:25,accepts:p=>p.startsWith('packages/database/'),rank:[/migration|security|integrity|transaction|test/,/.*/]},
  {owner:'W4',count:25,accepts:p=>p.startsWith('apps/dashboard/src/'),rank:[/auth|role|permission|location|operation|state/,/.*/]},
  {owner:'W5',count:25,accepts:p=>p.startsWith('apps/api/test/guest-')||p.startsWith('apps/api/test/management-visit-contact'),rank:[/auth|privacy|session|race|tenant|continuity/,/.*/]},
  {owner:'W6',count:25,accepts:p=>p.startsWith('apps/valet-native/src/'),rank:[/auth|session|offline|queue|notification|location|incident/,/.*/]},
  {owner:'W7',count:25,accepts:p=>p.startsWith('packages/contracts/')||p.startsWith('apps/api/test/'),rank:[/staff|auth|session|integration|permission|security/,/.*/]},
];
const transfersTo={
  W2:[...Array(5).fill('W1'),...Array(5).fill('W3'),...Array(10).fill('W4'),...Array(5).fill('W5')],
  W6:[...Array(5).fill('W1'),...Array(5).fill('W3'),...Array(10).fill('W4'),...Array(5).fill('W5')],
  W7:[...Array(10).fill('W1'),...Array(10).fill('W3'),...Array(5).fill('W5')],
};
const scratch='D:/kndoom/vaylet test onely/tmp/cos-audit-20261029-results';
const assignments=[],transfers=[],selected=new Set();
for(const role of roles){
  const rank=p=>role.rank.findIndex(re=>re.test(p));
  const picks=remaining.filter(p=>!selected.has(p)&&role.accepts(p))
    .sort((a,b)=>rank(a)-rank(b)||a.localeCompare(b)).slice(0,role.count);
  if(picks.length!==role.count) throw new Error('Insufficient candidate paths '+role.owner+': '+picks.length);
  for(let index=0;index<picks.length;index++){
    const path=picks[index];if(selected.has(path)) throw new Error('Duplicate '+path);selected.add(path);
    const reviewer=transfersTo[role.owner]?.[index]??role.owner;
    const file=reviewer===role.owner?`C013-${reviewer}-review-records.json`:`C013-transferred-${role.owner}-review-records.json`;
    const result_path=`${scratch}/${reviewer}/${file}`;
    assignments.push({batch:'C013',source_commit:source,path,original_owner:role.owner,
      assigned_reviewer:reviewer,status:'assigned',priority:'unreviewed_current_source',result_path});
    if(reviewer!==role.owner) transfers.push({batch:'C013',source_commit:source,path,
      original_owner:role.owner,actual_reviewer:reviewer,
      reason:role.owner==='W2'
        ? 'W2 COS chat failed C012 task receipt/acknowledgment despite queued messages and later remained active with no output; preserve original role but avoid another stalled assignment'
        : 'Original W6/W7 COS conversations failed before receiving tasks; explicit reassignment',
      status:'assigned_pending_review',result_path});
  }
}
const actual=['W1','W3','W4','W5'];
const expected={W1:45,W3:45,W4:45,W5:40};
if(assignments.length!==175||selected.size!==175||transfers.length!==75||
  actual.some(w=>assignments.filter(a=>a.assigned_reviewer===w).length!==expected[w])) {
  throw new Error('C013 logical/actual ownership accounting failed');
}
const roster={batch:'C013',source_commit:source,source_tree:tree,immutable:true,
  previous_published_audit_commit:prior,
  workers:Object.fromEntries(roles.map(r=>[r.owner,r.count])),
  actual_reviewers:expected,assignments};
writeFileSync(join(cp,'C013-d67b2a4a-assignment-roster.json'),JSON.stringify(roster,null,2)+'\n');
writeFileSync(join(cp,'C013-d67b2a4a-ownership-transfers.json'),JSON.stringify({
  batch:'C013',source_commit:source,unavailable_roles:['W2','W6','W7'],count:75,
  transfers},null,2)+'\n');
console.log(JSON.stringify({batch:'C013',source_commit:source,assigned:175,
  logical_roles:7,active_reviewer_plan:expected,transfers:75,remaining_if_accepted:2473}));
