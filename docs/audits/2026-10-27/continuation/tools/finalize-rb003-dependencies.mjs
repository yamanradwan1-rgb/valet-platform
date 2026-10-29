#!/usr/bin/env node
// Targeted semantic-credit invalidation after independent RB-003 dependency review.
// Leaves C016 history and all product sources untouched.
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join,resolve} from 'node:path';

const [sourceArg,rootArg]=process.argv.slice(2);
if(!sourceArg||!rootArg)throw new Error('Usage: finalize-rb003-dependencies.mjs NEW_SOURCE_DIR CONTINUATION_DIR');
const source=resolve(sourceArg),root=resolve(rootArg),now='0747a677ddf7fc3e1093490b7ef0a7bee9e2d938';
const dir=join(root,'rebaselines',now),read=name=>JSON.parse(readFileSync(join(dir,name),'utf8'));
const git=(...args)=>execFileSync('git',['-C',source,...args],{encoding:'utf8'}).trim();
if(git('rev-parse','HEAD')!==now||git('status','--porcelain'))throw new Error('Not a clean RB003 new-source cut');
const summary=read('summary.json'),impacts=read('targeted-dependency-impacts.json');
const reusable=read('reusable-published-reviews.json');
if(summary.dependency_impact_review!=='PENDING_TARGETED_REVIEW'||summary.current_fully_reviewed!==2825||
   summary.current_remaining!==1964||summary.candidate_files!==4789||impacts.invalidations.length!==15||
   impacts.new_source!==now||new Set(impacts.invalidations.map(x=>x.path)).size!==15||
   reusable.length!==2825)throw new Error('Unapproved or non-pristine dependency-impact input');

function parseCsv(data){
  const table=[];let row=[],value='',quote=false;
  for(let i=0;i<data.length;i++){
    const c=data[i];
    if(c==='"'){if(quote&&data[i+1]==='"'){value+='"';i++;}else quote=!quote;}
    else if(c===','&&!quote){row.push(value);value='';}
    else if(c==='\n'&&!quote){row.push(value.replace(/\r$/,''));table.push(row);row=[];value='';}
    else value+=c;
  }
  if(quote)throw new Error('Unclosed CSV');
  if(row.length||value){row.push(value);table.push(row);}
  const columns=table.shift();return{columns,rows:table.map((cells,i)=>{
    if(cells.length!==columns.length)throw new Error('Malformed RB003 row '+(i+2));
    return Object.fromEntries(columns.map((key,j)=>[key,cells[j]]));
  })};
}
const quote=s=>'"'+String(s??'').replaceAll('"','""')+'"';
const base=parseCsv(readFileSync(join(dir,'current-coverage-ledger.csv'),'utf8'));
const target=new Map(impacts.invalidations.map(x=>[x.path,x]));
const invalidated=[];
for(const row of base.rows){
  const item=target.get(row.path);
  if(item){
    if(row.authored_code_candidate!=='True'||row.current_status!=='fully_reviewed'||
       !row.classification.startsWith('UNCHANGED_REVIEW_REUSABLE')||
       row.current_baseline_sha!==now||!row.current_source_sha256||!item.reviewer||!item.trigger||!item.reason){
      throw new Error('Impact cannot invalidate uncredited/changed/malformed path '+row.path);
    }
    invalidated.push({path:row.path,reviewer:item.reviewer,reason:item.reason,trigger:item.trigger,
      previous_batch:row.current_review_batch||row.audit_batch,
      previous_reviewer:row.current_reviewer||row.reviewer,
      unchanged_source_sha256:row.current_source_sha256,lines:Number(row.lines),
      status:'DEPENDENCY_CHANGED_SEMANTIC_REVIEW_STALE'});
    row.current_status='not_reviewed';row.current_review_batch='';row.current_reviewer='';
    row.current_review_source_sha256='';row.current_review_finding_ids='';
    row.current_review_notes='Prior source review preserved in C016 history; changed producer/caller semantics require complete current-source re-review.';
    row.classification='DEPENDENCY_CHANGED_SEMANTIC_REVIEW_STALE';
    row.dependency_impact_review='RB003_CHANGED_DEPENDENCY_MUST_REVIEW';
  }else if(row.authored_code_candidate==='True'&&row.current_status==='fully_reviewed'){
    if(!row.classification.startsWith('UNCHANGED_REVIEW_REUSABLE'))throw new Error('Unexpected retained classification '+row.path);
    row.classification='UNCHANGED_REVIEW_VALID_AFTER_RB003_TARGETED_DEPENDENCY_CHECK';
    row.dependency_impact_review='RB003_TARGETED_IMPORT_GRAPH_RECHECKED_NO_MATERIAL_CHANGE';
  }
}
if(invalidated.length!==15||invalidated.some(x=>x.previous_batch===''))throw new Error('Missing historical reviewer provenance or invalidation');
const eligible=base.rows.filter(r=>r.authored_code_candidate==='True');
const credited=eligible.filter(r=>r.current_status==='fully_reviewed');
const pending=eligible.filter(r=>r.current_status!=='fully_reviewed');
const sum=rows=>rows.reduce((n,r)=>n+Number(r.lines),0);
const invalidatedLines=invalidated.reduce((n,x)=>n+x.lines,0);
if(eligible.length!==4789||sum(eligible)!==620723||credited.length!==2810||pending.length!==1979||
   sum(credited)!==355585-invalidatedLines)throw new Error('RB003 dependency-adjusted coverage reconciliation mismatch');
const finalReusable=reusable.filter(r=>!target.has(r.path));
if(finalReusable.length!==2810)throw new Error('RB003 reusable record provenance mismatch');
const output={...summary,dependency_impact_review:'COMPLETE_TARGETED_VALIDATION',
  source_modified_stale_reviews:6,dependency_stale_reviews:15,
  invalidated_dependency_reviewed_lines:invalidatedLines,
  reusable_reviewed:finalReusable.length,current_fully_reviewed:credited.length,
  current_reviewed_lines:sum(credited),current_remaining:pending.length,
  file_percent:credited.length/eligible.length*100,line_percent:sum(credited)/sum(eligible)*100,
  dependency_review_reports:['W1-push-dependency-impact.md','W7-employee-dependency-impact.md'],
  runtime_tests_executed:0};
writeFileSync(join(dir,'summary.json'),JSON.stringify(output,null,2)+'\n');
writeFileSync(join(dir,'invalidated-dependency-reviewed.json'),JSON.stringify(invalidated,null,2)+'\n');
writeFileSync(join(dir,'reusable-published-reviews.json'),JSON.stringify(finalReusable,null,2)+'\n');
writeFileSync(join(dir,'current-coverage-ledger.csv'),[base.columns.join(','),...base.rows.map(r=>base.columns.map(k=>quote(r[k])).join(','))].join('\n')+'\n');
writeFileSync(join(dir,'current-remaining-files.txt'),pending.map(r=>r.path).join('\n')+'\n');
writeFileSync(join(dir,'verification.json'),JSON.stringify({source_clean:true,source_tree:output.current_tree_sha,
  previous_ledger:'C016',canonical_blob_and_line_reconciliation:'PASS',
  independent_w3_source_qa:'PASS_2848_BLOBS',targeted_dependency_impact_review:'COMPLETE_TARGETED_VALIDATION',
  changed_source_stale:6,unchanged_dependency_stale:15,reused_unchanged_reviews:2810,
  runtime_tests:'NOT_EXECUTED — STATIC_AUDIT_ONLY'},null,2)+'\n');
console.log(JSON.stringify(output,null,2));
