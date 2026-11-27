import {
  feedbackRoles, feedbackRoutines, expectedFeedbackExecutors,
  resolveFeedbackStage,
} from "./rating-feedback-stage-contract.mjs";
import {
  assertFeedbackColumnCatalog, assertFeedbackFunctionCatalog,
  assertFeedbackRoleCatalog,expectedFeedbackColumns,
} from "./rating-feedback-privilege-contract.mjs";
import {feedbackCatalogQueries,featureTables} from "./rating-feedback-catalog.mjs";
import {assertSameCutoverTransaction} from "./option-c-protected-cutover-state.mjs";
import {verifyStaffSessionLockAcl} from "./option-c-staff-session-lock-acl.mjs";
import {optionCRoles} from "./option-c-protected-cutover-state.mjs";

const {reader:F,privacy:P,sessionLocker:S,approver:A,executor:E}=feedbackRoles;
const FEAT=[F,P,A,E];
const OWNERS=[S,F,P];
const GUARDS_P2=[
  ["public.valet_sessions","rating_feedback_privacy_lock_guard"],
  ["public.guest_location_privacy","rating_feedback_notice_lock_guard"],
  ["public.guest_rating_comments","rating_feedback_lock_guard"],
];
const GUARDS_P5=[
  ...["organizations","organization_memberships",
    "organization_subscriptions","locations",
    "membership_location_access","user_mfa_totp_factors"]
    .map(table=>[`public.${table}`,"rating_feedback_lock_guard"]),
];
const equal=(a,b)=>a.length===b.length &&
  [...a].sort().every((x,i)=>x===[...b].sort()[i]);
const rows=async(client,name,params)=>(
  await client.query(feedbackCatalogQueries[name],params)).rows;
const deny=(state,reason)=>{if(!state)throw Error("Rating feedback ACL: "+reason);};

function expectGrantRows(records,stage){
  const expected=Object.keys(expectedFeedbackExecutors(stage));
  const groups=expected.map(signature=>({
    signature,actors:records.filter(x=>x.signature===signature).map(x=>({
      role:x.role,grantOption:x.grant_option,
    })),
  }));
  deny(!records.some(x=>!expected.includes(x.signature) || !x.role),
    "unexpected or unresolved function EXECUTE");
  assertFeedbackFunctionCatalog(groups,stage);
}

function inspectFunctionBodies(metadata,stage){
  const expected=expectedFeedbackExecutors(stage);
  for(const item of metadata){
    const owner=item.signature===feedbackRoutines.staffLocker?S:
      [feedbackRoutines.phase,feedbackRoutines.projection].includes(
        item.signature)?F:
      [feedbackRoutines.approveNotice,feedbackRoutines.revokeNotice,
        feedbackRoutines.approveDisposition,feedbackRoutines.applyDisposition,
        feedbackRoutines.expire].includes(item.signature)?P:
        stage.migrationRole;
    deny(item.oid&&item.owner===owner,"missing/wrong function owner "+item.signature);
    deny(item.prosecdef===true &&
      Array.isArray(item.proconfig) &&
      item.proconfig.includes("search_path=pg_catalog"),
      "unsafe function DEFINER/search_path "+item.signature);
    if([F,P].includes(owner))
      deny(item.provolatile==="v"&&item.prokind==="f" &&
        item.proconfig.length===1,
        "unsafe function VOLATILE or added GUC "+item.signature);
  }
  deny(equal(metadata.map(x=>x.signature),Object.keys(expected)),
    "function signature inventory");
}

function inspectSchemas(schemas){
  const expected={
    [F]:["public","auth_proof_private"],
    [P]:["public","rating_feedback_private"],
    [A]:["public"],[E]:["public"],
  };
  for(const role of FEAT){
    const mine=schemas.filter(x=>x.role===role);
    deny(equal(mine.filter(x=>x.usage).map(x=>x.schema),expected[role]),
      "unexpected schema USAGE "+role);
    deny(!mine.some(x=>x.create_access),"schema CREATE must be denied "+role);
  }
}

function inspectGuardColumns(guards,stage){
  const expected=[...GUARDS_P2,...(stage.readerInstalled?GUARDS_P5:[])];
  deny(guards.length===expected.length,"guard catalog incomplete");
  for(const [relation_name,column_name] of expected){
    const guard=guards.find(x=>
      x.relation_name===relation_name&&x.column_name===column_name);
    deny(guard?.bigint===true&&guard.required===true&&
      guard.zero_checked===true&&
      ["0","0::bigint","0::int8"].includes(guard.default_sql),
      "non-constant/unvalidated lock guard "+relation_name+"."+column_name);
  }
}

function inspectUnrelatedGrants(featureGrants,expectedExecutors,allowed){
  const expected=new Set(Object.entries(expectedExecutors).flatMap(
    ([signature,actors])=>actors.filter(role=>FEAT.includes(role))
      .map(role=>`${signature}|${role}`)));
  for(const record of featureGrants){
    const entry=`${record.signature}|${record.role}`;
    deny((expected.has(entry)||allowed.has(entry))&&
      record.grant_option===false,
      "unexpected function grant to F/P/A/E or private PUBLIC "+entry);
  }
}

function inspectNewTableGrants(direct,context){
  const expected=expectedFeedbackColumns(context);
  for(const grant of direct){
    if(grant.role===context.migrationRole)continue;
    const right=`${grant.relation}|${grant.column_name}|${grant.privilege}`;
    deny(grant.kind==="column" &&
      expected[grant.role]?.includes(right)===true &&
      grant.grant_option===false,
      "extra direct new-table ACL/PUBLIC/grant option "+grant.relation);
  }
}

export async function verifyRatingFeedbackAcl(
  client,{boundary,phase,stage,installed,runtimeRole,migrationRole,
    disposable=false,releaseApproved=false}){
  const spec=resolveFeedbackStage({phase,stage,installed,runtimeRole,
    migrationRole,disposable,releaseApproved});
  if(boundary?.phase!==phase)
    throw Error("Rating feedback boundary phase receipt mismatch.");
  await assertSameCutoverTransaction(client,migrationRole,boundary);
  await verifyStaffSessionLockAcl(client,runtimeRole,migrationRole,[
    runtimeRole,optionCRoles.staffAuthWriter,optionCRoles.mfaWriter,
    optionCRoles.managementWriter,
  ],{
    requireRuntimeExecute:phase==="PROTECTED",
    allowFeedbackReaderExecutor:spec.readerActive,
  });
  const signatures=Object.keys(expectedFeedbackExecutors(spec));
  const catalog=await rows(client,"roles",[[...OWNERS,A,E]]);
  const owned=await rows(client,"owned",[OWNERS,signatures]);
  const membership=await rows(client,"memberships",[[...OWNERS,A,E,runtimeRole]]);
  assertFeedbackRoleCatalog({roles:catalog,owned,membership},spec);
  for(const operator of [A,E]){
    const r=catalog.find(x=>x.name===operator);
    deny(r?.login===true && r.inherit===false &&
      ["superuser","createdb","createrole","replication","bypassrls"]
        .every(key=>r[key]===false),"privacy operator role unsafe "+operator);
    const edges=membership.filter(m=>
      m.parent===operator||m.member===operator);
    deny(edges.length===1 && edges.every(m=>
        m.parent===operator &&
        m.member===migrationRole && m.admin===true &&
        m.inherit===false && m.set===false &&
        m.grantor!==migrationRole && m.grantor_superuser===true),
      "privacy operator membership unsafe "+operator);
  }
  const funcs=await rows(client,"routines",[signatures]);
  inspectFunctionBodies(funcs,spec);
  expectGrantRows(await rows(client,"executors",[signatures]),spec);
  const featureGrants=await rows(client,"featureExecutors",[
    FEAT,[...signatures,"rating_feedback_private.canonical_comment(text)"]]);
  const allowed=new Set([
    `rating_feedback_private.canonical_comment(text)|${P}`,
  ]);
  inspectUnrelatedGrants(featureGrants,
    expectedFeedbackExecutors(spec),allowed);
  assertFeedbackColumnCatalog(
    await rows(client,"columns",[FEAT]),spec);
  deny((await rows(client,"tables",[FEAT])).length===0,
    "unexpected table-level privileges");
  const tableOwners=await rows(client,"featureTableOwners",[featureTables]);
  deny(tableOwners.length===featureTables.length &&
    tableOwners.every(row=>row.owner===migrationRole),
    "new child/notice/command relation owner differs from M");
  const direct=await rows(client,"grants",[featureTables]);
  inspectNewTableGrants(direct,spec);
  inspectSchemas(await rows(client,"schemas",[FEAT]));
  const dbAccess=await rows(client,"databaseAccess",[FEAT]);
  deny(dbAccess.length===FEAT.length &&
    dbAccess.every(x=>x.can_create===false&&x.can_temp===false&&
      x.owns_database===false),
    "feature principal has database CREATE/TEMP or ownership");
  const guards=[...GUARDS_P2,...(spec.readerInstalled?GUARDS_P5:[])];
  inspectGuardColumns(await rows(client,"guards",[
    guards.map(x=>x[0]),guards.map(x=>x[1])]),spec);
  const defaults=await rows(client,"defaults",[[F,P]]);
  for(const owner of [F,P]){
    const all=defaults.filter(x=>x.role===owner);
    deny(all.some(x=>x.kind==="f"&&x.schema==="*"&&
      x.grantee!=="PUBLIC") &&
      !all.some(x=>x.grantee==="PUBLIC" && x.privilege==="EXECUTE"),
      "PUBLIC default EXECUTE is not revoked for "+owner);
  }
  await assertSameCutoverTransaction(client,migrationRole,boundary);
  return Object.freeze({ok:true,stage:spec.stage,phase:spec.phase,
    installed:spec.installed,ownerCount:OWNERS.length});
}
