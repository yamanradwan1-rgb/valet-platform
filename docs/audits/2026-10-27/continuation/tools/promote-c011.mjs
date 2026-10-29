#!/usr/bin/env node
// Incrementally promote only strict-QA accepted C011 source reviews from published C010.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [rootArg, resultsArg] = process.argv.slice(2);
if (!rootArg || !resultsArg) throw new Error('Usage: promote-c011.mjs CONTINUATION_DIR RESULTS_DIR');
const root = resolve(rootArg), results = resolve(resultsArg), prefix = join(root,'checkpoints','C011-d67b2a4a');
const source = 'd67b2a4a4897b4a73d21aba630fc5ab52ff9169b';
const qa = JSON.parse(readFileSync(join(results,'Prime','C011-qa-provisional.json'),'utf8'));
const accepted = JSON.parse(readFileSync(join(results,'Prime','C011-qa-accepted.json'),'utf8'));
const roster = JSON.parse(readFileSync(prefix+'-assignment-roster.json','utf8'));
const transfers = JSON.parse(readFileSync(prefix+'-ownership-transfers.json','utf8'));
const fallback = JSON.parse(readFileSync(prefix+'-w1-fallback-addendum.json','utf8'));
const previous = JSON.parse(readFileSync(join(root,'checkpoints','C010-d67b2a4a-coverage-summary.json'),'utf8'));
if (qa.source_commit !== source || qa.expected !== 175 || qa.valid !== 175 || qa.invalid || qa.missing ||
    accepted.length !== 175 || roster.assignments.length !== 175 || ![50,75].includes(transfers.transfers.length) || fallback.transfers.length !== 35 ||
    previous.source_commit !== source || previous.current_fully_reviewed !== 1781 || previous.current_remaining !== 2998) {
  throw new Error('C011 has not passed exact independent QA');
}

function csvRows(text) {
  const records = []; let current=[], value='', quoted=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"') { if(quoted && text[i+1]==='"') { value+='"';i++; } else quoted=!quoted; }
    else if(c===',' && !quoted) { current.push(value);value=''; }
    else if(c==='\n' && !quoted) { current.push(value.replace(/\r$/,''));records.push(current);current=[];value=''; }
    else value+=c;
  }
  if(quoted) throw new Error('Unclosed CSV quote');
  if(value || current.length) { current.push(value); records.push(current); }
  const fields=records.shift();
  return { fields, rows:records.map((values,i)=>{
    if(values.length!==fields.length) throw new Error(`Invalid ledger CSV row ${i+2}`);
    return Object.fromEntries(fields.map((field,j)=>[field,values[j]]));
  }) };
}
const quote = value => '"'+String(value??'').replaceAll('"','""')+'"';
const base = csvRows(readFileSync(join(root,'checkpoints','C010-d67b2a4a-current-ledger.csv'),'utf8'));
const acceptedPaths=new Map(accepted.map(x=>[x.path,x]));
if(acceptedPaths.size!==175) throw new Error('Duplicate accepted records');
const effectiveTransferMap=new Map(transfers.transfers.map(item=>[item.path,item]));
for(const item of fallback.transfers) effectiveTransferMap.set(item.path,item);
if(effectiveTransferMap.size!==75) throw new Error('Unexpected effective transfer count');
const perResultFile=new Map(), records=[];
for(const item of accepted) {
  if(!perResultFile.has(item.record_file)) perResultFile.set(item.record_file,
    new Map(JSON.parse(readFileSync(item.record_file,'utf8')).map(record=>[record.path,record])));
  const record=perResultFile.get(item.record_file).get(item.path);
  if(!record || record.source_sha256!==item.source_sha256) throw new Error(`Worker evidence changed: ${item.path}`);
  records.push({...record,original_owner:item.original_owner,actual_reviewer:item.actual_reviewer});
}
records.sort((a,b)=>a.path.localeCompare(b.path));
const byRecord=new Map(records.map(x=>[x.path,x]));
const rows=base.rows.map(before=>{
  const item=acceptedPaths.get(before.path);
  if(!item) return before;
  if(before.current_status==='fully_reviewed' || before.current_baseline_sha!==source ||
     before.current_source_sha256!==item.source_sha256 || Number(before.lines)!==item.lines) {
    throw new Error('Unacceptable C011 baseline state: '+before.path);
  }
  const row={...before},record=byRecord.get(before.path);
  row.current_status='fully_reviewed';row.current_review_batch='C011';row.current_reviewer=item.actual_reviewer;
  row.current_review_source_sha256=item.source_sha256;
  row.current_review_notes=record.semantic_review_notes;
  row.current_review_finding_ids=(record.finding_ids??[]).join(';');
  row.dependency_impact_review='REVIEWED_CURRENT_SOURCE_C011';
  row.classification='CURRENT_REVIEWED_C011';return row;
});
const eligible=rows.filter(x=>x.authored_code_candidate==='True');
const reviewed=eligible.filter(x=>x.current_status==='fully_reviewed');
const pending=eligible.filter(x=>x.current_status!=='fully_reviewed');
const sumLines=records=>records.reduce((n,x)=>n+Number(x.lines),0);
if(eligible.length!==4779 || sumLines(eligible)!==619108 || reviewed.length!==1956 || pending.length!==2823 ||
    sumLines(reviewed)!==qa.if_accepted_lines || sumLines(reviewed)-previous.current_reviewed_lines!==accepted.reduce((n,x)=>n+x.lines,0)) {
  throw new Error('Independent current-source totals do not reconcile');
}
const summary={checkpoint:'C011',source_commit:source,source_tree:previous.source_tree,
  parent_docs_commit:'56c0c753a70b3a9678f3526d5c5a96caf5db3c40',
  immutable_roster_docs_commit:'88e70de4b5ab0dfa560ab2220e846c461ffec93d',
  candidate_files:eligible.length,candidate_lines:sumLines(eligible),
  previous_current_fully_reviewed:previous.current_fully_reviewed,previous_current_reviewed_lines:previous.current_reviewed_lines,
  newly_reviewed:accepted.length,newly_reviewed_lines:sumLines(reviewed)-previous.current_reviewed_lines,
  current_fully_reviewed:reviewed.length,current_reviewed_lines:sumLines(reviewed),current_remaining:pending.length,
  file_percent:100*reviewed.length/eligible.length,line_percent:100*sumLines(reviewed)/sumLines(eligible),
  logical_workers:7,active_reviewers:4,ownership_transfers:effectiveTransferMap.size,
  w1_unresponsive_fallback_paths:fallback.transfers.length,
  errors:0,runtime_tests_executed:0,static_only:true};
const completed=[...effectiveTransferMap.values()].map(item=>({...item,status:acceptedPaths.has(item.path)?'fully_reviewed_prime_qa_pass':'pending'}));
if(completed.some(x=>x.status!=='fully_reviewed_prime_qa_pass')) throw new Error('Incomplete ownership transfer');
writeFileSync(prefix+'-review-records.json',JSON.stringify(records,null,2)+'\n');
writeFileSync(prefix+'-coverage-summary.json',JSON.stringify(summary,null,2)+'\n');
writeFileSync(prefix+'-current-ledger.csv',[base.fields.join(','),...rows.map(row=>base.fields.map(x=>quote(row[x])).join(','))].join('\n')+'\n');
writeFileSync(prefix+'-current-remaining.txt',pending.map(x=>x.path).join('\n')+'\n');
writeFileSync(prefix+'-qa-summary.json',JSON.stringify({source_commit:source,exact_roster:175,valid_records:qa.valid,invalid_records:qa.invalid,
  missing_records:qa.missing,unique_paths:acceptedPaths.size,ownership_transfers:completed.length,
  original_transfer_roster:50,later_w1_fallback_transfer_paths:35,
  prime_independent_spot_review_completed:true,prime_spot_review_count:6,
  prime_spot_review_evidence:'C011-d67b2a4a-prime-spot-checks.md',
  runtime_tests:'NOT_EXECUTED — STATIC_AUDIT_ONLY'},null,2)+'\n');
writeFileSync(prefix+'-ownership-transfers.json',JSON.stringify({...transfers,
  initial_transfer_count:50,w1_fallback_addendum:'C011-d67b2a4a-w1-fallback-addendum.json',
  effective_transfer_count:completed.length,transfers:completed},null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
