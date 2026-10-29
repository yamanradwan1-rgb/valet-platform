#!/usr/bin/env node
// Preserve original worker candidate evidence and identify exact same-path duplicates.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [rootArg, scratchArg] = process.argv.slice(2);
if (!rootArg || !scratchArg) throw new Error('Usage: consolidate-c011-findings.mjs CONTINUATION_DIR RESULTS_DIR');
const root=resolve(rootArg),scratch=resolve(scratchArg);
const source='d67b2a4a4897b4a73d21aba630fc5ab52ff9169b';
const groups=[];
for(const worker of ['W1','W2','W3','W4','W5']) {
  const directory=join(scratch,worker);
  const names=readdirSync(directory).filter(name=>/^C011.*(?:finding|candidate).*\.json$/i.test(name)).sort();
  for(const name of names) {
    const data=JSON.parse(readFileSync(join(directory,name),'utf8'));
    const entries=Array.isArray(data)?data:(data.findings??data.candidate_findings);
    if(!Array.isArray(entries)) throw new Error('Unrecognized candidate file: '+name);
    for(const finding of entries) {
      if(finding.source_commit && finding.source_commit!==source) throw new Error('Finding source mismatch: '+name);
      if(!finding.id || !finding.severity || !finding.title) throw new Error('Thin finding: '+name);
    }
    groups.push({worker,scratch_name:name,findings:entries});
  }
}
const all=groups.flatMap(x=>x.findings);
const ids=all.map(x=>x.id);
if(new Set(ids).size!==ids.length) throw new Error('Duplicate finding ID');
const a=all.find(x=>x.id==='C011-W2-CANDIDATE-001');
const b=all.find(x=>x.id==='C011-W5-NATIVE-001');
if(!a || !b || !String(a.primary_location).includes('native-incident-session.ts') ||
   !String(b.primary).includes('native-incident-session.ts')) throw new Error('Expected independently cross-reported Incident race evidence missing');
const duplicateAliases=new Set([b.id]);
const findings=all.filter(x=>!duplicateAliases.has(x.id));
const output={ batch:'C011', source_commit:source, classification:'STATIC_AUDIT_ONLY',runtime_tests_executed:0,
  candidates_without_duplicate_credit:findings.map(x=>({id:x.id,severity:x.severity,confidence:x.confidence,status:x.status,title:x.title})),
  deduplication:[{primary_id:a.id,duplicate_aliases:[b.id],reason:'Both workers independently traced the same NativeIncidentSession restore/retire post-await generation fence gap; W5 reviewed the recovery resolution dependency, W2 the session file. One P2 candidate, not two.',prior_C009_native_candidate:'C009-NATIVE-001 concerns false verification UI label in release view and is a distinct source path.'}],
  raw_independent_worker_evidence:groups,
  limitation:'P2 Incident race remains medium-confidence source hypothesis until deterministic deferred-clear interleaving and physical native behavior are tested. No new P0/P1 confirmed by the presently available candidates; historical SEC-011/#363 remains separately reported in C010.',
};
writeFileSync(join(root,'checkpoints','C011-d67b2a4a-finding-evidence.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({workerCandidateFiles:groups.length,rawCandidates:all.length,deduplicatedCandidates:findings.length,ids,source}));
