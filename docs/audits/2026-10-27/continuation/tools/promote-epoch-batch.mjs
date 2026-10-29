#!/usr/bin/env node
// Promote a fully verified static source-epoch batch, preserving the published baseline.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';

const [batch,rootArg,resultsArg,sourceArg]=process.argv.slice(2);
if(!/^C\d{3}$/.test(batch??'')||!rootArg||!resultsArg||!sourceArg)
  throw new Error('Usage: promote-epoch-batch.mjs C017 CONTINUATION_DIR RESULTS_DIR SOURCE_DIR');
const root=resolve(rootArg),scratch=resolve(resultsArg),source=resolve(sourceArg),cp=join(root,'checkpoints');
const git=(...args)=>execFileSync('git',['-C',source,...args],{encoding:'utf8'}).trim();
const sha=git('rev-parse','HEAD'),tree=git('rev-parse','HEAD^{tree}');
if(git('status','--porcelain'))throw new Error('Source worktree must be clean');
const prefix=join(cp,`${batch}-${sha.slice(0,8)}-`),read=name=>JSON.parse(readFileSync(name,'utf8'));
const roster=read(prefix+'assignment-roster.json'),transfers=read(prefix+'ownership-transfers.json');
const qa=read(join(scratch,'Prime',batch+'-qa-provisional.json'));
const accepted=read(join(scratch,'Prime',batch+'-qa-accepted.json'));
const previousBatch='C'+String(Number(batch.slice(1))-1).padStart(3,'0');
const previousSummaryPath=batch==='C017'
  ?join(root,'rebaselines',sha,'summary.json')
  :join(cp,`${previousBatch}-${sha.slice(0,8)}-coverage-summary.json`);
const previousLedgerPath=batch==='C017'
  ?join(root,'rebaselines',sha,'current-coverage-ledger.csv')
  :join(cp,`${previousBatch}-${sha.slice(0,8)}-current-ledger.csv`);
const previous=read(previousSummaryPath),docsParent=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(!existsSync(prefix+'prime-spot-checks.md')||!existsSync(prefix+'finding-evidence.json'))
  throw new Error('Independent semantic/finding source review not finished');
if(roster.batch!==batch||roster.source_commit!==sha||roster.source_tree!==tree||
   qa.batch!==batch||qa.source_commit!==sha||qa.source_tree!==tree||
   qa.valid!==roster.assignments.length||qa.invalid!==0||qa.missing!==0||
   qa.expected!==roster.assignments.length||accepted.length!==qa.expected||
   qa.effective_transfers!==transfers.transfers.length||
   (previous.source_commit??previous.current_source_sha)!==sha||
   previous.current_fully_reviewed!==qa.previous_credit_files||
   previous.current_reviewed_lines!==qa.previous_credit_lines){
  throw new Error('Pinned source, strict QA, baseline or transfer mismatch');
}

function parseCsv(data){
  const table=[];let row=[],value='',quote=false;
  for(let i=0;i<data.length;i++){
    const c=data[i];
    if(c==='"'){if(quote&&data[i+1]==='"'){value+='"';i++;}else quote=!quote;}
    else if(c===','&&!quote){row.push(value);value='';}
    else if(c==='\n'&&!quote){row.push(value.replace(/\r$/,''));table.push(row);row=[];value='';}
    else value+=c;
  }
  if(quote)throw new Error('Unclosed source ledger quote');
  if(row.length||value){row.push(value);table.push(row);}
  const columns=table.shift();return{columns,rows:table.map((cells,i)=>{
    if(cells.length!==columns.length)throw new Error('Malformed previous ledger row '+(i+2));
    return Object.fromEntries(columns.map((key,j)=>[key,cells[j]]));
  })};
}
const quote=s=>'"'+String(s??'').replaceAll('"','""')+'"';
const base=parseCsv(readFileSync(previousLedgerPath,'utf8'));
const acceptedMap=new Map(accepted.map(a=>[a.path,a]));
if(acceptedMap.size!==accepted.length)throw new Error('Duplicated accepted path');
const recordCache=new Map(),records=[];
for(const item of accepted){
  if(!recordCache.has(item.record_file)){
    const contents=read(item.record_file);
    recordCache.set(item.record_file,new Map(contents.map(r=>[r.path,r])));
  }
  const record=recordCache.get(item.record_file).get(item.path);
  if(!record||record.source_sha256!==item.source_sha256||record.batch!==batch)
    throw new Error('Evidence changed after strict QA '+item.path);
  records.push({...record,original_owner:item.original_owner,actual_reviewer:item.actual_reviewer});
}
records.sort((a,b)=>a.path.localeCompare(b.path));
const byRecord=new Map(records.map(r=>[r.path,r]));
const rows=base.rows.map(before=>{
  const item=acceptedMap.get(before.path);if(!item)return before;
  if(before.current_status==='fully_reviewed'||before.authored_code_candidate!=='True'||
     before.current_baseline_sha!==sha||before.current_source_sha256!==item.source_sha256||
     Number(before.lines)!==item.lines)throw new Error('Stale/credited/noneligible path '+before.path);
  const record=byRecord.get(before.path);
  return{...before,current_status:'fully_reviewed',current_review_batch:batch,
    current_reviewer:item.actual_reviewer,current_review_source_sha256:item.source_sha256,
    current_review_notes:record.semantic_review_notes,
    current_review_finding_ids:(record.finding_ids??[]).join(';'),
    dependency_impact_review:'REVIEWED_CURRENT_SOURCE_'+batch,
    classification:'CURRENT_REVIEWED_'+batch};
});
const eligible=rows.filter(r=>r.authored_code_candidate==='True');
const reviewed=eligible.filter(r=>r.current_status==='fully_reviewed');
const pending=eligible.filter(r=>r.current_status!=='fully_reviewed');
const sum=list=>list.reduce((n,r)=>n+Number(r.lines),0);
const newLines=accepted.reduce((n,r)=>n+r.lines,0);
if(eligible.length!==previous.candidate_files||sum(eligible)!==previous.candidate_lines||
   reviewed.length!==qa.if_accepted_files||sum(reviewed)!==qa.if_accepted_lines||
   pending.length!==previous.current_remaining-accepted.length||
   sum(reviewed)-previous.current_reviewed_lines!==newLines)throw new Error('Cumulative epoch coverage accounting mismatch');
const summary={checkpoint:batch,source_commit:sha,source_tree:tree,parent_docs_commit:docsParent,
  immutable_roster_docs_commit:roster.previous_published_audit_commit,
  candidate_files:eligible.length,candidate_lines:sum(eligible),
  previous_current_fully_reviewed:previous.current_fully_reviewed,
  previous_current_reviewed_lines:previous.current_reviewed_lines,newly_reviewed:accepted.length,
  newly_reviewed_lines:newLines,current_fully_reviewed:reviewed.length,
  current_reviewed_lines:sum(reviewed),current_remaining:pending.length,
  file_percent:100*reviewed.length/eligible.length,line_percent:100*sum(reviewed)/sum(eligible),
  logical_workers:7,active_reviewers:Object.keys(qa.active_reviewers).length,
  ownership_transfers:transfers.transfers.length,errors:0,runtime_tests_executed:0,static_only:true};
const effective=transfers.transfers.map(t=>({...t,status:acceptedMap.get(t.path)?.actual_reviewer===t.actual_reviewer?'fully_reviewed_prime_qa_pass':'MISMATCH'}));
if(effective.some(t=>t.status!=='fully_reviewed_prime_qa_pass'))throw new Error('Unaccepted ownership transfer');
writeFileSync(prefix+'review-records.json',JSON.stringify(records,null,2)+'\n');
writeFileSync(prefix+'coverage-summary.json',JSON.stringify(summary,null,2)+'\n');
writeFileSync(prefix+'current-ledger.csv',[base.columns.join(','),...rows.map(r=>base.columns.map(k=>quote(r[k])).join(','))].join('\n')+'\n');
writeFileSync(prefix+'current-remaining.txt',pending.map(r=>r.path).join('\n')+'\n');
writeFileSync(prefix+'qa-summary.json',JSON.stringify({source_commit:sha,exact_roster:roster.assignments.length,
  valid_records:accepted.length,invalid_records:0,missing_records:0,unique_paths:accepted.length,
  ownership_transfers:effective.length,prime_independent_spot_review_completed:true,
  runtime_tests:'NOT_EXECUTED — STATIC_AUDIT_ONLY'},null,2)+'\n');
writeFileSync(prefix+'effective-ownership-transfers.json',JSON.stringify({batch,source_commit:sha,
  original_immutable_transfer_count:transfers.transfers.length,effective_transfer_count:effective.length,
  transfers:effective},null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
