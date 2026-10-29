#!/usr/bin/env node
// W3 finished its 30 Backend/DB paths; move only 15 untouched W6/W7 paths to W5.
import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';

if(!process.argv[2]) throw new Error('Usage: assign-c014-w3-relief.mjs CONTINUATION_DIR');
const cp=join(resolve(process.argv[2]),'checkpoints');
const source='d67b2a4a4897b4a73d21aba630fc5ab52ff9169b';
const roster=JSON.parse(readFileSync(join(cp,'C014-d67b2a4a-assignment-roster.json'),'utf8'));
const original=JSON.parse(readFileSync(join(cp,'C014-d67b2a4a-ownership-transfers.json'),'utf8'));
if(roster.batch!=='C014'||roster.source_commit!==source||
   roster.assignments.length!==175||original.transfers.length!==75) {
  throw new Error('Published C014 initial allocation mismatch');
}
const selected=roster.assignments.filter(a=>a.assigned_reviewer==='W3'&&
  (a.original_owner==='W6'||a.original_owner==='W7'));
if(selected.length!==15||selected.filter(a=>a.original_owner==='W6').length!==5||
  selected.filter(a=>a.original_owner==='W7').length!==10||
  new Set(selected.map(a=>a.path)).size!==15) throw new Error('W3 untouched transfer subset mismatch');
const scratch='D:/kndoom/vaylet test onely/tmp/cos-audit-20261029-results/W5';
const transfers=selected.map(a=>({batch:'C014',source_commit:source,path:a.path,
  original_owner:a.original_owner,original_assigned_reviewer:'W3',
  prior_actual_reviewer:'W3',actual_reviewer:'W5',
  reason:'W3 completed 30 fully reviewed API/DB files including 7,484-line schema test; 15 untouched Native/cross-app assignments transferred for bounded parallel completion by W5',
  status:'assigned_pending_review',
  result_path:`${scratch}/C014-transferred-${a.original_owner}-review-records.json`}));
writeFileSync(join(cp,'C014-d67b2a4a-w3-relief-addendum.json'),JSON.stringify({
  batch:'C014',source_commit:source,source_tree:roster.source_tree,
  initial_immutable_roster_docs_commit:'9509393ec6bf46f81c90fece2bb52ec4c39e7e33',
  superseded_actual_reviewer:'W3',new_actual_reviewer:'W5',
  w3_completed_prior_to_reassignment:30,w3_untouched_reassigned:15,
  transferred_from_W6:5,transferred_from_W7:10,transfers},null,2)+'\n');
console.log(JSON.stringify({batch:'C014',transfers:15,original_W6:5,original_W7:10,
  W3_final:30,W5_revised:55,source_commit:source}));
