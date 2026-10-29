#!/usr/bin/env node
// Independent source-object and current-ledger QA for RB-003 (no product writes).
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';

const [sourceArg,rootArg]=process.argv.slice(2);
if(!sourceArg||!rootArg)throw new Error('Usage: verify-rb003-source.mjs NEW_SOURCE_DIR CONTINUATION_DIR');
const source=resolve(sourceArg),root=resolve(rootArg),now='0747a677ddf7fc3e1093490b7ef0a7bee9e2d938';
const old='d67b2a4a4897b4a73d21aba630fc5ab52ff9169b';
const dir=join(root,'rebaselines',now),get=name=>JSON.parse(readFileSync(join(dir,name),'utf8'));
const summary=get('summary.json'),stale=get('invalidated-published-reviews.json');
const fresh=get('new-source-candidates.json'),retained=get('reusable-published-reviews.json');
const change=get('git-diff-inventory.json');
const final=summary.dependency_impact_review==='COMPLETE_TARGETED_VALIDATION';
const dependency=final?get('invalidated-dependency-reviewed.json'):[];
const dependenciesManifest=final?get('targeted-dependency-impacts.json'):null;
const git=(...args)=>execFileSync('git',['-C',source,...args],{encoding:'utf8',maxBuffer:30*1024*1024}).trim();
if(git('rev-parse','HEAD')!==now||git('status','--porcelain')||
   git('rev-parse','HEAD^{tree}')!==summary.current_tree_sha)throw new Error('RB003 source identity or cleanliness mismatch');
const tree=sha=>new Map(execFileSync('git',['-C',source,'ls-tree','-rz',sha],{maxBuffer:15*1024*1024})
  .toString('utf8').split('\0').filter(Boolean).map(s=>{const m=/^\d+ blob ([a-f0-9]{40})\t(.+)$/.exec(s);
    if(!m)throw new Error('Bad tree entry');return[m[2],m[1]];}));
const a=tree(old),b=tree(now);
if(a.size!==7584||b.size!==7595||summary.current_tracked!==b.size||
   stale.length!==6||fresh.length!==10||retained.length!==(final?2810:2825)||change.length!==18||
   summary.candidate_files!==4789||summary.current_remaining!==(final?1979:1964)||
   summary.current_fully_reviewed!==(final?2810:2825)||summary.candidate_lines!==620723||
   summary.current_reviewed_lines!==(final?353103:355585)) throw new Error('RB003 manifest/count mismatch');
const sha=path=>{const oid=b.get(path);if(!oid)throw new Error('No new blob '+path);
  const bytes=execFileSync('git',['-C',source,'cat-file','blob',oid],{maxBuffer:30*1024*1024}),t=bytes.toString('utf8');
  return{sha256:createHash('sha256').update(bytes).digest('hex'),lines:t?t.split('\n').length-Number(t.endsWith('\n')):0};};
for(const record of [...stale,...fresh]){
  const v=sha(record.path);
  if(v.sha256!==(record.new_sha256??record.sha256)||v.lines!==(record.new_lines??record.lines))
    throw new Error('Changed/new blob mismatch '+record.path);
  if(stale.includes(record)&&a.get(record.path)===b.get(record.path))
    throw new Error('Invalidated source blob did not change '+record.path);
  if(fresh.includes(record)&&a.has(record.path))throw new Error('Added code previously existed '+record.path);
}
if(final){
  const dp=new Set(dependency.map(x=>x.path));
  if(dependency.length!==15||dp.size!==15||summary.dependency_stale_reviews!==15||
     summary.invalidated_dependency_reviewed_lines!==2482||
     dependenciesManifest.invalidations.length!==15||
     dependenciesManifest.invalidations.some(x=>!dp.has(x.path))||
     dependency.some(x=>x.status!=='DEPENDENCY_CHANGED_SEMANTIC_REVIEW_STALE'||
        !x.previous_batch||!x.previous_reviewer||!x.reason||!x.trigger||
        a.get(x.path)!==b.get(x.path)||sha(x.path).sha256!==x.unchanged_source_sha256))
    throw new Error('RB003 dependency semantic invalidations mismatch');
  if(retained.some(x=>dp.has(x.path)))throw new Error('Stale semantic review reused');
}
const hashSamples=[];
for(let i=0;i<retained.length;i++){
  const x=retained[i];
  if(!a.has(x.path)||a.get(x.path)!==b.get(x.path)||b.get(x.path)!==x.blob_oid)throw new Error('Retained Git OID changed '+x.path);
  if(i%41===0){if(sha(x.path).sha256!==x.sha256)throw new Error('Retained sample SHA mismatch '+x.path);hashSamples.push(x.path);}
}
const newPaths=new Set(change.filter(x=>x.status==='A').map(x=>x.path));
const modified=new Set(change.filter(x=>x.status==='M').map(x=>x.path));
if(newPaths.size!==11||modified.size!==7||fresh.some(x=>!newPaths.has(x.path))||stale.some(x=>!modified.has(x.path)))
  throw new Error('Changed/new classification mismatch');
const remaining=readFileSync(join(dir,'current-remaining-files.txt'),'utf8').trim().split(/\r?\n/);
if(remaining.length!==(final?1979:1964)||new Set(remaining).size!==remaining.length||
   (final&&dependency.some(x=>!remaining.includes(x.path))))throw new Error('RB003 remaining list mismatch');
const report={result:final?'PASS_FINAL_TARGETED_DEPENDENCY_REBASELINE':'PASS_PROVISIONAL_DEPENDENCY_IMPACT_PENDING',old_source:old,new_source:now,
  tree:summary.current_tree_sha,changed_paths:18,stale_blobs_verified:stale.length,
  new_code_blobs_verified:fresh.length,retained_equal_git_oids:retained.length,
  retained_canonical_sha256_samples:hashSamples.length,remaining_unique:remaining.length,
  semantic_dependency_stale:dependency.length,dependency_lines_invalidated:dependency.reduce((n,x)=>n+x.lines,0),
  runtime_tests_executed:0,limitation:final?
  'Static source-object proof and targeted import-graph re-review; not a runtime verification or full production safety claim.':
  'Independent targeted caller/dependency review must finish before this rebaseline is certified.'};
writeFileSync(join(dir,final?'independent-qa-final.json':'independent-qa-provisional.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
