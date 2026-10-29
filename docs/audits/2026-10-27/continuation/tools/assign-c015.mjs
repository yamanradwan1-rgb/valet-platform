#!/usr/bin/env node
// Deterministic C015 immutable disjoint roster from the remotely verified C014 inventory.
import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';

if(!process.argv[2]) throw new Error('Usage: assign-c015.mjs CONTINUATION_DIR');
const root=resolve(process.argv[2]),cp=join(root,'checkpoints');
const source='d67b2a4a4897b4a73d21aba630fc5ab52ff9169b';
const tree='8731302512f8db4edb8bbb1cdc50b208a0dcb5b8';
const prior='f3e3afdf23ba0ac06ce4e58f55589ff184243e86';
const summary=JSON.parse(readFileSync(join(cp,'C014-d67b2a4a-coverage-summary.json'),'utf8'));
if(summary.source_commit!==source||summary.current_fully_reviewed!==2481||
   summary.current_reviewed_lines!==310173||summary.current_remaining!==2298) {
  throw new Error('Published C014 baseline mismatch');
}
const remaining=readFileSync(join(cp,'C014-d67b2a4a-current-remaining.txt'),'utf8').trimEnd().split(/\r?\n/);
if(remaining.length!==2298||new Set(remaining).size!==2298||remaining.some(p=>!p)) {
  throw new Error('C014 remaining inventory invalid');
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
const scratch='D:/kndoom/vaylet test onely/tmp/cos-audit-20261029-results';
const assignments=[],selected=new Set();
for(const role of roles){
  const rank=p=>role.rank.findIndex(re=>re.test(p));
  const picks=remaining.filter(p=>!selected.has(p)&&role.accepts(p))
    .sort((a,b)=>rank(a)-rank(b)||a.localeCompare(b)).slice(0,25);
  if(picks.length!==25) throw new Error('Insufficient C015 eligible source for '+role.owner+': '+picks.length);
  for(const path of picks){
    if(selected.has(path)) throw new Error('Duplicate C015 path '+path);
    selected.add(path);
    assignments.push({batch:'C015',source_commit:source,path,
      original_owner:role.owner,assigned_reviewer:role.owner,
      status:'assigned',priority:'unreviewed_current_source',
      result_path:`${scratch}/${role.owner}/C015-${role.owner}-review-records.json`});
  }
}
if(assignments.length!==175||selected.size!==175) throw new Error('C015 disjoint accounting mismatch');
const prefix='C015-d67b2a4a-';
writeFileSync(join(cp,prefix+'assignment-roster.json'),JSON.stringify({
  batch:'C015',source_commit:source,source_tree:tree,immutable:true,
  previous_published_audit_commit:prior,
  workers:Object.fromEntries(roles.map(r=>[r.owner,25])),
  actual_reviewers:Object.fromEntries(roles.map(r=>[r.owner,25])),
  assignments},null,2)+'\n');
writeFileSync(join(cp,prefix+'ownership-transfers.json'),JSON.stringify({
  batch:'C015',source_commit:source,unavailable_roles:[],count:0,transfers:[]
},null,2)+'\n');
console.log(JSON.stringify({batch:'C015',source_commit:source,assigned:assignments.length,
  logical_roles:7,active_reviewers:7,initial_transfers:0,
  remaining_if_accepted:2298-175}));
