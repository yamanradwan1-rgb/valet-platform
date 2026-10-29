#!/usr/bin/env node
// Promote only independently accepted, pinned C012 records into cumulative current-source evidence.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [rootArg,resultsArg]=process.argv.slice(2);
if(!rootArg||!resultsArg) throw new Error('Usage: promote-c012.mjs CONTINUATION_DIR RESULTS_DIR');
const root=resolve(rootArg), results=resolve(resultsArg), checkpoints=join(root,'checkpoints');
const prefix=join(checkpoints,'C012-d67b2a4a-');
const source='d67b2a4a4897b4a73d21aba630fc5ab52ff9169b';
const qa=JSON.parse(readFileSync(join(results,'Prime','C012-qa-provisional.json'),'utf8'));
const accepted=JSON.parse(readFileSync(join(results,'Prime','C012-qa-accepted.json'),'utf8'));
const roster=JSON.parse(readFileSync(prefix+'assignment-roster.json','utf8'));
const transferManifest=JSON.parse(readFileSync(prefix+'ownership-transfers.json','utf8'));
const fallback=JSON.parse(readFileSync(prefix+'w2-fallback-addendum.json','utf8'));
const previous=JSON.parse(readFileSync(join(checkpoints,'C011-d67b2a4a-coverage-summary.json'),'utf8'));
const spot=prefix+'prime-spot-checks.md';
if(!existsSync(spot)) throw new Error('Prime independent source spot-check evidence missing');
if(qa.source_commit!==source||qa.expected!==175||qa.valid!==175||qa.invalid||qa.missing||
  accepted.length!==175||roster.assignments.length!==175||
  ![50,75].includes(transferManifest.transfers.length)||fallback.transfers.length!==35||
  previous.source_commit!==source||previous.current_fully_reviewed!==1956||
  previous.current_reviewed_lines!==229863||previous.current_remaining!==2823) {
  throw new Error('C012 strict QA/previous pinned baseline failed');
}
function parseCsv(content) {
  const rows=[];let fields=[],field='',row=[],quoted=false;
  for(let i=0;i<content.length;i++) {
    const char=content[i];
    if(char==='"') {if(quoted && content[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
    else if(char===','&&!quoted) {row.push(field);field='';}
    else if(char==='\n'&&!quoted) {row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}
    else field+=char;
  }
  if(quoted) throw new Error('Unterminated CSV');
  if(row.length||field) {row.push(field);rows.push(row);}
  fields=rows.shift();
  return {fields,rows:rows.map((values,index)=>{
    if(values.length!==fields.length) throw new Error('Bad CSV row '+(index+2));
    return Object.fromEntries(fields.map((key,j)=>[key,values[j]]));
  })};
}
const quote=value=>'"'+String(value??'').replaceAll('"','""')+'"';
const base=parseCsv(readFileSync(join(checkpoints,'C011-d67b2a4a-current-ledger.csv'),'utf8'));
const acceptedMap=new Map(accepted.map(a=>[a.path,a]));
if(acceptedMap.size!==175) throw new Error('Duplicate accepted paths');
const files=new Map(),records=[];
for(const item of accepted) {
  if(!files.has(item.record_file)) files.set(item.record_file,
    new Map(JSON.parse(readFileSync(item.record_file,'utf8')).map(r=>[r.path,r])));
  const record=files.get(item.record_file).get(item.path);
  if(!record||record.source_sha256!==item.source_sha256||record.batch!=='C012') {
    throw new Error('Changed worker evidence '+item.path);
  }
  records.push({...record,original_owner:item.original_owner,actual_reviewer:item.actual_reviewer});
}
records.sort((a,b)=>a.path.localeCompare(b.path));
const recordMap=new Map(records.map(r=>[r.path,r]));
const rows=base.rows.map(original=>{
  const item=acceptedMap.get(original.path);
  if(!item) return original;
  if(original.current_status==='fully_reviewed'||original.current_baseline_sha!==source||
    original.current_source_sha256!==item.source_sha256||Number(original.lines)!==item.lines) {
    throw new Error('Previously credited/stale path '+original.path);
  }
  const next={...original},record=recordMap.get(original.path);
  next.current_status='fully_reviewed';
  next.current_review_batch='C012';
  next.current_reviewer=item.actual_reviewer;
  next.current_review_source_sha256=item.source_sha256;
  next.current_review_notes=record.semantic_review_notes;
  next.current_review_finding_ids=(record.finding_ids??[]).join(';');
  next.dependency_impact_review='REVIEWED_CURRENT_SOURCE_C012';
  next.classification='CURRENT_REVIEWED_C012';
  return next;
});
const eligible=rows.filter(r=>r.authored_code_candidate==='True');
const reviewed=eligible.filter(r=>r.current_status==='fully_reviewed');
const remaining=eligible.filter(r=>r.current_status!=='fully_reviewed');
const lines=items=>items.reduce((total,r)=>total+Number(r.lines),0);
if(eligible.length!==4779||lines(eligible)!==619108||reviewed.length!==2131||
  remaining.length!==2648||lines(reviewed)!==qa.if_accepted_lines||
  lines(reviewed)-previous.current_reviewed_lines!==accepted.reduce((n,r)=>n+r.lines,0)) {
  throw new Error('Final current-source inventory/line accounting mismatch');
}
const effectiveMap=new Map(transferManifest.transfers.map(t=>[t.path,t]));
for(const change of fallback.transfers) effectiveMap.set(change.path,change);
if(effectiveMap.size!==75) throw new Error('Effective transfer provenance mismatch');
const transfers=[...effectiveMap.values()].map(t=>({
  ...t,status:acceptedMap.has(t.path)?'fully_reviewed_prime_qa_pass':'pending'}));
if(transfers.some(t=>t.status!=='fully_reviewed_prime_qa_pass')) throw new Error('Transfer incomplete');
const summary={checkpoint:'C012',source_commit:source,source_tree:previous.source_tree,
  parent_docs_commit:'3f14a77ea7f52b109b3d34a17f978e6bf0b50d0e',
  immutable_roster_docs_commit:'949efd590e287c3c5093d64b7adc86ac171b9907',
  candidate_files:eligible.length,candidate_lines:lines(eligible),
  previous_current_fully_reviewed:previous.current_fully_reviewed,
  previous_current_reviewed_lines:previous.current_reviewed_lines,
  newly_reviewed:accepted.length,newly_reviewed_lines:lines(reviewed)-previous.current_reviewed_lines,
  current_fully_reviewed:reviewed.length,current_reviewed_lines:lines(reviewed),
  current_remaining:remaining.length,file_percent:100*reviewed.length/eligible.length,
  line_percent:100*lines(reviewed)/lines(eligible),
  logical_workers:7,active_reviewers:4,ownership_transfers:75,
  w2_unresponsive_fallback_paths:35,
  errors:0,runtime_tests_executed:0,static_only:true};
writeFileSync(prefix+'review-records.json',JSON.stringify(records,null,2)+'\n');
writeFileSync(prefix+'coverage-summary.json',JSON.stringify(summary,null,2)+'\n');
writeFileSync(prefix+'current-ledger.csv',
  [base.fields.join(','),...rows.map(r=>base.fields.map(key=>quote(r[key])).join(','))].join('\n')+'\n');
writeFileSync(prefix+'current-remaining.txt',remaining.map(r=>r.path).join('\n')+'\n');
writeFileSync(prefix+'qa-summary.json',JSON.stringify({source_commit:source,exact_roster:175,
  valid_records:175,invalid_records:0,missing_records:0,unique_paths:175,
  ownership_transfers:75,original_transfer_roster:50,later_w2_fallback_transfer_paths:35,
  prime_independent_spot_review_completed:true,
  prime_spot_review_evidence:'C012-d67b2a4a-prime-spot-checks.md',
  runtime_tests:'NOT_EXECUTED — STATIC_AUDIT_ONLY'},null,2)+'\n');
writeFileSync(prefix+'ownership-transfers.json',JSON.stringify({
  ...transferManifest,initial_transfer_count:50,
  w2_fallback_addendum:'C012-d67b2a4a-w2-fallback-addendum.json',
  effective_transfer_count:75,transfers},null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
