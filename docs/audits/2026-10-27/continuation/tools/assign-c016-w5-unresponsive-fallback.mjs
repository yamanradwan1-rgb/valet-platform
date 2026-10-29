#!/usr/bin/env node
// Preserve immutable C016 original roster; reassign ONLY unsaved W5 paths after bounded non-ACK.
import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';

if(!process.argv[2]) throw new Error('Usage: assign-c016-w5-unresponsive-fallback.mjs CONTINUATION_DIR');
const root=resolve(process.argv[2]),cp=join(root,'checkpoints');
const prefix='C016-d67b2a4a-';
const roster=JSON.parse(readFileSync(join(cp,prefix+'assignment-roster.json'),'utf8'));
const source='d67b2a4a4897b4a73d21aba630fc5ab52ff9169b';
const tree='8731302512f8db4edb8bbb1cdc50b208a0dcb5b8';
const rosterCommit='39895274f4cc7ea89c267062ebc68cb9901c52e6';
if(roster.batch!=='C016'||!roster.immutable||roster.source_commit!==source||
   roster.source_tree!==tree||roster.assignments.length!==175) {
  throw new Error('Published pinned C016 roster mismatch');
}
const targets=['W1','W2','W3','W6','W7'];
const chosen=roster.assignments.filter(a=>a.assigned_reviewer==='W5');
const originalW5=chosen.filter(a=>a.original_owner==='W5').sort((a,b)=>a.path.localeCompare(b.path));
const originalW4=chosen.filter(a=>a.original_owner==='W4').sort((a,b)=>a.path.localeCompare(b.path));
if(chosen.length!==30||originalW5.length!==25||originalW4.length!==5||
   new Set(chosen.map(a=>a.path)).size!==30) {
  throw new Error('W5 fallback must be exactly 25 original W5 + five W4 original');
}
const baseResults='D:/kndoom/vaylet test onely/tmp/cos-audit-20261029-results';
const transfers=[];
for(const list of [originalW5,originalW4]){
  for(let i=0;i<list.length;i++){
    const a=list[i],reviewer=targets[i%targets.length];
    transfers.push({batch:'C016',source_commit:source,path:a.path,
      original_owner:a.original_owner,original_assigned_reviewer:'W5',
      prior_actual_reviewer:'W5',actual_reviewer:reviewer,
      reason:'W5 COS chat remained active without acknowledgment after bounded Prime messages, no C016 files were saved or credited; formally transfer only its exact uncredited paths, preserve prior C014/C015 evidence',
      status:'assigned_pending_full_source_review',
      result_path:`${baseResults}/${reviewer}/C016-transferred-${a.original_owner}-review-records.json`});
  }
}
const counts=Object.fromEntries(targets.map(t=>[t,transfers.filter(x=>x.actual_reviewer===t).length]));
if(Object.values(counts).some(n=>n!==6)||transfers.length!==30||
   new Set(transfers.map(t=>t.path)).size!==30){
  throw new Error('C016 W5 fallback count/disjoint mismatch');
}
const artifact={batch:'C016',source_commit:source,source_tree:tree,
  immutable_roster_docs_commit:rosterCommit,immutable_original_roster_unchanged:true,
  superseded_actual_reviewer:'W5',w5_saved_accepted_records_before_transfer:0,
  w5_acknowledgments_after_bounded_prime_requests:0,
  original_W5_uncredited:25,original_W4_initially_assigned_W5_uncredited:5,
  superseded_uncredited_paths:30,
  final_additional_reviewer_counts:counts,
  expected_unique_effective_original_owner_transfers:50,
  note:'No prior W5 C016 records can be counted; any late W5 output after publication must be separately reported and not silently merged. Only five W4 initial transfers change actual reviewer, whereas 25 W5 original paths add new original-owner transfers.',
  transfers};
writeFileSync(join(cp,prefix+'w5-unresponsive-fallback-addendum.json'),JSON.stringify(artifact,null,2)+'\n');
console.log(JSON.stringify({batch:'C016',reassignments:30,from_owner_W5:25,from_owner_W4:5,
  targets:counts,effective_unique_original_owner_transfers:50,source_commit:source}));
