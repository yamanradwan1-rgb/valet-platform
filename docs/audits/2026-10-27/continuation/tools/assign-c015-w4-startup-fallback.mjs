#!/usr/bin/env node
// Restore W4 coverage after a failed worker launch with zero source review records.
import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';

if(!process.argv[2]) throw new Error('Usage: assign-c015-w4-startup-fallback.mjs CONTINUATION_DIR');
const cp=join(resolve(process.argv[2]),'checkpoints');
const source='d67b2a4a4897b4a73d21aba630fc5ab52ff9169b';
const roster=JSON.parse(readFileSync(join(cp,'C015-d67b2a4a-assignment-roster.json'),'utf8'));
const original=JSON.parse(readFileSync(join(cp,'C015-d67b2a4a-ownership-transfers.json'),'utf8'));
if(roster.batch!=='C015'||roster.source_commit!==source||
   roster.assignments.length!==175||original.transfers.length!==0) {
  throw new Error('C015 original immutable allocation mismatch');
}
const selected=roster.assignments.filter(a=>a.original_owner==='W4'&&a.assigned_reviewer==='W4');
if(selected.length!==25||new Set(selected.map(a=>a.path)).size!==25) {
  throw new Error('W4 exact 25-path allocation mismatch');
}
const assignees=[...Array(5).fill('W1'),...Array(5).fill('W2'),
  ...Array(5).fill('W5'),...Array(5).fill('W6'),...Array(5).fill('W7')];
const scratch='D:/kndoom/vaylet test onely/tmp/cos-audit-20261029-results';
const transfers=selected.map((a,index)=>({
  batch:'C015',source_commit:source,path:a.path,original_owner:'W4',
  original_assigned_reviewer:'W4',prior_actual_reviewer:'W4',
  actual_reviewer:assignees[index],
  reason:'COS W4 worker-13 failed during model-selection startup before any source reads or scratch records; redistribute only untouched Dashboard paths among responsive reviewers',
  status:'assigned_pending_review',
  result_path:`${scratch}/${assignees[index]}/C015-transferred-W4-review-records.json`
}));
writeFileSync(join(cp,'C015-d67b2a4a-w4-startup-fallback-addendum.json'),JSON.stringify({
  batch:'C015',source_commit:source,source_tree:roster.source_tree,
  original_immutable_roster_docs_commit:'37265dfb247a158b7004a3f03650b576368c9ca6',
  failed_actual_reviewer:'W4',failed_worker_id:'worker-13',
  failed_stage:'model_selection_startup_timeout',
  w4_complete_reviews_before_transfer:0,w4_scratch_records_before_transfer:0,
  source_worktree_clean:true,transfers
},null,2)+'\n');
console.log(JSON.stringify({batch:'C015',transfers:25,from:'W4',
  to:{W1:5,W2:5,W5:5,W6:5,W7:5},source_commit:source}));
