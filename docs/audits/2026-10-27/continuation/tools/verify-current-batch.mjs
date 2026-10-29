#!/usr/bin/env node
// Independent quality gate for the 7-logical-role, 5-active-reviewer audit epoch.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [batch,sourceDir,rootDir,resultsDir,strict] = process.argv.slice(2);
if (!/^C\d{3}$/.test(batch ?? '') || !sourceDir || !rootDir || !resultsDir) {
  throw new Error('Usage: verify-current-batch.mjs C012 SOURCE_DIR CONTINUATION_DIR RESULTS_DIR [--strict]');
}
const source = resolve(sourceDir), root = resolve(rootDir), results = resolve(resultsDir);
const fullSha = 'd67b2a4a4897b4a73d21aba630fc5ab52ff9169b';
const tree = '8731302512f8db4edb8bbb1cdc50b208a0dcb5b8';
const prefix = join(root,'checkpoints',batch+'-d67b2a4a-');
const git = (...args) => execFileSync('git',['-C',source,...args],{encoding:'utf8'}).trim();
if (git('rev-parse','HEAD')!==fullSha || git('rev-parse','HEAD^{tree}')!==tree || git('status','--porcelain')) {
  throw new Error('Source worktree not clean/pinned');
}
const roster = JSON.parse(readFileSync(prefix+'assignment-roster.json','utf8'));
const transfers = JSON.parse(readFileSync(prefix+'ownership-transfers.json','utf8'));
const previousCheckpoint=batch==='C013'?'C012':'C011';
const previous=JSON.parse(readFileSync(join(root,'checkpoints',previousCheckpoint+'-d67b2a4a-coverage-summary.json'),'utf8'));
const initialTransferCount=batch==='C013'?75:50;
if (roster.batch!==batch || !roster.immutable || roster.source_commit!==fullSha ||
    roster.source_tree!==tree || roster.assignments.length!==175 ||
    transfers.batch!==batch || transfers.source_commit!==fullSha ||
    transfers.transfers.length!==initialTransferCount ||
    previous.source_commit!==fullSha) {
  throw new Error('Pinned roster/transfer provenance mismatch');
}
const byPath = new Map(roster.assignments.map(a=>[a.path,a]));
const byTransfer = new Map(transfers.transfers.map(t=>[t.path,t]));
if (byPath.size!==175 || byTransfer.size!==initialTransferCount) throw new Error('Duplicate assignment/transfer');
const fallbackFile=prefix+'w2-fallback-addendum.json';
const fallback=existsSync(fallbackFile)?JSON.parse(readFileSync(fallbackFile,'utf8')):null;
const fallbackMap=new Map((fallback?.transfers??[]).map(t=>[t.path,t]));
const rescueFile=prefix+'w3-rescue-addendum.json';
const rescue=existsSync(rescueFile)?JSON.parse(readFileSync(rescueFile,'utf8')):null;
const rescueMap=new Map((rescue?.transfers??[]).map(t=>[t.path,t]));
const w8FallbackFile=prefix+'w8-fallback-addendum.json';
const w8Fallback=existsSync(w8FallbackFile)?JSON.parse(readFileSync(w8FallbackFile,'utf8')):null;
const w8FallbackMap=new Map((w8Fallback?.transfers??[]).map(t=>[t.path,t]));
if(fallback && (fallback.batch!==batch||fallback.source_commit!==fullSha||
  fallback.superseded_assigned_reviewer!=='W2'||fallback.transfers.length!==35||
  fallbackMap.size!==35)) throw new Error('Fallback addendum provenance mismatch');
if(rescue && (batch!=='C013'||rescue.batch!==batch||rescue.source_commit!==fullSha||
  rescue.superseded_assigned_reviewer!=='W3'||rescue.transfers.length!==28||
  rescueMap.size!==28||rescue.w3_completed_full_source_reads_pending_persistence!==17)) {
  throw new Error('W3 rescue addendum provenance mismatch');
}
if(w8Fallback && (batch!=='C013'||w8Fallback.batch!==batch||
  w8Fallback.source_commit!==fullSha||w8Fallback.superseded_actual_reviewer!=='W8'||
  w8Fallback.w8_completed_full_semantic_reviews!==0||w8Fallback.transfers.length!==14||
  w8FallbackMap.size!==14||w8Fallback.reviewer_counts?.Prime!==7||
  w8Fallback.reviewer_counts?.W9!==7)) {
  throw new Error('W8 fallback addendum provenance mismatch');
}
const effectiveReviewer=a=>w8FallbackMap.get(a.path)?.actual_reviewer??
  rescueMap.get(a.path)?.actual_reviewer??
  fallbackMap.get(a.path)?.actual_reviewer??a.assigned_reviewer;
for(const [path,t] of w8FallbackMap) {
  const previous=rescueMap.get(path),assignment=byPath.get(path);
  if(!previous||previous.actual_reviewer!=='W8'||!assignment||
    t.prior_actual_reviewer!=='W8'||t.original_owner!==assignment.original_owner||
    !['Prime','W9'].includes(t.actual_reviewer)||t.original_assigned_reviewer!=='W3') {
    throw new Error('Invalid W8 fallback ownership: '+path);
  }
}
for(const [path,t] of rescueMap) {
  const a=byPath.get(path);
  if(!a||a.assigned_reviewer!=='W3'||t.original_assigned_reviewer!=='W3'||
    t.original_owner!==a.original_owner||
    !['W8','W9'].includes(t.actual_reviewer)||fallbackMap.has(path)) {
    throw new Error('Invalid W3 rescue ownership: '+path);
  }
}
for(const [path,t] of fallbackMap) {
  const a=byPath.get(path);
  if(!a||a.assigned_reviewer!=='W2'||t.original_assigned_reviewer!=='W2'||
    t.original_owner!==a.original_owner||!['W3','W4'].includes(t.actual_reviewer)) {
    throw new Error('Invalid W2 fallback assignment: '+path);
  }
}
if(fallback) {
  for(const name of ['C012-W2-review-records.json','C012-transferred-W6-review-records.json']) {
    const file=join(results,'W2',name);
    if(existsSync(file)&&JSON.parse(readFileSync(file,'utf8')).length) {
      throw new Error('Uncredited W2 output appeared after immutable supersession: '+file);
    }
  }
}
for (const assignment of roster.assignments) {
  const transfer = byTransfer.get(assignment.path);
  const isTransferred = assignment.assigned_reviewer!==assignment.original_owner;
  if (!['W1','W2','W3','W4','W5'].includes(assignment.assigned_reviewer) ||
      !['W1','W2','W3','W4','W5','W6','W7'].includes(assignment.original_owner) ||
      assignment.source_commit!==fullSha || assignment.batch!==batch ||
      Boolean(transfer)!==isTransferred ||
      (transfer && (transfer.actual_reviewer!==assignment.assigned_reviewer ||
        transfer.original_owner!==assignment.original_owner))) {
    throw new Error('Invalid ownership: '+assignment.path);
  }
}
const entries = execFileSync('git',['-C',source,'ls-tree','-rz','HEAD']).toString('utf8').split('\0').filter(Boolean);
const blobs = new Map(entries.map(raw=>{
  const match=/^\d+ blob ([a-f0-9]{40})\t(.+)$/.exec(raw);
  if (!match) throw new Error('Unexpected Git tree entry '+raw);
  return [match[2],match[1]];
}));
const expectedFiles=new Map();
for (const a of roster.assignments) {
  const reviewer=effectiveReviewer(a);
  const filename=a.original_owner===reviewer
    ? `${batch}-${reviewer}-review-records.json`
    : `${batch}-transferred-${a.original_owner}-review-records.json`;
  const file=join(results,reviewer,filename);
  if (!expectedFiles.has(file)) expectedFiles.set(file,new Set());
  expectedFiles.get(file).add(a.path);
}
const accepted=[],errors=[],seen=new Set(),files=[],cached=new Map();
function metadata(path) {
  if (cached.has(path)) return cached.get(path);
  const oid=blobs.get(path);
  if (!oid) throw new Error('Assigned file absent from Git tree: '+path);
  const bytes=execFileSync('git',['-C',source,'cat-file','blob',oid],{maxBuffer:30*1024*1024});
  const text=bytes.toString('utf8');
  const value={source_sha256:createHash('sha256').update(bytes).digest('hex'),
    lines:text?text.split('\n').length-Number(text.endsWith('\n')):0};
  cached.set(path,value);return value;
}
const norm = value => String(value??'').toUpperCase().replace(/^WORKER-/,'W');
for (const [file,expected] of expectedFiles) {
  if (!existsSync(file)) continue;
  let records;
  try {records=JSON.parse(readFileSync(file,'utf8'));}
  catch(error) {errors.push('Unparseable '+file+': '+error);continue;}
  if (!Array.isArray(records)) {errors.push('Nonarray '+file);continue;}
  files.push({file,records:records.length,expected:expected.size});
  for (const record of records) {
    const path=record.path;
    if (!expected.has(path)) {errors.push('Unassigned '+path+' in '+file);continue;}
    if (seen.has(path)) {errors.push('Duplicate '+path);continue;}
    seen.add(path);
    const a=byPath.get(path),meta=metadata(path),flaws=[];
    if (record.batch!==batch || record.source_commit!==fullSha || record.status!=='fully_reviewed') flaws.push('batch/source/status');
    if (record.source_sha256!==meta.source_sha256) flaws.push('blob SHA256');
    if (norm(record.original_owner??record.original_worker??record.worker)!==a.original_owner ||
        norm(record.actual_reviewer??record.reviewer)!==norm(effectiveReviewer(a))) flaws.push('owner/reviewer');
    const ranges=(record.read_ranges??[]).map(x=>Array.isArray(x)?{start:x[0],end:x[1]}:x).sort((a,b)=>a.start-b.start);
    if (!ranges.length || ranges[0].start!==1 || ranges.at(-1).end!==meta.lines) flaws.push('full read ranges');
    for(let i=0;i<ranges.length;i++){
      const x=ranges[i];
      if(!Number.isInteger(x.start)||!Number.isInteger(x.end)||x.start>x.end||x.end>meta.lines||
         i>0&&x.start!==ranges[i-1].end+1) flaws.push('read range gap/overlap');
    }
    for(const key of ['semantic_review_notes','callers_consumers','invariants_error_checks','limits']) {
      if(typeof record[key]!=='string'||record[key].trim().length<25) flaws.push('thin '+key);
    }
    if(!Array.isArray(record.test_refs??record.test_references) ||
       !(record.test_refs??record.test_references).length) flaws.push('test references');
    if(!Array.isArray(record.finding_ids??[])) flaws.push('finding IDs');
    if(flaws.length) errors.push(path+': '+[...new Set(flaws)].join(', '));
    else accepted.push({path,original_owner:a.original_owner,actual_reviewer:effectiveReviewer(a),
      source_sha256:meta.source_sha256,lines:meta.lines,record_file:file,finding_ids:record.finding_ids??[]});
  }
}
const missing=roster.assignments.map(a=>a.path).filter(p=>!seen.has(p));
const effectiveTransfers=roster.assignments.filter(a=>a.original_owner!==effectiveReviewer(a));
if(effectiveTransfers.length!==(initialTransferCount+(fallback?25:0)+(rescue?13:0))) {
  throw new Error('Effective unique transfer count mismatch');
}
const report={batch,source_commit:fullSha,source_tree:tree,expected:175,valid:accepted.length,
  invalid:errors.length,missing:missing.length,initial_ownership_transfers:initialTransferCount,
  fallback_transfer_paths:fallback?.transfers.length??0,
  rescue_transfer_paths:rescue?.transfers.length??0,
  w8_fallback_reassigned_paths:w8Fallback?.transfers.length??0,
  effective_ownership_transfers:effectiveTransfers.length,
  current_base_files:previous.current_fully_reviewed,current_base_lines:previous.current_reviewed_lines,
  if_accepted_files:previous.current_fully_reviewed+accepted.length,
  if_accepted_lines:previous.current_reviewed_lines+accepted.reduce((n,x)=>n+x.lines,0),
  source_files:files,errors,missing_paths:missing,tests:'NOT_EXECUTED — STATIC_AUDIT_ONLY'};
writeFileSync(join(results,'Prime',batch+'-qa-provisional.json'),JSON.stringify(report,null,2)+'\n');
writeFileSync(join(results,'Prime',batch+'-qa-accepted.json'),JSON.stringify(accepted,null,2)+'\n');
console.log(JSON.stringify({expected:175,valid:report.valid,invalid:report.invalid,
  missing:report.missing,files,errors:errors.slice(0,10)},null,2));
if(errors.length || strict==='--strict' && missing.length) process.exitCode=1;
