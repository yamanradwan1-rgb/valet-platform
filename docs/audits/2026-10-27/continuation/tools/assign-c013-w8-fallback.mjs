#!/usr/bin/env node
// Formal third-stage C013 addendum: zero W8 semantic reviews were completed.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

if (!process.argv[2]) throw new Error('Usage: assign-c013-w8-fallback.mjs CONTINUATION_DIR');
const root=resolve(process.argv[2]),cp=join(root,'checkpoints');
const prefix=join(cp,'C013-d67b2a4a-');
const source='d67b2a4a4897b4a73d21aba630fc5ab52ff9169b';
const roster=JSON.parse(readFileSync(prefix+'assignment-roster.json','utf8'));
const rescue=JSON.parse(readFileSync(prefix+'w3-rescue-addendum.json','utf8'));
if(roster.batch!=='C013'||roster.source_commit!==source||
  roster.assignments.length!==175||rescue.source_commit!==source||
  rescue.transfers.length!==28) throw new Error('C013 immutable baseline mismatch');
const pending=rescue.transfers.filter(t=>t.actual_reviewer==='W8');
if(pending.length!==14||pending.slice(0,13).some(t=>t.original_owner!=='W3')||
  pending[13]?.original_owner!=='W6'||
  pending[0]?.path!=='packages/database/src/guest-information-test-context.ts'||
  pending[13]?.path!=='apps/valet-native/src/parking/native-completed-check-in-parking.ts') {
  throw new Error('W8 exact 14-path assignment does not match official rescue addendum');
}
const scratch='D:/kndoom/vaylet test onely/tmp/cos-audit-20261029-results';
const transfers=pending.map((t,i)=>{
  const actual_reviewer=i<7?'Prime':'W9';
  return {...t,prior_actual_reviewer:'W8',actual_reviewer,
    reason:'W8 COS source-status write_stdin hung ~1042s and was aborted; W8 confirmed zero fully semantically reviewed files, zero saved records; 5 source files read only without consumer review; all 14 remain uncredited',
    status:'assigned_pending_full_semantic_review',
    result_path:`${scratch}/${actual_reviewer}/C013-transferred-${t.original_owner}-review-records.json`};
});
const output=prefix+'w8-fallback-addendum.json';
if(existsSync(output)) throw new Error('Refusing to overwrite existing W8 fallback addendum');
writeFileSync(output,JSON.stringify({batch:'C013',source_commit:source,
  immutable_roster_commit:'3bb421047a50f2e6fe2f303d0be6739961b2f793',
  previous_rescue_docs_commit:'15fbb7a739cc0f42aabbbb545991603e140248aa',
  original_immutable_roster_unchanged:true,superseded_actual_reviewer:'W8',
  w8_completed_full_semantic_reviews:0,w8_source_only_reads_incomplete:5,
  w8_never_read_files:9,w8_record_files_at_transfer:0,
  tool_failure:'COS write_stdin on Windows source status/hash probe hung ~1042s; agent confirmed zero semantic records',
  reviewer_counts:{Prime:7,W9:7},transfers},null,2)+'\n');
console.log(JSON.stringify({transferred:transfers.length,Prime:7,W9:7,
  originalW3:13,originalW6:1,no_duplicate_coverage:true}));
