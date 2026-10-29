#!/usr/bin/env node
// C013 cumulative source promotion. Run ONLY after strict Prime QA and source sampling.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const [rootArg,resultsArg]=process.argv.slice(2);
if(!rootArg||!resultsArg) throw new Error('Usage: promote-c013.mjs CONTINUATION_DIR RESULTS_DIR');
const root=resolve(rootArg),scratch=resolve(resultsArg),cp=join(root,'checkpoints');
const prefix=join(cp,'C013-d67b2a4a-');
const source='d67b2a4a4897b4a73d21aba630fc5ab52ff9169b';
const qa=JSON.parse(readFileSync(join(scratch,'Prime','C013-qa-provisional.json'),'utf8'));
const accepted=JSON.parse(readFileSync(join(scratch,'Prime','C013-qa-accepted.json'),'utf8'));
const roster=JSON.parse(readFileSync(prefix+'assignment-roster.json','utf8'));
const transferManifest=JSON.parse(readFileSync(prefix+'ownership-transfers.json','utf8'));
const rescue=JSON.parse(readFileSync(prefix+'w3-rescue-addendum.json','utf8'));
const rescueMap=new Map(rescue.transfers.map(t=>[t.path,t]));
const previous=JSON.parse(readFileSync(join(cp,'C012-d67b2a4a-coverage-summary.json'),'utf8'));
const docsParent=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(!existsSync(prefix+'prime-spot-checks.md')) throw new Error('Prime independent C013 spot checks missing');
if(qa.source_commit!==source||qa.expected!==175||qa.valid!==175||qa.invalid||qa.missing||
  accepted.length!==175||roster.assignments.length!==175||
  transferManifest.transfers.length!==75||previous.source_commit!==source||
  previous.current_fully_reviewed!==2131||previous.current_reviewed_lines!==249056||
  previous.current_remaining!==2648||rescue.source_commit!==source||
  rescue.transfers.length!==28||rescueMap.size!==28||
  qa.rescue_transfer_paths!==28||qa.effective_ownership_transfers!==88) {
  throw new Error('Strict C013 QA or baseline/rescue mismatch');
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
const base=parseCsv(readFileSync(join(cp,'C012-d67b2a4a-current-ledger.csv'),'utf8'));
const acceptedMap=new Map(accepted.map(a=>[a.path,a]));
if(acceptedMap.size!==175) throw new Error('Duplicate accepted path');
const resultCache=new Map(),records=[];
for(const item of accepted){
  if(!resultCache.has(item.record_file)) {
    resultCache.set(item.record_file,new Map(JSON.parse(readFileSync(item.record_file,'utf8')).map(x=>[x.path,x])));
  }
  const record=resultCache.get(item.record_file).get(item.path);
  if(!record||record.batch!=='C013'||record.source_sha256!==item.source_sha256) {
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
    throw new Error('Previously credited or stale source '+before.path);
  }
  const record=byRecord.get(before.path),row={...before};
  row.current_status='fully_reviewed';
  row.current_review_batch='C013';
  row.current_reviewer=item.actual_reviewer;
  row.current_review_source_sha256=item.source_sha256;
  row.current_review_notes=record.semantic_review_notes;
  row.current_review_finding_ids=(record.finding_ids??[]).join(';');
  row.dependency_impact_review='REVIEWED_CURRENT_SOURCE_C013';
  row.classification='CURRENT_REVIEWED_C013';
  return row;
});
const eligible=rows.filter(r=>r.authored_code_candidate==='True');
const reviewed=eligible.filter(r=>r.current_status==='fully_reviewed');
const pending=eligible.filter(r=>r.current_status!=='fully_reviewed');
const countLines=data=>data.reduce((n,x)=>n+Number(x.lines),0);
const newlyReviewedLines=accepted.reduce((n,x)=>n+x.lines,0);
if(eligible.length!==4779||countLines(eligible)!==619108||reviewed.length!==2306||
  pending.length!==2473||countLines(reviewed)!==qa.if_accepted_lines||
  countLines(reviewed)-previous.current_reviewed_lines!==newlyReviewedLines) {
  throw new Error('C013 file/line coverage reconciliation failed');
}
const transfers=transferManifest.transfers.map(t=>({...t,
  assigned_reviewer:t.actual_reviewer,
  actual_reviewer:rescueMap.get(t.path)?.actual_reviewer??t.actual_reviewer,
  status:acceptedMap.has(t.path)?'fully_reviewed_prime_qa_pass':'pending'}));
for(const t of rescue.transfers.filter(t=>t.original_owner==='W3')) {
  transfers.push({...t,assigned_reviewer:'W3',
    status:acceptedMap.has(t.path)?'fully_reviewed_prime_qa_pass':'pending'});
}
if(transfers.length!==88||new Set(transfers.map(t=>t.path)).size!==88||
  transfers.some(t=>t.status!=='fully_reviewed_prime_qa_pass'||
    acceptedMap.get(t.path)?.actual_reviewer!==t.actual_reviewer)) {
  throw new Error('Unreviewed or mismatched transfer');
}
const summary={checkpoint:'C013',source_commit:source,source_tree:previous.source_tree,
  parent_docs_commit:docsParent,
  immutable_roster_docs_commit:'3bb421047a50f2e6fe2f303d0be6739961b2f793',
  candidate_files:eligible.length,candidate_lines:countLines(eligible),
  previous_current_fully_reviewed:previous.current_fully_reviewed,
  previous_current_reviewed_lines:previous.current_reviewed_lines,
  newly_reviewed:accepted.length,newly_reviewed_lines:newlyReviewedLines,
  current_fully_reviewed:reviewed.length,current_reviewed_lines:countLines(reviewed),
  current_remaining:pending.length,file_percent:100*reviewed.length/eligible.length,
  line_percent:100*countLines(reviewed)/countLines(eligible),
  logical_workers:7,active_reviewers:6,ownership_transfers:88,
  rescue_reassigned_paths:28,
  errors:0,runtime_tests_executed:0,static_only:true};
writeFileSync(prefix+'review-records.json',JSON.stringify(records,null,2)+'\n');
writeFileSync(prefix+'coverage-summary.json',JSON.stringify(summary,null,2)+'\n');
writeFileSync(prefix+'current-ledger.csv',
  [base.fields.join(','),...rows.map(row=>base.fields.map(k=>quote(row[k])).join(','))].join('\n')+'\n');
writeFileSync(prefix+'current-remaining.txt',pending.map(row=>row.path).join('\n')+'\n');
writeFileSync(prefix+'qa-summary.json',JSON.stringify({source_commit:source,exact_roster:175,
  valid_records:qa.valid,invalid_records:qa.invalid,missing_records:qa.missing,
  unique_paths:175,ownership_transfers:88,rescue_reassigned_paths:28,
  prime_independent_spot_review_completed:true,
  prime_spot_review_evidence:'C013-d67b2a4a-prime-spot-checks.md',
  runtime_tests:'NOT_EXECUTED — STATIC_AUDIT_ONLY'},null,2)+'\n');
writeFileSync(prefix+'ownership-transfers.json',JSON.stringify({
  ...transferManifest,effective_transfer_count:88,rescue_reassigned_paths:28,
  transfers},null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
