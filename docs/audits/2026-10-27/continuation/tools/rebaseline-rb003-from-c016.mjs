#!/usr/bin/env node
// Deterministic RB-003 forward rebaseline of the PUBLISHED C016 ledger.
// Only the audit documentation worktree is written; both source epochs are read-only.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve,extname} from 'node:path';

const [sourceArg,rootArg]=process.argv.slice(2);
if(!sourceArg||!rootArg) throw new Error('Usage: rebaseline-rb003-from-c016.mjs NEW_SOURCE_DIR CONTINUATION_DIR');
const source=resolve(sourceArg),root=resolve(rootArg),checkpoints=join(root,'checkpoints');
const old='d67b2a4a4897b4a73d21aba630fc5ab52ff9169b';
const now='0747a677ddf7fc3e1093490b7ef0a7bee9e2d938';
const published='f93a0bc72cc3046303292e744dad168629330dc6';
const git=(...args)=>execFileSync('git',['-C',source,...args],{encoding:'utf8',maxBuffer:40*1024*1024}).trim();
if(git('rev-parse','HEAD')!==now||git('status','--porcelain')) throw new Error('RB-003 source not pinned and clean');
if(git('rev-parse','refs/remotes/origin/audit/vaylet-full-audit-2026-10-27')!==published) throw new Error('C016 remote publication not verified');
const tree=git('rev-parse','HEAD^{tree}');
const previous=JSON.parse(readFileSync(join(checkpoints,'C016-d67b2a4a-coverage-summary.json'),'utf8'));
if(previous.source_commit!==old||previous.current_fully_reviewed!==2831||
   previous.current_reviewed_lines!==356490||previous.current_remaining!==1948||
   previous.candidate_files!==4779||previous.candidate_lines!==619108) throw new Error('C016 base totals mismatch');

function parseCsv(data){
  const table=[];let row=[],value='',quote=false;
  for(let i=0;i<data.length;i++){
    const c=data[i];
    if(c==='"'){if(quote&&data[i+1]==='"'){value+='"';i++;}else quote=!quote;}
    else if(c===','&&!quote){row.push(value);value='';}
    else if(c==='\n'&&!quote){row.push(value.replace(/\r$/,''));table.push(row);row=[];value='';}
    else value+=c;
  }
  if(quote) throw new Error('Unclosed ledger quote');
  if(row.length||value){row.push(value);table.push(row);}
  const cols=table.shift();
  if(new Set(cols).size!==cols.length) throw new Error('Duplicate ledger columns');
  return {cols,rows:table.map((cells,index)=>{
    if(cells.length!==cols.length) throw new Error('Malformed C016 ledger at '+(index+2));
    return Object.fromEntries(cols.map((name,i)=>[name,cells[i]]));
  })};
}
const csv=(columns,rows)=>[columns.join(','),...rows.map(row=>columns.map(col=>'"'+String(row[col]??'').replaceAll('"','""')+'"').join(','))].join('\n')+'\n';
const base=parseCsv(readFileSync(join(checkpoints,'C016-d67b2a4a-current-ledger.csv'),'utf8'));
const byPath=new Map(base.rows.map(row=>[row.path,row]));
if(base.rows.length!==7584||byPath.size!==base.rows.length||
   base.rows.filter(r=>r.authored_code_candidate==='True').length!==4779||
   base.rows.filter(r=>r.authored_code_candidate==='True'&&r.current_status==='fully_reviewed').length!==2831){
  throw new Error('Published C016 complete ledger mismatch');
}

function treeMap(sha){
  const raw=execFileSync('git',['-C',source,'ls-tree','-rz',sha],{maxBuffer:15*1024*1024});
  return new Map(raw.toString('utf8').split('\0').filter(Boolean).map(item=>{
    const m=/^(\d+) blob ([a-f0-9]{40})\t(.+)$/.exec(item);
    if(!m) throw new Error('Unexpected tracked tree entry '+item);
    return [m[3],{mode:m[1],oid:m[2]}];
  }));
}
const oldTree=treeMap(old),currentTree=treeMap(now);
if(oldTree.size!==7584||currentTree.size!==7595) throw new Error('Unexpected source tree file count');
const bytesFor=path=>execFileSync('git',['-C',source,'cat-file','blob',currentTree.get(path).oid],{maxBuffer:30*1024*1024});
const metadata=path=>{const bytes=bytesFor(path),body=bytes.toString('utf8');return {
  sha256:createHash('sha256').update(bytes).digest('hex'),
  lines:body?body.split('\n').length-Number(body.endsWith('\n')):0};};
const changed=[],removed=[],stale=[],retained=[],added=[],result=[];
const authored=new Set(['.ts','.tsx','.mjs','.sql','.js','.ps1','.cjs','.prisma','.kt']);
function category(path){
  if(path.startsWith('apps/api/'))return 'backend';
  if(path.startsWith('apps/customer/'))return 'customer';
  if(path.startsWith('apps/dashboard/'))return 'dashboard';
  if(path.startsWith('apps/valet-native/'))return 'native';
  if(path.startsWith('apps/valet/'))return 'employee';
  if(path.startsWith('packages/database/'))return 'database';
  if(path.startsWith('packages/contracts/'))return 'contracts';
  if(path.startsWith('packages/employee-client/'))return 'employee';
  if(path.startsWith('packages/'))return 'packages';
  if(path.startsWith('scripts/')||path.startsWith('.github/'))return 'infrastructure';
  return 'root_or_other';
}
for(const original of base.rows){
  const oldBlob=oldTree.get(original.path),newBlob=currentTree.get(original.path);
  if(!oldBlob) throw new Error('C016 row absent from source tree '+original.path);
  if(!newBlob){removed.push({path:original.path,eligible:original.authored_code_candidate==='True',was_reviewed:original.current_status==='fully_reviewed'});continue;}
  const row={...original};row.current_baseline_sha=now;
  if(oldBlob.oid!==newBlob.oid){
    const meta=metadata(row.path),priorStatus=row.current_status;
    changed.push({status:'M',path:row.path,old_oid:oldBlob.oid,new_oid:newBlob.oid,previous_status:priorStatus});
    row.lines=String(meta.lines);row.current_source_sha256=meta.sha256;
    if(row.authored_code_candidate==='True'&&priorStatus==='fully_reviewed'){
      stale.push({path:row.path,previous_batch:row.current_review_batch||row.audit_batch,
        original_reviewer:row.current_reviewer||row.reviewer,old_sha256:original.current_source_sha256,
        new_sha256:meta.sha256,old_lines:Number(original.lines),new_lines:meta.lines,
        reason:'GIT_BLOB_CHANGED_MANDATORY_FULL_SEMANTIC_REVIEW'});
      row.current_status='not_reviewed';row.current_review_batch='';row.current_reviewer='';
      row.current_review_source_sha256='';row.current_review_finding_ids='';
      row.current_review_notes='Published earlier review superseded by changed source blob; re-review required.';
      row.classification='MODIFIED_REVIEW_STALE';row.dependency_impact_review='REVIEW_REQUIRED_SOURCE_CHANGE';
    }else row.classification='MODIFIED_PREVIOUSLY_UNREVIEWED';
  }else{
    if(row.authored_code_candidate==='True'&&row.current_status==='fully_reviewed'){
      if(!row.current_source_sha256||
         (row.current_review_source_sha256&&row.current_review_source_sha256!==row.current_source_sha256)||
         (!row.current_review_source_sha256&&row.historical_source_sha256_verified&&
           row.historical_source_sha256_verified!==row.current_source_sha256)){
        throw new Error('Old credited blob hash inconsistency '+row.path);
      }
      retained.push({path:row.path,sha256:row.current_source_sha256,
        original_batch:row.current_review_batch||row.audit_batch,
        original_reviewer:row.current_reviewer||row.reviewer,blob_oid:newBlob.oid});
      row.classification='UNCHANGED_REVIEW_REUSABLE_PENDING_DEPENDENCY_RECHECK';
    }else row.classification='UNCHANGED_PREVIOUSLY_UNREVIEWED';
  }
  result.push(row);
}
for(const [path,blob] of currentTree){
  if(byPath.has(path))continue;
  const meta=metadata(path),eligible=authored.has(extname(path).toLowerCase());
  const row=Object.fromEntries(base.cols.map(col=>[col,'']));
  Object.assign(row,{path,category:category(path),lines:String(meta.lines),status:'not_reviewed',
    authored_code_candidate:String(eligible?'True':'False'),starting_status:'not_reviewed',source_commit:now,
    current_baseline_sha:now,current_source_sha256:meta.sha256,current_status:'not_reviewed',
    classification:eligible?'NEW_UNREVIEWED':'NEW_NONCODE_EXCLUDED',
    dependency_impact_review:eligible?'REVIEW_REQUIRED_NEW_SOURCE':'NOT_SOURCE',
    review_notes:'New main source path: no prior audit credit.'});
  result.push(row);changed.push({status:'A',path,new_oid:blob.oid});
  if(eligible)added.push({path,sha256:meta.sha256,lines:meta.lines,category:row.category});
}
result.sort((a,b)=>a.path.localeCompare(b.path,'en'));
const elig=result.filter(x=>x.authored_code_candidate==='True'),credit=elig.filter(x=>x.current_status==='fully_reviewed'),pending=elig.filter(x=>x.current_status!=='fully_reviewed');
const sum=arr=>arr.reduce((n,x)=>n+Number(x.lines),0);
if(result.length!==currentTree.size||new Set(result.map(x=>x.path)).size!==result.length||
   retained.length+stale.length!==2831||credit.length!==retained.length||
   elig.length!==4779+added.length-removed.filter(x=>x.eligible).length||
   pending.length!==elig.length-credit.length||
   changed.length!==18||stale.length!==6||added.length!==10||removed.length!==0){
  throw new Error('RB-003 source/current-ledger accounting mismatch');
}
const summary={checkpoint:'RB-003',previous_source_sha:old,current_source_sha:now,current_tree_sha:tree,
  published_c016_docs_commit:published,current_tracked:result.length,previous_tracked:base.rows.length,
  changed_paths:changed.length,added_paths:changed.filter(x=>x.status==='A').length,
  modified_paths:changed.filter(x=>x.status==='M').length,removed_paths:removed.length,
  stale_reviewed:stale.length,reusable_reviewed:retained.length,new_source_candidates:added.length,
  candidate_files:elig.length,candidate_lines:sum(elig),current_fully_reviewed:credit.length,
  current_reviewed_lines:sum(credit),current_remaining:pending.length,
  file_percent:credit.length/elig.length*100,line_percent:sum(credit)/sum(elig)*100,
  dependency_impact_review:'PENDING_TARGETED_REVIEW',runtime_tests_executed:0};
const dir=join(root,'rebaselines',now);mkdirSync(dir,{recursive:true});
const json=(name,data)=>writeFileSync(join(dir,name),JSON.stringify(data,null,2)+'\n');
json('summary.json',summary);json('git-diff-inventory.json',changed);
json('invalidated-published-reviews.json',stale);json('reusable-published-reviews.json',retained);
json('new-source-candidates.json',added);json('historical-removed-files.json',removed);
json('verification.json',{source_clean:true,source_tree:tree,previous_ledger:'C016',
  complete_blob_identity_accounting:true,dependency_impact_review:'PENDING_TARGETED_REVIEW',
  runtime_tests:'NOT_EXECUTED — STATIC_AUDIT_ONLY'});
writeFileSync(join(dir,'current-coverage-ledger.csv'),csv(base.cols,result));
writeFileSync(join(dir,'current-remaining-files.txt'),pending.map(row=>row.path).join('\n')+'\n');
console.log(JSON.stringify(summary,null,2));
