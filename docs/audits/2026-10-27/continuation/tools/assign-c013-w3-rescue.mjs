#!/usr/bin/env node
// A second-stage immutable transfer addendum for exactly W3's 28 unstarted C013 paths.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

if (!process.argv[2]) throw new Error('Usage: assign-c013-w3-rescue.mjs CONTINUATION_DIR');
const root=resolve(process.argv[2]), cp=join(root,'checkpoints');
const prefix=join(cp,'C013-d67b2a4a-');
const roster=JSON.parse(readFileSync(prefix+'assignment-roster.json','utf8'));
const original=JSON.parse(readFileSync(prefix+'ownership-transfers.json','utf8'));
const source='d67b2a4a4897b4a73d21aba630fc5ab52ff9169b';
if(roster.batch!=='C013'||roster.source_commit!==source||
  roster.assignments.length!==175||original.transfers.length!==75) {
  throw new Error('Published C013 roster baseline mismatch');
}
const assigned=roster.assignments.filter(a=>a.assigned_reviewer==='W3');
if(assigned.length!==45||assigned[16]?.path!=='packages/database/src/guest-browser-session-test-fixture.ts'||
  assigned.slice(0,5).some(a=>a.original_owner!=='W2')||
  assigned.slice(5,17).some(a=>a.original_owner!=='W3')) {
  throw new Error('W3 handoff boundary and original ownership mismatch');
}
const pending=assigned.slice(17);
if(pending.length!==28 || pending.slice(0,13).some(a=>a.original_owner!=='W3')||
  pending.slice(13,18).some(a=>a.original_owner!=='W6')||
  pending.slice(18).some(a=>a.original_owner!=='W7')) {
  throw new Error('W3 unstarted 28 mismatch');
}
const results='D:/kndoom/vaylet test onely/tmp/cos-audit-20261029-results';
const transfers=pending.map((a,index)=>{
  const actual_reviewer=index<14?'W8':'W9';
  const result_path=`${results}/${actual_reviewer}/C013-transferred-${a.original_owner}-review-records.json`;
  return {batch:'C013',source_commit:source,path:a.path,
    original_owner:a.original_owner,original_assigned_reviewer:'W3',actual_reviewer,
    reason:'Original W3 substitute fully read 17/45, then COS scratch record-builder patch hung for 736s and aborted; W3 expressly handed off only 28 not-yet-started paths for bounded recovery',
    first_17_retained_with:'W3',status:'assigned_pending_review',result_path};
});
if(transfers.slice(0,14).some(t=>t.actual_reviewer!=='W8')||
  transfers.slice(14).some(t=>t.actual_reviewer!=='W9')) throw new Error('Rescue partition mismatch');
const output=prefix+'w3-rescue-addendum.json';
if(existsSync(output)) throw new Error('Rescue addendum already exists: refusing overwrite');
writeFileSync(output,JSON.stringify({batch:'C013',source_commit:source,
  immutable_roster_commit:'3bb421047a50f2e6fe2f303d0be6739961b2f793',
  original_immutable_roster_unchanged:true,superseded_assigned_reviewer:'W3',
  w3_completed_full_source_reads_pending_persistence:17,
  w3_unstarted_paths_transferred:28,observed_w3_c013_record_files_at_transfer:0,
  reviewer_counts:{W8:14,W9:14},transfers},null,2)+'\n');
console.log(JSON.stringify({count:transfers.length,W8:14,W9:14,
  retainedW3:17,transfersByOriginalOwner:{W3:13,W6:5,W7:10}}));
