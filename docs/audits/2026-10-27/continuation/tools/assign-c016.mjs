#!/usr/bin/env node
// Deterministic C016 immutable seven-logical-role roster from published C015.
// The 25 W4-owned files are assigned to active W1/W2/W5/W6/W7 reviewers up front.
import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';

if(!process.argv[2]) throw new Error('Usage: assign-c016.mjs CONTINUATION_DIR');
const root=resolve(process.argv[2]),cp=join(root,'checkpoints');
const source='d67b2a4a4897b4a73d21aba630fc5ab52ff9169b';
const tree='8731302512f8db4edb8bbb1cdc50b208a0dcb5b8';
const prior='a3de66d875f2e2d75a60f7f374452586fbe7a62e';
const summary=JSON.parse(readFileSync(join(cp,'C015-d67b2a4a-coverage-summary.json'),'utf8'));
if(summary.source_commit!==source||summary.current_fully_reviewed!==2656||
   summary.current_reviewed_lines!==333121||summary.current_remaining!==2123) {
  throw new Error('Published C015 baseline mismatch');
}
const remaining=readFileSync(join(cp,'C015-d67b2a4a-current-remaining.txt'),'utf8').trimEnd().split(/\r?\n/);
if(remaining.length!==2123||new Set(remaining).size!==2123||remaining.some(p=>!p)){
  throw new Error('C015 exact remaining inventory invalid');
}
const roles=[
  {owner:'W1',accepts:p=>p.startsWith('apps/api/src/'),rank:[/auth|security|session|mfa|tenant|grant/,/management|controller|service/,/.*/]},
  {owner:'W2',accepts:p=>p.startsWith('apps/api/test/'),rank:[/parking|retrieval|payment|dispatch|task|session|business/,/integration|race|concurrent/,/.*/]},
  // Only three packages/database files remain; retain W3's PostgreSQL/concurrency role
  // with API integration suites which exercise the same DB invariants.
  {owner:'W3',accepts:p=>p.startsWith('packages/database/')||
    p.startsWith('apps/api/test/')&&/postgres|database|transaction|migration|concurren|race|lease|lock|integrity/i.test(p),
    rank:[/^packages\/database\//,/postgres|database|transaction|migration|concurren|race|lease|lock|integrity/i,/.*/]},
  {owner:'W4',accepts:p=>p.startsWith('apps/dashboard/src/'),rank:[/auth|permission|location|live|policy|operation/,/.*/]},
  {owner:'W5',accepts:p=>p.startsWith('apps/valet/src/'),rank:[/auth|session|offline|location|task|queue/,/.*/]},
  {owner:'W6',accepts:p=>p.startsWith('apps/valet-native/src/'),rank:[/auth|session|notification|queue|offline|incident/,/.*/]},
  {owner:'W7',accepts:p=>p.startsWith('apps/api/test/')||p.startsWith('packages/employee-client/'),rank:[/contract|auth|integration|security|tenant|session/,/api|staff|permission/,/.*/]},
];
const activeForW4=['W1','W2','W5','W6','W7'];
const scratch='D:/kndoom/vaylet test onely/tmp/cos-audit-20261029-results';
const assignments=[],selected=new Set(),transfers=[];
const counts=Object.fromEntries(roles.map(r=>[r.owner,0]));
for(const role of roles){
  const rank=p=>role.rank.findIndex(re=>re.test(p));
  const picks=remaining.filter(p=>!selected.has(p)&&role.accepts(p))
    .sort((a,b)=>rank(a)-rank(b)||a.localeCompare(b)).slice(0,25);
  if(picks.length!==25) throw new Error('Insufficient C016 '+role.owner+' eligible: '+picks.length);
  for(let i=0;i<picks.length;i++){
    const path=picks[i];
    if(selected.has(path)) throw new Error('Duplicate C016 path '+path);
    selected.add(path);
    const reviewer=role.owner==='W4'?activeForW4[i%activeForW4.length]:role.owner;
    const resultPath=`${scratch}/${reviewer}/${reviewer===role.owner?'C016-'+reviewer+'-review-records.json':'C016-transferred-W4-review-records.json'}`;
    counts[reviewer]++;
    assignments.push({batch:'C016',source_commit:source,path,
      original_owner:role.owner,assigned_reviewer:reviewer,
      status:'assigned',priority:'unreviewed_current_source',result_path:resultPath});
    if(reviewer!==role.owner) transfers.push({batch:'C016',source_commit:source,path,
      original_owner:role.owner,assigned_reviewer:reviewer,actual_reviewer:reviewer,
      reason:'W4 C015 reviewer failed at conversation startup before any source review; C016 W4 logical files pre-assigned to responsive specialist reviewers',
      status:'assigned_pending_review',result_path:resultPath});
  }
}
if(assignments.length!==175||selected.size!==175||transfers.length!==25||
   activeForW4.some(w=>counts[w]!==30)||counts.W3!==25||counts.W4!==0) {
  throw new Error('C016 role/transfer accounting mismatch');
}
const prefix='C016-d67b2a4a-';
writeFileSync(join(cp,prefix+'assignment-roster.json'),JSON.stringify({
  batch:'C016',source_commit:source,source_tree:tree,immutable:true,
  previous_published_audit_commit:prior,
  workers:Object.fromEntries(roles.map(r=>[r.owner,25])),
  actual_reviewers:counts,
  assignments},null,2)+'\n');
writeFileSync(join(cp,prefix+'ownership-transfers.json'),JSON.stringify({
  batch:'C016',source_commit:source,unavailable_roles:['W4'],count:25,transfers
},null,2)+'\n');
console.log(JSON.stringify({batch:'C016',source_commit:source,assigned:175,
  unique:175,logical_roles:7,active_reviewers:6,actual_reviewer_counts:counts,
  initial_transfers:25,remaining_if_accepted:2123-175}));
