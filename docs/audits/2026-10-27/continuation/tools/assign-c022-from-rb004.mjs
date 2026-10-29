#!/usr/bin/env node
// C022 first immutable assignment after independently finalized RB-004.
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';

const [rootArg,sourceArg]=process.argv.slice(2);
if(!rootArg||!sourceArg)throw new Error('Usage: assign-c022-from-rb004.mjs CONTINUATION_DIR SOURCE_DIR');
const root=resolve(rootArg),source=resolve(sourceArg),cp=join(root,'checkpoints');
const sourceSha='9ac3c5518b6b7781364e90742589d8f63024f8f6';
const sourceTree='df279eba03754d18eaa98b3245b810cb808f82cf';
const base=join(root,'rebaselines',sourceSha);
const read=name=>JSON.parse(readFileSync(join(base,name),'utf8'));
const git=(dir,...args)=>execFileSync('git',['-C',dir,...args],{encoding:'utf8'}).trim();
if(git(source,'rev-parse','HEAD')!==sourceSha||
   git(source,'rev-parse','HEAD^{tree}')!==sourceTree||
   git(source,'status','--porcelain'))throw new Error('RB004 source checkout not pinned/clean');
const docs=git(root,'rev-parse','HEAD'),remote=git(root,'rev-parse','refs/remotes/origin/audit/vaylet-full-audit-2026-10-27');
if(docs!==remote)throw new Error('RB004 docs must be remotely published/fetched before C022');
if(git(source,'rev-parse','refs/remotes/origin/main')!==sourceSha)
  throw new Error('origin/main has moved; resolve next source-epoch decision before C022');
// HEAD equality by itself does not prove RB004 was ever committed: compare the
// exact published Git blobs with the local final rebaseline before assigning.
const publishedRoot='docs/audits/2026-10-27/continuation/rebaselines/'+sourceSha;
for(const name of ['summary.json','current-remaining-files.txt',
  'invalidated-dependency-reviewed.json','independent-qa-final.json']){
  let publishedBytes;
  try{
    publishedBytes=execFileSync('git',['-C',root,'show',`${docs}:${publishedRoot}/${name}`]);
  }catch{
    throw new Error('RB004 final audit artifact not published: '+name);
  }
  const localBytes=readFileSync(join(base,name));
  if(!publishedBytes.equals(localBytes))
    throw new Error('RB004 local artifact differs from published audit commit: '+name);
}
const summary=read('summary.json');
if(summary.current_source_sha!==sourceSha||summary.current_tree_sha!==sourceTree||
   summary.dependency_impact_review!=='COMPLETE_TARGETED_VALIDATION'||
   summary.current_fully_reviewed+summary.current_remaining!==summary.candidate_files)
  throw new Error('RB004 dependency closure/coverage not complete');
const remaining=readFileSync(join(base,'current-remaining-files.txt'),'utf8').trim().split(/\r?\n/);
if(remaining.length!==summary.current_remaining||new Set(remaining).size!==remaining.length)
  throw new Error('RB004 current remaining not exact');
const delta=[...read('new-source-candidates.json'),
  ...read('invalidated-published-reviews.json'),
  ...read('invalidated-dependency-reviewed.json')];
const mandatory=new Set(delta.map(x=>x.path)),remainingSet=new Set(remaining);
if(mandatory.size!==delta.length||[...mandatory].some(path=>!remainingSet.has(path)))
  throw new Error('RB004 mandatory delta duplicate or absent from remaining');
const specialties={
  W1:p=>p.startsWith('apps/api/src/'),
  W2:p=>p.startsWith('apps/api/test/'),
  W3:p=>p.startsWith('packages/database/')||(p.startsWith('apps/api/test/')&&
    /database|postgres|sql|concurren|race|lease|lock|migration|transaction|integrity/i.test(p)),
  W4:p=>p.startsWith('apps/dashboard/'),
  W5:p=>p.startsWith('apps/valet/src/'),
  W6:p=>p.startsWith('apps/valet-native/')||p.startsWith('packages/employee-client/'),
  W7:p=>p.startsWith('apps/customer/')||p.startsWith('apps/valet/e2e/')||
    p.startsWith('packages/contracts/')||p.startsWith('scripts/')||
    p.startsWith('.github/')||p.startsWith('packages/'),
};
const roles=Object.keys(specialties),responsive=['W1','W2','W3','W6','W7'];
const total=Math.min(175,remaining.length),target=Object.fromEntries(roles.map(w=>[w,0]));
for(let i=0;i<total;i++)target[roles[i%roles.length]]++;
const slots=Object.fromEntries(roles.map(w=>[w,[]]));
const chosen=new Set(),fallbacks=[];
const sortedPriority=[...mandatory].sort((a,b)=>a.localeCompare(b,'en'));
const rank=(role,path)=>specialties[role](path)?0:
   role==='W3'&&path.startsWith('apps/api/test/')?1:
   role==='W2'&&path.startsWith('apps/api/src/')?1:
   role==='W6'&&path.startsWith('apps/valet/src/')?1:50;
function place(owner,path){
  if(chosen.has(path))throw new Error('C022 duplicate selection '+path);
  if(slots[owner].length===target[owner])return false;
  slots[owner].push(path);chosen.add(path);
  if(!specialties[owner](path))fallbacks.push({path,owner,reason:'MANDATORY_DELTA_OR_DOMAIN_EXHAUSTION'});
  return true;
}
for(const path of sortedPriority){
  const owners=roles.filter(r=>specialties[r](path)).sort((a,b)=>
    rank(a,path)-rank(b,path)||slots[a].length/target[a]-slots[b].length/target[b]||
    a.localeCompare(b,'en'));
  // A new Dashboard file stays original W4; after its 25 slots are filled,
  // defer it instead of silently inventing W6/W7 original ownership.
  const owner=(owners.length?owners:roles).find(r=>slots[r].length<target[r]);
  if(owner!==undefined)place(owner,path);
}
for(const role of roles){
  const picks=remaining.filter(p=>!chosen.has(p)&&!mandatory.has(p)).sort((a,b)=>
    rank(role,a)-rank(role,b)||a.localeCompare(b,'en'));
  for(const path of picks){
    if(slots[role].length===target[role])break;
    slots[role].push(path);chosen.add(path);
    if(!specialties[role](path))fallbacks.push({path,owner:role,reason:'DOMAIN_EXHAUSTION'});
  }
  if(slots[role].length!==target[role])throw new Error('Insufficient eligible slots '+role);
}
const scratch='D:/kndoom/vaylet test onely/tmp/cos-audit-20261029-results';
const counts=Object.fromEntries(roles.map(w=>[w,0])),assignments=[],transfers=[];
for(const role of roles)for(let i=0;i<slots[role].length;i++){
  const path=slots[role][i],reviewer=['W4','W5'].includes(role)?responsive[i%responsive.length]:role;
  const filename=reviewer===role?`C022-${reviewer}-review-records.json`:
    `C022-transferred-${role}-review-records.json`;
  const resultPath=`${scratch}/${reviewer}/${filename}`;counts[reviewer]++;
  assignments.push({batch:'C022',source_commit:sourceSha,path,original_owner:role,
    assigned_reviewer:reviewer,status:'assigned',
    priority:mandatory.has(path)?'MANDATORY_REBASELINE_DELTA':'unreviewed_current_source',
    role_domain_fallback:!specialties[role](path),result_path:resultPath});
  if(reviewer!==role)transfers.push({batch:'C022',source_commit:sourceSha,path,
    original_owner:role,original_assigned_reviewer:role,actual_reviewer:reviewer,
    reason:role==='W4'?'Prior W4 reviewer startup unavailable; assign only disjoint unread Dashboard role files':
      'Prior W5 delayed workflow; distribute only disjoint unread Employee Web role files',
    status:'assigned_pending_full_source_review',result_path:resultPath});
}
if(assignments.length!==total||chosen.size!==total||transfers.length!==50||
   responsive.some(w=>counts[w]!==35))throw new Error('C022 assignment/transfer mismatch');
const prioritySelected=assignments.filter(a=>mandatory.has(a.path)).length;
const priorityDeferred=sortedPriority.filter(p=>!chosen.has(p));
const prefix=join(cp,'C022-9ac3c551-');
if(existsSync(prefix+'assignment-roster.json')||existsSync(prefix+'ownership-transfers.json'))
  throw new Error('C022 immutable roster already exists');
writeFileSync(prefix+'assignment-roster.json',JSON.stringify({batch:'C022',source_commit:sourceSha,
  source_tree:sourceTree,immutable:true,previous_published_audit_commit:docs,
  workers:target,actual_reviewers:counts,mandatory_rebaseline_delta_paths:mandatory.size,
  mandatory_in_current_roster:prioritySelected,mandatory_deferred:priorityDeferred.length,
  mandatory_deferred_paths:priorityDeferred,
  assignments},null,2)+'\n');
writeFileSync(prefix+'ownership-transfers.json',JSON.stringify({batch:'C022',source_commit:sourceSha,
  initial_transfers:transfers.length,unavailable_or_delayed_roles:['W4','W5'],
  role_domain_fallbacks:fallbacks,transfers},null,2)+'\n');
console.log(JSON.stringify({batch:'C022',source_commit:sourceSha,assigned:total,
  original_owners:target,actual_reviewers:counts,transfers:transfers.length,
  mandatory:mandatory.size,mandatory_selected:prioritySelected,
  mandatory_deferred:priorityDeferred.length,role_domain_fallbacks:fallbacks.length,
  remaining_if_accepted:remaining.length-total},null,2));
