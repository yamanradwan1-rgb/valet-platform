#!/usr/bin/env node
// Post-roster reassignment of W1's unreported C011 work; preserves immutable roster history.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root=resolve(process.argv[2]??'');
if(!process.argv[2]) throw new Error('Usage: create-c011-fallback.mjs CONTINUATION_DIR');
const prefix=join(root,'checkpoints','C011-d67b2a4a');
const roster=JSON.parse(readFileSync(prefix+'-assignment-roster.json','utf8'));
const initial=JSON.parse(readFileSync(prefix+'-ownership-transfers.json','utf8'));
const original=roster.assignments.filter(x=>x.assigned_reviewer==='W1');
if(original.length!==35 || initial.transfers.length!==50 || new Set(original.map(x=>x.path)).size!==35) throw new Error('Initial roster no longer matches verified W1 pending paths');
const output=original.map((assignment,index)=>{
  const reviewer=index<17?'W2':'W4';
  const target=`D:/kndoom/vaylet test onely/tmp/cos-audit-20261029-results/${reviewer}/C011-transferred-${assignment.original_owner}-review-records.json`;
  return {batch:'C011',source_commit:roster.source_commit,path:assignment.path,
    original_owner:assignment.original_owner,original_assigned_reviewer:'W1',actual_reviewer:reviewer,
    reason:'W1 conversation remained active but unresponsive to bounded progress requests and produced 0 C011 result records; 35 unreviewed paths reassigned before any W1 credit',
    previous_result_path:assignment.result_path,result_path:target,status:'assigned_pending_review'};
});
if(output.filter(x=>x.actual_reviewer==='W2').length!==17 || output.filter(x=>x.actual_reviewer==='W4').length!==18) throw new Error('Fallback counts wrong');
const addendum={batch:'C011',source_commit:roster.source_commit,original_immutable_roster_commit:'88e70de4b5ab0dfa560ab2220e846c461ffec93d',
  reason:'No validated W1 C011 output despite bound wait and messages; avoid blocking audit. This explicitly supersedes W1 actual-reviewer assignment for 35 paths, including ten W7-origin paths already listed in initial transfers.',
  fallback_count:35,actual_reviewers:{W2:17,W4:18},transfers:output};
writeFileSync(prefix+'-w1-fallback-addendum.json',JSON.stringify(addendum,null,2)+'\n');
console.log(JSON.stringify({transfers:output.length,W2:17,W4:18,W1Original:output.filter(x=>x.original_owner==='W1').length,W7Original:output.filter(x=>x.original_owner==='W7').length}));
