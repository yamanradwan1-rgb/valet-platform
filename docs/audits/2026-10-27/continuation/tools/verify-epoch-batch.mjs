#!/usr/bin/env node
// Independent semantic evidence gate for later pinned source-epoch batches.
// This verifier never promotes credit or runs product/runtime tests.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';

const [batch,sourceArg,rootArg,resultsArg,strict]=process.argv.slice(2);
if(!/^C\d{3}$/.test(batch??'')||!sourceArg||!rootArg||!resultsArg)
  throw new Error('Usage: verify-epoch-batch.mjs C017 SOURCE_DIR CONTINUATION_DIR RESULTS_DIR [--strict]');
const source=resolve(sourceArg),root=resolve(rootArg),results=resolve(resultsArg),cp=join(root,'checkpoints');
const git=(...args)=>execFileSync('git',['-C',source,...args],{encoding:'utf8',maxBuffer:20*1024*1024}).trim();
const sha=git('rev-parse','HEAD'),tree=git('rev-parse','HEAD^{tree}');
if(git('status','--porcelain'))throw new Error('Source worktree not clean');
const prefix=join(cp,`${batch}-${sha.slice(0,8)}-`);
const readFile=name=>JSON.parse(readFileSync(name,'utf8'));
const roster=readFile(prefix+'assignment-roster.json'),transfers=readFile(prefix+'ownership-transfers.json');
const priorBatch='C'+String(Number(batch.slice(1))-1).padStart(3,'0');
const previousPath=batch==='C017'
  ?join(root,'rebaselines',sha,'summary.json')
  :join(cp,`${priorBatch}-${sha.slice(0,8)}-coverage-summary.json`);
const previous=readFile(previousPath);
const remainingPath=batch==='C017'
  ?join(root,'rebaselines',sha,'current-remaining-files.txt')
  :join(cp,`${priorBatch}-${sha.slice(0,8)}-current-remaining.txt`);
const remaining=new Set(readFileSync(remainingPath,'utf8').trim().split(/\r?\n/));
const entries=roster.assignments??[],ts=transfers.transfers??[];
if(!roster.immutable||roster.batch!==batch||roster.source_commit!==sha||roster.source_tree!==tree||
   transfers.batch!==batch||transfers.source_commit!==sha||
   (previous.source_commit??previous.current_source_sha)!==sha||
   entries.length<1||entries.length>175||new Set(entries.map(a=>a.path)).size!==entries.length||
   new Set(ts.map(t=>t.path)).size!==ts.length||remaining.size!==previous.current_remaining){
  throw new Error('Pinned epoch roster/baseline/transfer mismatch');
}
const byAssignment=new Map(entries.map(a=>[a.path,a])),byTransfer=new Map(ts.map(t=>[t.path,t]));
const expectedFiles=new Map(),counts=new Map();
for(const a of entries){
  const t=byTransfer.get(a.path),isTransferred=a.original_owner!==a.assigned_reviewer;
  if(!remaining.has(a.path)||a.batch!==batch||a.source_commit!==sha||
     !/^W[1-7]$/.test(a.original_owner)||!/^W[1-7]$/.test(a.assigned_reviewer)||
     Boolean(t)!==isTransferred||
     (t&&(t.batch!==batch||t.source_commit!==sha||t.original_owner!==a.original_owner||t.actual_reviewer!==a.assigned_reviewer))){
    throw new Error('Unbacked/duplicate/invalid epoch assignment '+a.path);
  }
  counts.set(a.assigned_reviewer,(counts.get(a.assigned_reviewer)??0)+1);
  const filename=a.original_owner===a.assigned_reviewer
    ?`${batch}-${a.assigned_reviewer}-review-records.json`
    :`${batch}-transferred-${a.original_owner}-review-records.json`;
  const file=join(results,a.assigned_reviewer,filename);
  if(!expectedFiles.has(file))expectedFiles.set(file,new Set());
  expectedFiles.get(file).add(a.path);
}
if(ts.length!==entries.filter(a=>a.original_owner!==a.assigned_reviewer).length||
   ts.some(t=>!byAssignment.has(t.path)))throw new Error('Transfer count mismatch');
const raw=execFileSync('git',['-C',source,'ls-tree','-rz','HEAD'],{maxBuffer:15*1024*1024});
const blobs=new Map(raw.toString('utf8').split('\0').filter(Boolean).map(line=>{
  const m=/^\d+ blob ([a-f0-9]{40})\t(.+)$/.exec(line);
  if(!m)throw new Error('Nonblob tree entry');return[m[2],m[1]];
}));
const metadataCache=new Map();
function metadata(path){
  if(metadataCache.has(path))return metadataCache.get(path);
  const oid=blobs.get(path);if(!oid)throw new Error('Assigned path missing from exact source '+path);
  const bytes=execFileSync('git',['-C',source,'cat-file','blob',oid],{maxBuffer:30*1024*1024});
  const body=bytes.toString('utf8'),out={sha256:createHash('sha256').update(bytes).digest('hex'),
    lines:body?body.split('\n').length-Number(body.endsWith('\n')):0};
  metadataCache.set(path,out);return out;
}
const accepted=[],seen=new Set(),errors=[],files=[];
const looksLikeTestReference=path=>/(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path);
for(const [file,expected] of expectedFiles){
  if(!existsSync(file))continue;
  let records;
  try{records=readFile(file);}catch(error){errors.push('Unparseable '+file+': '+error);continue;}
  if(!Array.isArray(records)){errors.push('Nonarray '+file);continue;}
  files.push({file,records:records.length,expected:expected.size});
  for(const record of records){
    const path=record.path;
    if(!expected.has(path)){errors.push('Unassigned record '+path+' in '+file);continue;}
    if(seen.has(path)){errors.push('Duplicate review credit '+path);continue;}
    seen.add(path);
    const a=byAssignment.get(path),meta=metadata(path),flaws=[];
    if(record.batch!==batch||record.source_commit!==sha||record.status!=='fully_reviewed')flaws.push('batch/source/status');
    if(record.source_sha256!==meta.sha256)flaws.push('canonical Git SHA256');
    if(record.original_owner!==a.original_owner||record.actual_reviewer!==a.assigned_reviewer)flaws.push('reviewer ownership');
    const ranges=(record.read_ranges??[]).map(x=>Array.isArray(x)?{start:x[0],end:x[1]}:x).sort((a,b)=>a.start-b.start);
    if(!ranges.length||ranges[0].start!==1||ranges.at(-1).end!==meta.lines)flaws.push('full file range');
    for(let i=0;i<ranges.length;i++){
      const x=ranges[i];
      if(!Number.isInteger(x.start)||!Number.isInteger(x.end)||x.start>x.end||x.end>meta.lines||
         i>0&&x.start!==ranges[i-1].end+1)flaws.push('range gap or overlap');
    }
    for(const key of ['semantic_review_notes','callers_consumers','invariants_error_checks','limits'])
      if(typeof record[key]!=='string'||record[key].trim().length<25)flaws.push('thin '+key);
    const testRefs=record.test_refs??record.test_references;
    if(!Array.isArray(testRefs)||!testRefs.length)flaws.push('test references');
    else if(!looksLikeTestReference(path)&&!testRefs.some(ref=>typeof ref==='string'&&looksLikeTestReference(ref))&&
      !/no (?:direct|focused|relevant)(?: focused| automated)? tests?/i.test(record.limits??'')){
      flaws.push('missing actual test ref or explicit focused-test gap');
    }
    if(!Array.isArray(record.finding_ids??[]))flaws.push('finding ids');
    if(flaws.length)errors.push(path+': '+[...new Set(flaws)].join(', '));
    else accepted.push({path,original_owner:a.original_owner,actual_reviewer:a.assigned_reviewer,
      source_sha256:meta.sha256,lines:meta.lines,record_file:file,finding_ids:record.finding_ids??[]});
  }
}
const missing=entries.map(a=>a.path).filter(p=>!seen.has(p));
const report={batch,source_commit:sha,source_tree:tree,expected:entries.length,
  valid:accepted.length,invalid:errors.length,missing:missing.length,
  previous_credit_files:previous.current_fully_reviewed,previous_credit_lines:previous.current_reviewed_lines,
  if_accepted_files:previous.current_fully_reviewed+accepted.length,
  if_accepted_lines:previous.current_reviewed_lines+accepted.reduce((n,x)=>n+x.lines,0),
  original_owners:Object.fromEntries(['W1','W2','W3','W4','W5','W6','W7'].map(w=>[w,entries.filter(a=>a.original_owner===w).length])),
  active_reviewers:Object.fromEntries(counts),effective_transfers:ts.length,
  source_files:files,errors,missing_paths:missing,runtime_tests:'NOT_EXECUTED — STATIC_AUDIT_ONLY'};
writeFileSync(join(results,'Prime',batch+'-qa-provisional.json'),JSON.stringify(report,null,2)+'\n');
writeFileSync(join(results,'Prime',batch+'-qa-accepted.json'),JSON.stringify(accepted,null,2)+'\n');
console.log(JSON.stringify({batch,expected:report.expected,valid:report.valid,invalid:report.invalid,
  missing:report.missing,files,errors:errors.slice(0,10)},null,2));
if(errors.length||(strict==='--strict'&&missing.length))process.exitCode=1;
