#!/usr/bin/env node
// Retain all C012 worker finding evidence and attribute previously known dependencies.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

if(!process.argv[2]||!process.argv[3]) throw new Error('Usage: consolidate-c012-findings.mjs CONTINUATION_DIR RESULTS_DIR');
const root=resolve(process.argv[2]), scratch=resolve(process.argv[3]);
const source='d67b2a4a4897b4a73d21aba630fc5ab52ff9169b';
const roster=JSON.parse(readFileSync(join(root,'checkpoints','C012-d67b2a4a-assignment-roster.json'),'utf8'));
const fallback=JSON.parse(readFileSync(join(root,'checkpoints','C012-d67b2a4a-w2-fallback-addendum.json'),'utf8'));
const byPath=new Map(roster.assignments.map(x=>[x.path,x]));
const fallbackMap=new Map(fallback.transfers.map(x=>[x.path,x.actual_reviewer]));
const groups=[],candidates=[],existing=[];
for(const worker of ['W1','W2','W3','W4','W5']){
  const dir=join(scratch,worker);
  for(const name of readdirSync(dir).filter(n=>/^C012.*(?:candidate|finding).*\.json$/i.test(n)).sort()){
    const data=JSON.parse(readFileSync(join(dir,name),'utf8'));
    const items=Array.isArray(data)?data:(data.new_findings??data.findings??data.candidate_findings??[]);
    if(!Array.isArray(items)) throw new Error('Non-array findings '+name);
    const dependencies=Array.isArray(data.pre_existing_candidate_dependencies)?data.pre_existing_candidate_dependencies:[];
    if(data.source_commit&&data.source_commit!==source) throw new Error('Wrong finding source '+name);
    for(const item of items){
      if(item.source_commit&&item.source_commit!==source) throw new Error('Wrong candidate source '+item.id);
      const path=item.path??item.owned_path;
      const assigned=byPath.get(path);
      if(!assigned|| (fallbackMap.get(path)??assigned.assigned_reviewer)!==worker) {
        throw new Error('Candidate not owned by reviewer '+worker+': '+path);
      }
      const severity=item.severity??item.severity_candidate;
      if(!item.id||!item.title||!['P0','P1','P2','P3'].includes(severity)||!item.confidence) {
        throw new Error('Thin candidate '+name);
      }
      candidates.push({id:item.id,path,severity,confidence:item.confidence,status:item.status,
        title:item.title,reviewer:worker,source_commit:source});
    }
    for(const dependency of dependencies){
      if(!dependency.finding_id||!dependency.disposition) throw new Error('Thin existing dependency '+name);
      existing.push({worker,...dependency});
    }
    groups.push({worker,scratch_name:name,raw_data:data});
  }
}
if(new Set(candidates.map(x=>x.id)).size!==candidates.length) throw new Error('Duplicate candidate ID');
const paths=new Map();
for(const c of candidates) {if(!paths.has(c.path)) paths.set(c.path,[]);paths.get(c.path).push(c.id);}
const possible_duplicate_path_groups=[...paths.entries()].filter(([,ids])=>ids.length>1)
  .map(([path,ids])=>({path,ids,requires_manual_semantic_deduplication:true}));
const output={batch:'C012',source_commit:source,classification:'STATIC_AUDIT_ONLY',
  runtime_tests_executed:0,candidates_without_duplicate_credit:candidates,
  possible_duplicate_path_groups,pre_existing_candidate_dependencies:existing,
  raw_independent_worker_evidence:groups,
  limitation:'No new C012 candidate has live runtime/PG/native validation. Historical SEC-011/#363 and C011 P2 findings remain separate; no unresolved candidate should be misrepresented as production exploitation.'};
writeFileSync(join(root,'checkpoints','C012-d67b2a4a-finding-evidence.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({workerCandidateFiles:groups.length,newCandidates:candidates.length,
  existingDependencies:existing.length,possibleDuplicatePathGroups:possible_duplicate_path_groups.length,
  ids:candidates.map(x=>x.id),source_commit:source}));
