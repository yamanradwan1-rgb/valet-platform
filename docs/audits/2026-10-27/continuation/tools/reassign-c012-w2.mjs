#!/usr/bin/env node
// Immutable C012 W2 conversation-failure addendum; never modifies the published roster.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

if(!process.argv[2]||!process.argv[3]) throw new Error('Usage: reassign-c012-w2.mjs CONTINUATION_DIR RESULTS_DIR');
const root=resolve(process.argv[2]), scratch=resolve(process.argv[3]), checks=join(root,'checkpoints');
const source='d67b2a4a4897b4a73d21aba630fc5ab52ff9169b';
const roster=JSON.parse(readFileSync(join(checks,'C012-d67b2a4a-assignment-roster.json'),'utf8'));
const assigned=roster.assignments.filter(a=>a.assigned_reviewer==='W2');
if(roster.source_commit!==source||assigned.length!==35) throw new Error('Unexpected immutable roster');
for(const name of ['C012-W2-review-records.json','C012-transferred-W6-review-records.json']) {
  const path=join(scratch,'W2',name);
  if(existsSync(path) && JSON.parse(readFileSync(path,'utf8')).length) {
    throw new Error('W2 already has saved C012 review evidence: '+path);
  }
}
const transfers=assigned.map((item,index)=>{
  const actual_reviewer=index<17?'W3':'W4';
  const filename=`C012-transferred-${item.original_owner}-review-records.json`;
  return {batch:'C012',source_commit:source,path:item.path,
    original_owner:item.original_owner,original_assigned_reviewer:'W2',actual_reviewer,
    reason:'W2 COS conversation remained active with messages queued but no task acknowledgment, source inspection or saved C012 output after bounded requests; only the exact 35 still-unreviewed paths were reassigned',
    previous_result_path:item.result_path,
    result_path:`D:/kndoom/vaylet test onely/tmp/cos-audit-20261029-results/${actual_reviewer}/${filename}`,
    status:'assigned_pending_review'};
});
if(transfers.length!==35||new Set(transfers.map(t=>t.path)).size!==35||
   transfers.filter(t=>t.actual_reviewer==='W3').length!==17||
   transfers.filter(t=>t.actual_reviewer==='W4').length!==18) {
  throw new Error('Fallback roster imbalance');
}
const addendum={batch:'C012',source_commit:source,immutable_roster_commit:'949efd590e287c3c5093d64b7adc86ac171b9907',
  original_immutable_roster_unchanged:true,superseded_assigned_reviewer:'W2',failed_conversation_acknowledged:false,
  observed_existing_w2_records:0,fallback_count:35,
  effective_actual_reviewer_counts:{W1:35,W2:0,W3:52,W4:53,W5:35},
  transfers};
writeFileSync(join(checks,'C012-d67b2a4a-w2-fallback-addendum.json'),JSON.stringify(addendum,null,2)+'\n');
console.log(JSON.stringify({batch:'C012',original_reviewer:'W2',reassigned:35,
  actual_reviewers:{W3:17,W4:18},source_commit:source}));
