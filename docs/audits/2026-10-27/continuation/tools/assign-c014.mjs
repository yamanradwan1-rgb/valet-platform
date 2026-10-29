#!/usr/bin/env node
// Deterministic C014 assignments from the remotely verified C013 source inventory.
import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';

if(!process.argv[2]) throw new Error('Usage: assign-c014.mjs CONTINUATION_DIR');
const root=resolve(process.argv[2]),cp=join(root,'checkpoints');
const source='d67b2a4a4897b4a73d21aba630fc5ab52ff9169b';
const tree='8731302512f8db4edb8bbb1cdc50b208a0dcb5b8';
const prior='3a539f3a3ce9b3e221c874c801d75b10bca10bd3';
const priorSummary=JSON.parse(readFileSync(join(cp,'C013-d67b2a4a-coverage-summary.json'),'utf8'));
if(priorSummary.source_commit!==source||priorSummary.current_fully_reviewed!==2306||
   priorSummary.current_reviewed_lines!==274919||priorSummary.current_remaining!==2473) {
  throw new Error('Remote C013 baseline mismatch');
}
const remaining=readFileSync(join(cp,'C013-d67b2a4a-current-remaining.txt'),'utf8').trimEnd().split(/\r?\n/);
if(remaining.length!==2473||new Set(remaining).size!==2473||remaining.some(p=>!p)) {
  throw new Error('C013 remaining list invalid');
}
const roles=[
  {owner:'W1',accepts:p=>p.startsWith('apps/api/src/'),rank:[/auth|security|session|mfa|tenant|grant/,/management|controller|service/,/.*/]},
  {owner:'W2',accepts:p=>p.startsWith('apps/api/test/'),rank:[/parking|retrieval|payment|dispatch|task|session|business/,/integration|race|concurrent/,/.*/]},
  {owner:'W3',accepts:p=>p.startsWith('packages/database/'),rank:[/security|migration|transaction|integrity|test/,/.*/]},
  {owner:'W4',accepts:p=>p.startsWith('apps/dashboard/src/'),rank:[/auth|permission|location|live|policy|operation/,/.*/]},
  {owner:'W5',accepts:p=>p.startsWith('apps/valet/src/'),rank:[/auth|session|offline|location|task|queue/,/.*/]},
  {owner:'W6',accepts:p=>p.startsWith('apps/valet-native/src/'),rank:[/auth|session|notification|queue|offline|incident/,/.*/]},
  {owner:'W7',accepts:p=>p.startsWith('apps/api/test/')||p.startsWith('packages/employee-client/'),rank:[/contract|auth|integration|security|tenant|session/,/api|staff|permission/,/.*/]},
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
    .sort((a,b)=>rank(a)-rank(b)||a.localeCompare(b)).slice(0,25);
  if(picks.length!==25) throw new Error('Insufficient eligible paths for '+role.owner+': '+picks.length);
  for(const [index,path] of picks.entries()){
    if(selected.has(path)) throw new Error('Duplicate selected '+path);
    selected.add(path);
    const reviewer=transfersTo[role.owner]?.[index]??role.owner;
    const filename=reviewer===role.owner
      ?`C014-${reviewer}-review-records.json`:`C014-transferred-${role.owner}-review-records.json`;
    const result_path=`${scratch}/${reviewer}/${filename}`;
    assignments.push({batch:'C014',source_commit:source,path,original_owner:role.owner,
      assigned_reviewer:reviewer,status:'assigned',priority:'unreviewed_current_source',result_path});
    if(reviewer!==role.owner) transfers.push({batch:'C014',source_commit:source,path,
      original_owner:role.owner,actual_reviewer:reviewer,
      reason:role.owner==='W2'
        ?'W2 prior conversation repeatedly failed to acknowledge and persist assigned batches; preserve W2 logical ownership'
        :'W6/W7 original COS worker conversations failed before receiving tasks; explicit reassignment',
      status:'assigned_pending_review',result_path});
  }
}
const actual={W1:45,W3:45,W4:45,W5:40};
if(assignments.length!==175||selected.size!==175||transfers.length!==75||
  Object.entries(actual).some(([worker,count])=>
    assignments.filter(a=>a.assigned_reviewer===worker).length!==count)) {
  throw new Error('C014 ownership/disjoint accounting mismatch');
}
const base='C014-d67b2a4a-';
writeFileSync(join(cp,base+'assignment-roster.json'),JSON.stringify({batch:'C014',
  source_commit:source,source_tree:tree,immutable:true,previous_published_audit_commit:prior,
  workers:Object.fromEntries(roles.map(r=>[r.owner,25])),actual_reviewers:actual,assignments},null,2)+'\n');
writeFileSync(join(cp,base+'ownership-transfers.json'),JSON.stringify({batch:'C014',
  source_commit:source,unavailable_roles:['W2','W6','W7'],count:75,transfers},null,2)+'\n');
console.log(JSON.stringify({batch:'C014',source_commit:source,assigned:175,
  logical_roles:7,active_reviewer_plan:actual,initial_transfers:75,remaining_if_accepted:2298}));
