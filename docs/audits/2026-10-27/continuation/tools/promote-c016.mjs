#!/usr/bin/env node
// Promote C016 only from complete strict, independent, pinned-source QA.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join,resolve} from 'node:path';

const [rootArg,resultsArg]=process.argv.slice(2);
if(!rootArg||!resultsArg) throw new Error('Usage: promote-c016.mjs CONTINUATION_DIR RESULTS_DIR');
const root=resolve(rootArg),scratch=resolve(resultsArg),cp=join(root,'checkpoints');
const prefix=join(cp,'C016-d67b2a4a-');
const source='d67b2a4a4897b4a73d21aba630fc5ab52ff9169b';
const tree='8731302512f8db4edb8bbb1cdc50b208a0dcb5b8';
const qa=JSON.parse(readFileSync(join(scratch,'Prime','C016-qa-provisional.json'),'utf8'));
const accepted=JSON.parse(readFileSync(join(scratch,'Prime','C016-qa-accepted.json'),'utf8'));
const roster=JSON.parse(readFileSync(prefix+'assignment-roster.json','utf8'));
const initial=JSON.parse(readFileSync(prefix+'ownership-transfers.json','utf8'));
const fallback=JSON.parse(readFileSync(prefix+'w5-unresponsive-fallback-addendum.json','utf8'));
const previous=JSON.parse(readFileSync(join(cp,'C015-d67b2a4a-coverage-summary.json'),'utf8'));
const docsParent=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(!existsSync(prefix+'prime-spot-checks.md')||!existsSync(prefix+'finding-evidence.json')){
  throw new Error('C016 independent source/finding review not finished');
}
if(qa.batch!=='C016'||qa.source_commit!==source||qa.source_tree!==tree||
   qa.expected!==175||qa.valid!==175||qa.invalid!==0||qa.missing!==0||
   qa.effective_ownership_transfers!==50||qa.w5_unresponsive_reassigned_paths!==30||
   accepted.length!==175||roster.assignments.length!==175||
   initial.transfers.length!==25||new Set(initial.transfers.map(t=>t.path)).size!==25||
   fallback.transfers.length!==30||fallback.source_commit!==source||fallback.source_tree!==tree||
   new Set(fallback.transfers.map(t=>t.path)).size!==30||
   previous.source_commit!==source||previous.current_fully_reviewed!==2656||
   previous.current_reviewed_lines!==333121||previous.current_remaining!==2123){
  throw new Error('C016 pinned baseline, strict QA or transfer mismatch');
}
function parseCsv(content){
  const lines=[];let record=[],field='',quoted=false;
  for(let i=0;i<content.length;i++){
    const char=content[i];
    if(char==='"'){if(quoted&&content[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
    else if(char===','&&!quoted){record.push(field);field='';}
    else if(char==='\n'&&!quoted){record.push(field.replace(/\r$/,''));lines.push(record);record=[];field='';}
    else field+=char;
  }
  if(quoted) throw new Error('Unclosed C015 ledger quote');
  if(record.length||field){record.push(field);lines.push(record);}
  const fields=lines.shift();
  return {fields,rows:lines.map((cells,index)=>{
    if(cells.length!==fields.length) throw new Error('Malformed base ledger row '+(index+2));
    return Object.fromEntries(fields.map((name,j)=>[name,cells[j]]));
  })};
}
const quote=x=>'"'+String(x??'').replaceAll('"','""')+'"';
const base=parseCsv(readFileSync(join(cp,'C015-d67b2a4a-current-ledger.csv'),'utf8'));
const acceptedMap=new Map(accepted.map(a=>[a.path,a]));
if(acceptedMap.size!==175) throw new Error('Duplicate C016 accepted path');
const recordCache=new Map(),records=[];
for(const item of accepted){
  if(!recordCache.has(item.record_file)){
    const list=JSON.parse(readFileSync(item.record_file,'utf8'));
    recordCache.set(item.record_file,new Map(list.map(x=>[x.path,x])));
  }
  const record=recordCache.get(item.record_file).get(item.path);
  if(!record||record.batch!=='C016'||record.source_sha256!==item.source_sha256){
    throw new Error('C016 evidence changed after strict QA '+item.path);
  }
  records.push({...record,original_owner:item.original_owner,actual_reviewer:item.actual_reviewer});
}
records.sort((a,b)=>a.path.localeCompare(b.path));
const byRecord=new Map(records.map(r=>[r.path,r]));
const rows=base.rows.map(before=>{
  const item=acceptedMap.get(before.path);
  if(!item) return before;
  if(before.current_status==='fully_reviewed'||before.current_baseline_sha!==source||
     before.current_source_sha256!==item.source_sha256||Number(before.lines)!==item.lines){
    throw new Error('C016 already reviewed or stale source '+before.path);
  }
  const record=byRecord.get(before.path),row={...before};
  row.current_status='fully_reviewed';
  row.current_review_batch='C016';
  row.current_reviewer=item.actual_reviewer;
  row.current_review_source_sha256=item.source_sha256;
  row.current_review_notes=record.semantic_review_notes;
  row.current_review_finding_ids=(record.finding_ids??[]).join(';');
  row.dependency_impact_review='REVIEWED_CURRENT_SOURCE_C016';
  row.classification='CURRENT_REVIEWED_C016';
  return row;
});
const eligible=rows.filter(r=>r.authored_code_candidate==='True');
const reviewed=eligible.filter(r=>r.current_status==='fully_reviewed');
const pending=eligible.filter(r=>r.current_status!=='fully_reviewed');
const sumLines=list=>list.reduce((n,row)=>n+Number(row.lines),0);
const newLines=accepted.reduce((n,row)=>n+row.lines,0);
if(eligible.length!==4779||sumLines(eligible)!==619108||reviewed.length!==2831||
   pending.length!==1948||sumLines(reviewed)!==qa.if_accepted_lines||
   sumLines(reviewed)-previous.current_reviewed_lines!==newLines){
  throw new Error('C016 cumulative eligible/line reconciliation mismatch');
}
const fallbackMap=new Map(fallback.transfers.map(t=>[t.path,t]));
const rosterMap=new Map(roster.assignments.map(a=>[a.path,a]));
const initialMap=new Map(initial.transfers.map(t=>[t.path,t]));
const effectiveTransfers=[];
for(const item of accepted){
  const a=rosterMap.get(item.path),f=fallbackMap.get(item.path),i=initialMap.get(item.path);
  if(!a||a.original_owner!==item.original_owner) throw new Error('C016 ownership mismatch '+item.path);
  if(f){
    if(f.original_owner!==a.original_owner||f.prior_actual_reviewer!=='W5'||
       f.actual_reviewer!==item.actual_reviewer||
       (a.original_owner!=='W5'&&a.original_owner!=='W4')||
       (a.original_owner==='W4'&&(!i||i.actual_reviewer!=='W5'))||
       (a.original_owner==='W5'&&i)) throw new Error('C016 fallback provenance mismatch '+item.path);
  }else if(item.actual_reviewer!==a.assigned_reviewer){
    throw new Error('C016 unrecorded reviewer transfer '+item.path);
  }
  if(i&&i.original_owner!==a.original_owner) throw new Error('C016 initial transfer owner mismatch '+item.path);
  if(a.original_owner!==item.actual_reviewer){
    effectiveTransfers.push({batch:'C016',source_commit:source,path:item.path,
      original_owner:a.original_owner,original_assigned_reviewer:a.assigned_reviewer,
      actual_reviewer:item.actual_reviewer,
      reason:f?.reason??i?.reason??'documented_fallback',
      superseded_reviewer:f?.prior_actual_reviewer??null,
      status:'fully_reviewed_prime_qa_pass'});
  }
}
if(effectiveTransfers.length!==50||fallbackMap.size!==30||
   initial.transfers.some(t=>!acceptedMap.has(t.path))||
   fallback.transfers.some(t=>!acceptedMap.has(t.path))){
  throw new Error('C016 effective transfer reconciliation mismatch');
}
effectiveTransfers.sort((a,b)=>a.path.localeCompare(b.path));
const summary={checkpoint:'C016',source_commit:source,source_tree:tree,
  parent_docs_commit:docsParent,
  immutable_roster_docs_commit:'39895274f4cc7ea89c267062ebc68cb9901c52e6',
  candidate_files:eligible.length,candidate_lines:sumLines(eligible),
  previous_current_fully_reviewed:previous.current_fully_reviewed,
  previous_current_reviewed_lines:previous.current_reviewed_lines,
  newly_reviewed:175,newly_reviewed_lines:newLines,
  current_fully_reviewed:reviewed.length,current_reviewed_lines:sumLines(reviewed),
  current_remaining:pending.length,file_percent:100*reviewed.length/eligible.length,
  line_percent:100*sumLines(reviewed)/sumLines(eligible),
  logical_workers:7,active_reviewers:5,ownership_transfers:50,
  w5_unresponsive_reassigned_paths:30,
  errors:0,runtime_tests_executed:0,static_only:true};
writeFileSync(prefix+'review-records.json',JSON.stringify(records,null,2)+'\n');
writeFileSync(prefix+'coverage-summary.json',JSON.stringify(summary,null,2)+'\n');
writeFileSync(prefix+'current-ledger.csv',
  [base.fields.join(','),...rows.map(row=>base.fields.map(k=>quote(row[k])).join(','))].join('\n')+'\n');
writeFileSync(prefix+'current-remaining.txt',pending.map(row=>row.path).join('\n')+'\n');
writeFileSync(prefix+'qa-summary.json',JSON.stringify({source_commit:source,exact_roster:175,
  valid_records:175,invalid_records:0,missing_records:0,unique_paths:175,
  ownership_transfers:50,w5_unresponsive_reassigned_paths:30,
  prime_independent_spot_review_completed:true,
  prime_spot_review_evidence:'C016-d67b2a4a-prime-spot-checks.md',
  runtime_tests:'NOT_EXECUTED — STATIC_AUDIT_ONLY'},null,2)+'\n');
writeFileSync(prefix+'effective-ownership-transfers.json',JSON.stringify({batch:'C016',
  source_commit:source,original_immutable_transfer_count:25,
  w5_unresponsive_reassigned_paths:30,
  effective_transfer_count:50,transfers:effectiveTransfers},null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
