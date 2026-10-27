const auditPaths = require('../reproduction-paths.cjs');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = auditPaths.dependencyRequire('typescript');
const root=auditPaths.sourceRoot+'/apps/api/src/modules/';
function sourceModule(relative, dependencies={}) {
 const text=fs.readFileSync(root+relative,'utf8');
 const {outputText}=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
 const module={exports:{}};
 new Function('require','module','exports',outputText)((name)=>{
  if(name in dependencies)return dependencies[name];
  throw new Error('Unexpected dependency '+name);
 },module,module.exports);
 return module.exports;
}
(async()=>{
 const begin=new Date('2026-01-01T00:00:00.000Z');
 const expires=new Date('2026-01-01T00:00:00.100Z');
 const wall=new Date('2026-01-01T00:00:00.300Z');
 const dispatch=sourceModule('dispatch/dispatch-transaction.ts');
 const transaction={query:async(sql)=>{
  assert.match(sql,/transaction_timestamp\(\)/);
  return {rows:[{operation_time:begin}]};
 }};
 const release=sourceModule('retrieval/handoff-release-guard.ts',{
  './handoff-locks':{lockUnconsumedVerification:async()=>({id:'synthetic-verification',method:'PICKUP_CODE',verified_at:begin,expires_at:expires})},
  './handoff-policy':{loadEffectiveHandoffPolicy:async()=>'PICKUP_CODE',isHandoffMethodAllowed:()=>true},
 });
 const session={id:'synthetic-session',organization_id:'synthetic-org',location_id:'synthetic-location',state:'HANDOFF_PENDING',handoff_pending_at:begin};
 const operation=await dispatch.loadDispatchOperationTime(transaction);
 const stale=await release.lockReleaseEligibleHandoffVerification(transaction,session,operation);
 const current=await release.lockReleaseEligibleHandoffVerification(transaction,session,wall);
 assert.equal(stale.id,'synthetic-verification');
 assert.equal(current,undefined);
 console.log(JSON.stringify({status:'PASS',method:'actual source transpiled with controlled database adapters',begin:begin.toISOString(),expires:expires.toISOString(),simulatedWallTime:wall.toISOString(),staleTimestampAccepted:true,currentTimestampRejected:true,realPostgresRaceRun:false}));
})().catch(e=>{console.error(e);process.exitCode=1});
