#!/usr/bin/env node
// C014 promotion after all 175 records pass independent Prime semantic QA.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join,resolve} from 'node:path';

const [rootArg,resultsArg]=process.argv.slice(2);
if(!rootArg||!resultsArg) throw new Error('Usage: promote-c014.mjs CONTINUATION_DIR RESULTS_DIR');
const root=resolve(rootArg),scratch=resolve(resultsArg),cp=join(root,'checkpoints');
const prefix=join(cp,'C014-d67b2a4a-');
const source='d67b2a4a4897b4a73d21aba630fc5ab52ff9169b';
const tree='8731302512f8db4edb8bbb1cdc50b208a0dcb5b8';
const qa=JSON.parse(readFileSync(join(scratch,'Prime','C014-qa-provisional.json'),'utf8'));
const accepted=JSON.parse(readFileSync(join(scratch,'Prime','C014-qa-accepted.json'),'utf8'));
const roster=JSON.parse(readFileSync(prefix+'assignment-roster.json','utf8'));
const ownership=JSON.parse(readFileSync(prefix+'ownership-transfers.json','utf8'));
const relief=JSON.parse(readFileSync(prefix+'w3-relief-addendum.json','utf8'));
const reliefMap=new Map(relief.transfers.map(t=>[t.path,t]));
const effectiveReviewer=path=>reliefMap.get(path)?.actual_reviewer??
  roster.assignments.find(a=>a.path===path)?.assigned_reviewer;
const previous=JSON.parse(readFileSync(join(cp,'C013-d67b2a4a-coverage-summary.json'),'utf8'));
const docsParent=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(!existsSync(prefix+'prime-spot-checks.md')) throw new Error('C014 independent source sampling missing');
if(qa.batch!=='C014'||qa.source_commit!==source||qa.source_tree!==tree||qa.expected!==175||
  qa.valid!==175||qa.invalid||qa.missing||qa.effective_ownership_transfers!==75||
  accepted.length!==175||roster.assignments.length!==175||ownership.transfers.length!==75||
  relief.batch!=='C014'||relief.source_commit!==source||relief.transfers.length!==15||
  reliefMap.size!==15||qa.w3_relief_reassigned_paths!==15||
  previous.source_commit!==source||previous.current_fully_reviewed!==2306||
  previous.current_reviewed_lines!==274919||previous.current_remaining!==2473) {
  throw new Error('C014 strict QA or prior source coverage mismatch');
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
  if(quoted) throw new Error('Unclosed CSV quote');
  if(record.length||field){record.push(field);lines.push(record);}
  const fields=lines.shift();
  return {fields,rows:lines.map((cells,index)=>{
    if(cells.length!==fields.length) throw new Error('Malformed ledger row '+(index+2));
    return Object.fromEntries(fields.map((name,j)=>[name,cells[j]]));
  })};
}
const quote=x=>'"'+String(x??'').replaceAll('"','""')+'"';
const base=parseCsv(readFileSync(join(cp,'C013-d67b2a4a-current-ledger.csv'),'utf8'));
const acceptedMap=new Map(accepted.map(a=>[a.path,a]));
if(acceptedMap.size!==175) throw new Error('Duplicate accepted path');
const resultCache=new Map(),records=[];
for(const item of accepted){
  if(!resultCache.has(item.record_file)){
    const list=JSON.parse(readFileSync(item.record_file,'utf8'));
    resultCache.set(item.record_file,new Map(list.map(x=>[x.path,x])));
  }
  const record=resultCache.get(item.record_file).get(item.path);
  if(!record||record.batch!=='C014'||record.source_sha256!==item.source_sha256) {
    throw new Error('Worker evidence changed since QA '+item.path);
  }
  records.push({...record,original_owner:item.original_owner,actual_reviewer:item.actual_reviewer});
}
records.sort((a,b)=>a.path.localeCompare(b.path));
const byRecord=new Map(records.map(r=>[r.path,r]));
const rows=base.rows.map(before=>{
  const item=acceptedMap.get(before.path);
  if(!item) return before;
  if(before.current_status==='fully_reviewed'||before.current_baseline_sha!==source||
    before.current_source_sha256!==item.source_sha256||Number(before.lines)!==item.lines) {
    throw new Error('Previously reviewed or stale source '+before.path);
  }
  const record=byRecord.get(before.path),row={...before};
  row.current_status='fully_reviewed';
  row.current_review_batch='C014';
  row.current_reviewer=item.actual_reviewer;
  row.current_review_source_sha256=item.source_sha256;
  row.current_review_notes=record.semantic_review_notes;
  row.current_review_finding_ids=(record.finding_ids??[]).join(';');
  row.dependency_impact_review='REVIEWED_CURRENT_SOURCE_C014';
  row.classification='CURRENT_REVIEWED_C014';
  return row;
});
const eligible=rows.filter(r=>r.authored_code_candidate==='True');
const reviewed=eligible.filter(r=>r.current_status==='fully_reviewed');
const pending=eligible.filter(r=>r.current_status!=='fully_reviewed');
const sumLines=list=>list.reduce((n,row)=>n+Number(row.lines),0);
const newLines=accepted.reduce((n,row)=>n+row.lines,0);
if(eligible.length!==4779||sumLines(eligible)!==619108||reviewed.length!==2481||
  pending.length!==2298||sumLines(reviewed)!==qa.if_accepted_lines||
  sumLines(reviewed)-previous.current_reviewed_lines!==newLines) {
  throw new Error('C014 cumulative source file/line reconciliation mismatch');
}
const transfers=ownership.transfers.map(t=>({...t,
  assigned_reviewer:roster.assignments.find(a=>a.path===t.path)?.assigned_reviewer,
  actual_reviewer:effectiveReviewer(t.path),
  status:acceptedMap.get(t.path)?.actual_reviewer===effectiveReviewer(t.path)
    ?'fully_reviewed_prime_qa_pass':'pending'}));
if(transfers.some(t=>t.status!=='fully_reviewed_prime_qa_pass')||
  new Set(transfers.map(t=>t.path)).size!==75) throw new Error('Unreviewed or duplicate transfers');
const summary={checkpoint:'C014',source_commit:source,source_tree:tree,
  parent_docs_commit:docsParent,
  immutable_roster_docs_commit:'9509393ec6bf46f81c90fece2bb52ec4c39e7e33',
  candidate_files:eligible.length,candidate_lines:sumLines(eligible),
  previous_current_fully_reviewed:previous.current_fully_reviewed,
  previous_current_reviewed_lines:previous.current_reviewed_lines,
  newly_reviewed:175,newly_reviewed_lines:newLines,
  current_fully_reviewed:reviewed.length,current_reviewed_lines:sumLines(reviewed),
  current_remaining:pending.length,file_percent:100*reviewed.length/eligible.length,
  line_percent:100*sumLines(reviewed)/sumLines(eligible),
  logical_workers:7,active_reviewers:4,ownership_transfers:75,
  w3_relief_reassigned_paths:15,
  errors:0,runtime_tests_executed:0,static_only:true};
writeFileSync(prefix+'review-records.json',JSON.stringify(records,null,2)+'\n');
writeFileSync(prefix+'coverage-summary.json',JSON.stringify(summary,null,2)+'\n');
writeFileSync(prefix+'current-ledger.csv',
  [base.fields.join(','),...rows.map(row=>base.fields.map(k=>quote(row[k])).join(','))].join('\n')+'\n');
writeFileSync(prefix+'current-remaining.txt',pending.map(row=>row.path).join('\n')+'\n');
writeFileSync(prefix+'qa-summary.json',JSON.stringify({source_commit:source,exact_roster:175,
  valid_records:qa.valid,invalid_records:qa.invalid,missing_records:qa.missing,
  unique_paths:175,ownership_transfers:75,w3_relief_reassigned_paths:15,
  prime_independent_spot_review_completed:true,
  prime_spot_review_evidence:'C014-d67b2a4a-prime-spot-checks.md',
  runtime_tests:'NOT_EXECUTED — STATIC_AUDIT_ONLY'},null,2)+'\n');
writeFileSync(prefix+'ownership-transfers.json',JSON.stringify({...ownership,
  effective_transfer_count:75,w3_relief_reassigned_paths:15,transfers},null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
