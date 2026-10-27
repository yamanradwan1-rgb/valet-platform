const auditPaths = require('../reproduction-paths.cjs');
// External audit probe: actual TS worker, deterministic fake Postgres model; no provider I/O.
const fs = require('node:fs');
const Module = require('node:module');
const assert = require('node:assert/strict');
const ts = auditPaths.dependencyRequire('typescript');
Module._extensions['.ts'] = (mod, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  mod._compile(ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, filename);
};
const {StaffPushDeliveryWorker} = require(auditPaths.sourceRoot+'/apps/api/src/modules/staff-push/staff-push-delivery-worker.ts');
let now = 0, token, attempts = 0, state = 'PENDING', leaseEnd = 0;
const sends=[];
const answer = rows => ({rows,rowCount:rows.length});
const pool={connect:async()=>({query,release(){}}),query};
async function query(sql,args=[]) {
 if (sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK') return answer([]);
 if (sql.includes('candidate AS MATERIALIZED')) {
  if(state==='PROVIDER_ACCEPTED'||(state==='LEASED' && now<leaseEnd)) return answer([]);
  token=args[0]; state='LEASED'; leaseEnd=now+args[1]*1000; attempts++;
  return answer([{id:'delivery',attempt_count:attempts,max_attempts:4,lease_token:token,prior_state:attempts===1?'PENDING':'LEASED'}]);
 }
 if(sql.includes('pg_advisory_xact_lock_shared')) return answer(state==='LEASED'&&token===args[1]?[{organization_id:'org'}]:[]);
 if(sql.includes('AS remaining_lifetime_milliseconds')) return answer(state==='LEASED'&&token===args[1]?[{intent_id:'11111111-1111-4111-8111-111111111111',registration_id:'reg',provider_token:'synthetic',token_hash:'synthetic',locale:'en',remaining_lifetime_milliseconds:300000-now}]:[]);
 if(sql.includes('UPDATE staff_push_deliveries')&&sql.includes('provider_accepted_at')) {
  const matches=state==='LEASED'&&token===args[1]; if(matches)state=args[2]; return {rows:[],rowCount:matches?1:0};
 }
 throw new Error('Unexpected probe SQL '+sql.slice(0,70));
}
const policy={sendingEnabled:true,leaseDurationSeconds:30,providerCallTimeoutSeconds:10,activeRegistrationStaleDays:30};
const observer={observe(){}};
function provider(worker){return{async send(req){const message=req.messageForTransport();sends.push({worker,atMs:now,stateAtTransport:state,ttl:message?.android.ttl});return {kind:'PROVIDER_RESULT',result:{resultClass:'ACCEPTED'}};}};}
const b=new StaffPushDeliveryWorker(pool,policy,provider('B'),observer,Math.random,()=>now);
const a=new StaffPushDeliveryWorker(pool,policy,provider('A'),observer,Math.random,()=>now,async()=>{},async()=>{now=31000;await b.runOnce();});
a.runOnce().then(()=>{assert.equal(sends.length,2);assert.equal(sends[1].stateAtTransport,'PROVIDER_ACCEPTED');console.log(JSON.stringify({result:'DUPLICATE_SEND_REPRODUCED_IN_DETERMINISTIC_FAKE_DB_MODEL',leaseDurationMs:30000,sends},null,2));}).catch(e=>{console.error(e);process.exitCode=1;});
