/* Audit-only, no application writes/network/DB. Executes immutable service and
 * repository bodies with synthetic sessions, generated in-memory keys and SQL
 * model. This is NOT PostgreSQL/HTTP/privilege/concurrency proof. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {createRequire} = require('node:module');
const source = path.resolve(process.argv[2] || '.');
const req = createRequire(path.join(source, 'apps/api/package.json'));
const ts = req('typescript');
const otplib = req('otplib');
const sha = '66968655b8bd90c6681daf53fb9d8da9b9ab9f79';
const syntheticProcess = {env:{
  MFA_TOTP_ENCRYPTION_KEY_B64URL:crypto.randomBytes(32).toString('base64url'),
  MFA_RECOVERY_HMAC_SECRET_B64URL:crypto.randomBytes(32).toString('base64url'),
}};
const imports = new Map(), loaded = [];
class UnauthorizedException extends Error {}
const noopDecorator = () => () => {};
let state;
const audit = [];
const rootMfa = path.join(source, 'apps/api/src/modules/auth/mfa');
function load(filename) {
  filename = path.resolve(filename);
  if (!filename.endsWith('.ts')) filename += '.ts';
  if (imports.has(filename)) return imports.get(filename);
  const rel = path.relative(source, filename).replaceAll('\\','/');
  let stub;
  if (rel.endsWith('/postgres-transaction.ts')) stub = {inPostgresTransaction:async(pool,fn)=>{
    const before=structuredClone(state);try{return await fn(pool);}catch(e){state=before;throw e;}
  }};
  if (rel.endsWith('/runtime-database.module.ts')) stub = {RUNTIME_POSTGRES_POOL:Symbol('synthetic-pool')};
  if (rel.endsWith('/staff-session-context.ts')) stub = {STAFF_SESSION_CONTEXT_RESOLVER:Symbol('synthetic-sessions')};
  if (rel.endsWith('/mfa-anti-abuse.ts')) stub = {MfaAntiAbuse:class {}};
  if (rel.endsWith('/account-security-audit-writer.ts')) stub = {appendAccountSecurityAuditEvent:async(_tx,e)=>audit.push(e.eventType)};
  if (stub) {imports.set(filename,stub);return stub;}
  const text = fs.readFileSync(filename,'utf8');
  loaded.push({path:rel,sha256:crypto.createHash('sha256').update(text).digest('hex')});
  const code=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true,emitDecoratorMetadata:false}}).outputText;
  const module={exports:{}};imports.set(filename,module.exports);
  const localRequire=(specifier)=>{
    if(specifier==='@nestjs/common')return {Inject:noopDecorator,Injectable:noopDecorator,UnauthorizedException};
    if(specifier.startsWith('.'))return load(path.resolve(path.dirname(filename),specifier));
    return req(specifier);
  };
  new Function('require','exports','module','process',code)(localRequire,module.exports,module,syntheticProcess);
  imports.set(filename,module.exports);return module.exports;
}
const {MfaEnrollmentService}=load(path.join(rootMfa,'mfa-enrollment.service.ts'));
const {MfaRecoveryService}=load(path.join(rootMfa,'mfa-recovery.service.ts'));
const {MfaEnrollmentNotAvailableError}=load(path.join(rootMfa,'mfa-errors.ts'));
const now=new Date('2026-10-27T12:00:00.000Z');
const user=crypto.randomUUID(), other=crypto.randomUUID();
function session(user_id) {return {id:crypto.randomUUID(),user_id,token:crypto.randomBytes(32).toString('hex'),revoked_at:null,absolute_expires_at:new Date(now.getTime()+3600000),access_expires_at:new Date(now.getTime()+900000),now, mfa_factor_id:null};}
const victim=session(user), attacker=session(user), foreign=session(other);
state={sessions:[victim,attacker,foreign],factors:[],codes:[]};
const row=(r)=>({rowCount:r.length,rows:r});
const tx={async query(text,values=[]) {
  const sql=text.replace(/\s+/g,' ').trim();
  if(sql.startsWith('SELECT session.id, session.user_id')) return row(state.sessions.filter(s=>s.id===values[0]&&s.user_id===values[1]&&s.token===values[2]&&!s.revoked_at&&now<s.absolute_expires_at&&now<s.access_expires_at));
  if(sql.startsWith('SELECT pg_advisory_xact_lock'))return row([]);
  if(sql.startsWith('SELECT membership.id'))return row([{id:'synthetic-active-management-membership'}]);
  if(sql.startsWith('SELECT id, user_id, state'))return row(state.factors.filter(f=>f.user_id===values[0]&&(sql.includes("state IN")?['PENDING','ACTIVE'].includes(f.state):f.id===values[1])));
  if(sql.startsWith('INSERT INTO user_mfa_totp_factors')) {const f={id:values[0],user_id:values[1],state:'PENDING',protected_secret:values[2],recovery_set_generation:0};state.factors.push(f);return row([f]);}
  if(sql.startsWith('UPDATE user_mfa_totp_factors SET state = \'ACTIVE\'')) {const f=state.factors.find(f=>f.id===values[0]&&f.state==='PENDING');if(!f)return row([]);Object.assign(f,{state:'ACTIVE',activated_at:values[1],last_accepted_step:values[2],recovery_set_generation:values[3]});return row([f]);}
  if(sql.startsWith('INSERT INTO mfa_recovery_codes')) {state.codes.push({id:values[0],factor_id:values[1],set_generation:values[2],slot:values[3],selector:values[4],verifier:values[5],consumed_at:null});return row([]);}
  if(sql.startsWith('UPDATE staff_auth_sessions')) {const s=state.sessions.find(s=>s.id===values[0]&&!s.revoked_at&&values[2]<s.access_expires_at&&values[2]<s.absolute_expires_at);if(!s)return row([]);Object.assign(s,{mfa_factor_id:values[1],mfa_authenticated_at:values[2],last_admin_activity_at:values[2]});return row([s]);}
  if(sql.startsWith('SELECT id, verifier FROM mfa_recovery_codes'))return row(state.codes.filter(c=>c.factor_id===values[0]&&c.set_generation===values[1]&&c.selector===values[2]&&c.consumed_at===null));
  if(sql.startsWith('UPDATE mfa_recovery_codes SET consumed_at')) {const c=state.codes.find(c=>c.id===values[0]&&c.consumed_at===null);if(!c)return row([]);c.consumed_at=values[1];return row([c]);}
  if(sql.startsWith('UPDATE user_mfa_totp_factors SET state = \'RETIRED\'')) {const f=state.factors.find(f=>f.id===values[0]&&['PENDING','ACTIVE'].includes(f.state));if(!f)return row([]);Object.assign(f,{state:'RETIRED',retired_at:values[1]});return row([f]);}
  throw new Error('Unhandled SQL shape in audit model');
}};
const resolver={async resolve(label){const s=({victim,attacker,foreign})[label];if(!s)throw new UnauthorizedException();return {userId:s.user_id,staffAuthSessionId:s.id,accessTokenHash:s.token};}};
const limiter={reserveTotp:async()=>({}),reserveRecovery:async()=>({}),successInTransaction:async()=>{},success:async()=>{},failure:async()=>{}};
const enrollment=new MfaEnrollmentService(tx,resolver,limiter);
const recovery=new MfaRecoveryService(tx,resolver,limiter);
const code=secret=>otplib.generate({secret,algorithm:'sha1',digits:6,period:30,epoch:Math.floor(now.getTime()/1000),strategy:'totp'});
(async()=>{
  const initial=await enrollment.begin('victim');
  const confirmed=await enrollment.confirm('victim',{factorId:initial.factorId,code:await code(initial.provisioning.secretBase32)});
  assert.equal(state.sessions.find(s=>s.id===attacker.id).mfa_factor_id,null);
  await assert.rejects(()=>enrollment.begin('attacker'),MfaEnrollmentNotAvailableError);
  console.log('PASS control: active factor blocks seed disclosure to password-only session');
  const pending=await recovery.beginSelfRecovery('victim',confirmed.recoveryCodes[0]);
  assert.equal(state.factors.find(f=>f.id===initial.factorId).state,'RETIRED');
  assert.equal(state.sessions.find(s=>s.id===attacker.id).mfa_factor_id,null);
  console.log('PASS control: recovery replaces factor without assuring second session');
  const disclosed=await enrollment.begin('attacker');
  assert.equal(disclosed.factorId,pending.factorId);
  assert.equal(disclosed.provisioning.secretBase32,pending.provisioning.secretBase32);
  console.log('PASS reproduction: second session receives recovery-created replacement seed without recovery code');
  await enrollment.confirm('attacker',{factorId:disclosed.factorId,code:await code(disclosed.provisioning.secretBase32)});
  assert.equal(state.sessions.find(s=>s.id===attacker.id).mfa_factor_id,pending.factorId);
  assert.equal(state.factors.find(f=>f.id===pending.factorId).state,'ACTIVE');
  console.log('PASS reproduction: second session activates replacement and establishes exact-session assurance');
  const unrelated=await enrollment.begin('foreign');
  assert.notEqual(unrelated.factorId,pending.factorId);
  console.log('PASS control: different user receives a separate factor');
  console.log(JSON.stringify({source_commit:sha,qualification:'synthetic-service-model-only',checks:5,failed:0,loaded_sources:loaded},null,2));
})().catch(e=>{console.error('FAIL audit model:',e.name,e.message);process.exitCode=1;});
