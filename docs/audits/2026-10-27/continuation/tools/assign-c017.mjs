#!/usr/bin/env node
// C017 original seven-role semantic roster on a COMPLETED, published RB-003.
// Generator is deliberately blocked until dependency-impact QA is final.
import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';

const arg=process.argv[2];if(!arg)throw new Error('Usage: assign-c017.mjs CONTINUATION_DIR');
const root=resolve(arg),cp=join(root,'checkpoints'),base=join(root,'rebaselines','0747a677ddf7fc3e1093490b7ef0a7bee9e2d938');
const source='0747a677ddf7fc3e1093490b7ef0a7bee9e2d938';
const tree='9fbe93fe55b5ef7c42888a874cc7217a594ccace';
const read=name=>JSON.parse(readFileSync(join(base,name),'utf8'));
const summary=read('summary.json');
if(summary.current_source_sha!==source||summary.current_tree_sha!==tree||
   summary.dependency_impact_review!=='COMPLETE_TARGETED_VALIDATION'||
   summary.current_fully_reviewed+summary.current_remaining!==summary.candidate_files){
  throw new Error('RB003 not finalized; do not assign C017 on provisional ledger');
}
const docs=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
const remote=execFileSync('git',['-C',root,'rev-parse','refs/remotes/origin/audit/vaylet-full-audit-2026-10-27'],{encoding:'utf8'}).trim();
if(docs!==remote)throw new Error('RB003 docs must be published/verified before roster allocation');
const remaining=readFileSync(join(base,'current-remaining-files.txt'),'utf8').trim().split(/\r?\n/);
if(remaining.length!==summary.current_remaining||new Set(remaining).size!==remaining.length||remaining.some(p=>!p))
  throw new Error('RB003 source remaining inventory not exact');
const priority=new Set([...read('new-source-candidates.json'),
  ...read('invalidated-published-reviews.json'),
  ...read('invalidated-dependency-reviewed.json')].map(x=>x.path));
if(priority.size!==31||[...priority].some(path=>!remaining.includes(path)))throw new Error('RB003 mandatory 31-path list absent from final remaining');
const roles=[
  {owner:'W1',accepts:p=>p.startsWith('apps/api/src/'),rank:[/staff-push|auth|security|mfa|session|tenant|grant/,/.*/]},
  {owner:'W2',accepts:p=>p.startsWith('apps/api/test/'),rank:[/issue358|staff-push|retrieval|parking|payment|dispatch|task|session/,/.*/]},
  {owner:'W3',accepts:p=>p.startsWith('apps/api/test/')&&/postgres|database|transaction|migration|concurren|race|lease|lock|integrity/i.test(p),rank:[/staff-push|lease|race|concurren|lock|transaction/,/.*/]},
  {owner:'W4',accepts:p=>p.startsWith('apps/dashboard/src/'),rank:[/auth|permission|location|live|policy|operation/,/.*/]},
  {owner:'W5',accepts:p=>p.startsWith('apps/valet/src/'),rank:[/end-shift|employee-app|employee-workspace|use-scoped|use-employee|auth|session|offline/,/.*/]},
  {owner:'W6',accepts:p=>p.startsWith('apps/valet-native/src/')||p.startsWith('packages/employee-client/'),rank:[/^apps\/valet-native\//,/auth|session|notification|queue|offline/,/.*/]},
  {owner:'W7',accepts:p=>p.startsWith('apps/valet/e2e/')||p.startsWith('packages/contracts/')||p.startsWith('apps/customer/')||p.startsWith('scripts/')||p.startsWith('.github/')||p.startsWith('packages/'),rank:[/issue358|contract|auth|security|tenant|session/,/.*/]},
];
const responsive=['W1','W2','W3','W6','W7'];
const selected=new Set(),assignments=[],transfers=[],counts=Object.fromEntries(roles.map(x=>[x.owner,0]));
const scratch='D:/kndoom/vaylet test onely/tmp/cos-audit-20261029-results';
for(const role of roles){
  const rank=p=>role.rank.findIndex(re=>re.test(p));
  const picks=remaining.filter(p=>!selected.has(p)&&role.accepts(p))
    .sort((a,b)=>Number(priority.has(b))-Number(priority.has(a))||rank(a)-rank(b)||a.localeCompare(b)).slice(0,25);
  if(picks.length!==25)throw new Error('Insufficient C017 '+role.owner+' candidates: '+picks.length);
  for(let i=0;i<picks.length;i++){
    const path=picks[i];if(selected.has(path))throw new Error('Duplicate C017 '+path);selected.add(path);
    const reviewer=['W4','W5'].includes(role.owner)?responsive[i%responsive.length]:role.owner;
    const filename=reviewer===role.owner?`C017-${reviewer}-review-records.json`:`C017-transferred-${role.owner}-review-records.json`;
    const resultPath=`${scratch}/${reviewer}/${filename}`;counts[reviewer]++;
    assignments.push({batch:'C017',source_commit:source,path,original_owner:role.owner,
      assigned_reviewer:reviewer,status:'assigned',priority:priority.has(path)?'MANDATORY_REBASELINE_DELTA':'unreviewed_current_source',result_path:resultPath});
    if(reviewer!==role.owner)transfers.push({batch:'C017',source_commit:source,path,
      original_owner:role.owner,original_assigned_reviewer:role.owner,actual_reviewer:reviewer,
      reason:role.owner==='W4'?'W4 chat repeatedly failed startup; assign unread W4-owned Dashboard paths to responsive specialized reviewers at roster publication':'W5 C016 delivery arrived after published fallback; proactively distribute C017 original W5 unread paths before work to prevent delay/duplicate review',
      status:'assigned_pending_full_source_review',result_path:resultPath});
  }
}
if(assignments.length!==175||selected.size!==175||transfers.length!==50||
   responsive.some(w=>counts[w]!==35)||[...priority].some(p=>!selected.has(p))){
  throw new Error('C017 disjoint/priority/transfer accounting failed');
}
const prefix='C017-0747a677-';
writeFileSync(join(cp,prefix+'assignment-roster.json'),JSON.stringify({batch:'C017',source_commit:source,
  source_tree:tree,immutable:true,previous_published_audit_commit:docs,
  workers:Object.fromEntries(roles.map(r=>[r.owner,25])),actual_reviewers:counts,
  mandatory_rebaseline_delta_paths:priority.size,assignments},null,2)+'\n');
writeFileSync(join(cp,prefix+'ownership-transfers.json'),JSON.stringify({batch:'C017',source_commit:source,
  initial_transfers:50,unavailable_or_delayed_roles:['W4','W5'],transfers},null,2)+'\n');
console.log(JSON.stringify({batch:'C017',source_commit:source,assignments:175,unique:selected.size,
  mandatory_deltas:priority.size,original_owners:7,actual_reviewers:counts,
  initial_transfers:50,remaining_if_accepted:remaining.length-175},null,2));
