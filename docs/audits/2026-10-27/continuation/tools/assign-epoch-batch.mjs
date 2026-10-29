#!/usr/bin/env node
// Deterministic C018+ audit roster, only after the previous epoch checkpoint is remotely published.
// This generates assignments, never semantic review credit. Rebaseline when main changes.
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';

const [batch,rootArg,sourceArg]=process.argv.slice(2);
if(!/^C\d{3}$/.test(batch??'')||Number(batch.slice(1))<18||!rootArg||!sourceArg)
  throw new Error('Usage: assign-epoch-batch.mjs C018 CONTINUATION_DIR SOURCE_DIR');
const root=resolve(rootArg),source=resolve(sourceArg),cp=join(root,'checkpoints');
const git=(dir,...args)=>execFileSync('git',['-C',dir,...args],{encoding:'utf8'}).trim();
const sha=git(source,'rev-parse','HEAD'),tree=git(source,'rev-parse','HEAD^{tree}');
if(git(source,'status','--porcelain'))throw new Error('Pinned source worktree must be clean');
const docs=git(root,'rev-parse','HEAD');
const remote=git(root,'rev-parse','refs/remotes/origin/audit/vaylet-full-audit-2026-10-27');
const main=git(root,'rev-parse','refs/remotes/origin/main');
if(docs!==remote)throw new Error('Previous audit docs not published/fetch-verified');
if(sha!==main)throw new Error('main advanced; perform source/dependency rebaseline before next roster');
const previous='C'+String(Number(batch.slice(1))-1).padStart(3,'0');
const priorPrefix=join(cp,`${previous}-${sha.slice(0,8)}-`);
const previousSummary=JSON.parse(readFileSync(priorPrefix+'coverage-summary.json','utf8'));
if(previousSummary.checkpoint!==previous||previousSummary.source_commit!==sha||
   previousSummary.source_tree!==tree||
   previousSummary.current_fully_reviewed+previousSummary.current_remaining!==previousSummary.candidate_files)
  throw new Error('Previous current-source checkpoint is not final or mismatches pinned source');
const body=readFileSync(priorPrefix+'current-remaining.txt','utf8').trim();
const remaining=body?body.split(/\r?\n/):[];
if(remaining.length!==previousSummary.current_remaining||
   remaining.some(p=>!p)||new Set(remaining).size!==remaining.length)
  throw new Error('Previous remaining inventory not exact');
if(remaining.length===0)throw new Error('Zero remaining: publish 100% final audit report, no new roster');

const specialty={
  W1:p=>p.startsWith('apps/api/src/'),
  W2:p=>p.startsWith('apps/api/test/'),
  W3:p=>p.startsWith('packages/database/')||p.startsWith('apps/api/test/')&&
    /database|postgres|sql|concurren|race|lease|lock|migration|transaction|integrity/i.test(p),
  W4:p=>p.startsWith('apps/dashboard/'),
  W5:p=>p.startsWith('apps/valet/src/'),
  W6:p=>p.startsWith('apps/valet-native/')||p.startsWith('packages/employee-client/'),
  W7:p=>p.startsWith('apps/customer/')||p.startsWith('apps/valet/e2e/')||
    p.startsWith('packages/contracts/')||p.startsWith('scripts/')||
    p.startsWith('.github/')||p.startsWith('packages/'),
};
const ranks={
  W1:p=>p.startsWith('apps/api/src/')?0:p.startsWith('apps/api/test/')&&
    /auth|security|mfa|session|tenant|grant|push|principal|permission/i.test(p)?1:
    p.startsWith('apps/api/test/')?2:50,
  W2:p=>p.startsWith('apps/api/test/')&&
    /parking|retrieval|payment|dispatch|intake|task|shift|billing|business/i.test(p)?0:
    p.startsWith('apps/api/test/')?1:p.startsWith('apps/api/src/')?2:50,
  W3:p=>p.startsWith('packages/database/')?0:p.startsWith('apps/api/test/')&&
    /postgres|database|sql|concurren|race|lease|lock|transaction|integrity/i.test(p)?1:
    p.startsWith('apps/api/test/')?2:50,
  W4:p=>p.startsWith('apps/dashboard/src/')?0:p.startsWith('apps/dashboard/')?1:50,
  W5:p=>p.startsWith('apps/valet/src/')?0:p.startsWith('apps/valet/e2e/')?1:50,
  W6:p=>p.startsWith('apps/valet-native/')?0:p.startsWith('packages/employee-client/')?1:
    p.startsWith('apps/valet/src/')?2:50,
  W7:p=>p.startsWith('apps/valet/e2e/')?0:p.startsWith('apps/customer/')?1:
    p.startsWith('packages/contracts/')?2:p.startsWith('packages/')?3:
    p.startsWith('scripts/')?4:p.startsWith('.github/')?5:50,
};
const roles=Object.keys(specialty),responsive=['W1','W2','W3','W6','W7'];
const total=Math.min(175,remaining.length),targets=Object.fromEntries(roles.map(w=>[w,0]));
for(let i=0;i<total;i++)targets[roles[i%roles.length]]++;
const chosen=new Set(),assignments=[],transfers=[],reviewerCounts=Object.fromEntries(roles.map(w=>[w,0]));
const scratch='D:/kndoom/vaylet test onely/tmp/cos-audit-20261029-results';
for(const role of roles){
  const picks=remaining.filter(p=>!chosen.has(p))
    .sort((a,b)=>ranks[role](a)-ranks[role](b)||a.localeCompare(b)).slice(0,targets[role]);
  if(picks.length!==targets[role])throw new Error('Insufficient eligible inventory for '+role);
  for(let i=0;i<picks.length;i++){
    const path=picks[i];if(chosen.has(path))throw new Error('Duplicate path '+path);
    chosen.add(path);
    const reviewer=['W4','W5'].includes(role)?responsive[i%responsive.length]:role;
    const filename=reviewer===role?`${batch}-${reviewer}-review-records.json`:
      `${batch}-transferred-${role}-review-records.json`;
    const resultPath=`${scratch}/${reviewer}/${filename}`;
    reviewerCounts[reviewer]++;
    assignments.push({batch,source_commit:sha,path,original_owner:role,assigned_reviewer:reviewer,
      status:'assigned',priority:'unreviewed_current_source',role_domain_fallback:!specialty[role](path),
      result_path:resultPath});
    if(reviewer!==role)transfers.push({batch,source_commit:sha,path,original_owner:role,
      original_assigned_reviewer:role,actual_reviewer:reviewer,
      reason:role==='W4'?'W4 reviewer chat previously failed startup; disjoint unread Dashboard ownership assigned to responsive current reviewer':
        'W5 delayed/unresponsive workflow previously required rescue; proactively distribute only new unread W5-owned files',
      status:'assigned_pending_full_source_review',result_path:resultPath});
  }
}
if(assignments.length!==total||chosen.size!==total||
   transfers.length!==assignments.filter(a=>a.original_owner!==a.assigned_reviewer).length)
  throw new Error('Assignment accounting mismatch');
const prefix=join(cp,`${batch}-${sha.slice(0,8)}-`);
if(existsSync(prefix+'assignment-roster.json')||existsSync(prefix+'ownership-transfers.json'))
  throw new Error('Immutable roster already exists; never silently overwrite');
writeFileSync(prefix+'assignment-roster.json',JSON.stringify({batch,source_commit:sha,
  source_tree:tree,immutable:true,previous_published_audit_commit:docs,
  workers:targets,actual_reviewers:reviewerCounts,mandatory_rebaseline_delta_paths:0,
  assignments},null,2)+'\n');
writeFileSync(prefix+'ownership-transfers.json',JSON.stringify({batch,source_commit:sha,
  initial_transfers:transfers.length,unavailable_or_delayed_roles:['W4','W5'],
  transfers},null,2)+'\n');
console.log(JSON.stringify({batch,source_commit:sha,assigned:assignments.length,
  original_owners:targets,actual_reviewers:reviewerCounts,transfers:transfers.length,
  role_domain_fallbacks:assignments.filter(a=>a.role_domain_fallback).length,
  remaining_if_accepted:remaining.length-assignments.length},null,2));
