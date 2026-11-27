import {
  feedbackRoles,feedbackRoutines,resolveFeedbackStage,
} from "./rating-feedback-stage-contract.mjs";
import {
  readRatingFeedbackGrantStage,assertRatingFeedbackTransition,
} from "./rating-feedback-provision-state.mjs";
import {verifyRatingFeedbackAcl} from "./rating-feedback-acl-verifier.mjs";
import {
  lockOptionCBoundary,assertSameCutoverTransaction,
} from "./option-c-protected-cutover-state.mjs";

async function formatted(client,statement,values){
  const placeholders=values.map((_,i)=>`$${i+2}::text`).join(",");
  const output=await client.query(
    `SELECT pg_catalog.format($1,${placeholders}) AS sql`,
    [statement,...values]);
  if(output.rowCount!==1||typeof output.rows[0]?.sql!=="string")
    throw Error("Rating feedback safe SQL formatting failed.");
  await client.query(output.rows[0].sql);
}

const defaults=Object.freeze({
  lockBoundary:lockOptionCBoundary,
  assertSameTransaction:assertSameCutoverTransaction,
  readStage:readRatingFeedbackGrantStage,
  verifyAcl:verifyRatingFeedbackAcl,
  formatted,
});

async function grantOwned(client,role,grants,executeFormatted){
  await client.query(`SET LOCAL ROLE ${role}`);
  try{
    for(const [signature,grantee] of grants){
      await executeFormatted(client,
        `GRANT EXECUTE ON FUNCTION ${signature} TO %I`,[grantee]);
    }
  }finally{
    await client.query("RESET ROLE");
  }
}

async function grantP2(client,context,passwords,executeFormatted){
  const {migrationRole:M,runtimeRole:R}=context;
  const {reader:F,privacy:P,approver:A,executor:E}=feedbackRoles;
  const f=feedbackRoutines;
  for(const [role,password] of [
    [A,passwords.approverPassword],[E,passwords.executorPassword]]){
    if(typeof password!=="string"||password.length<1)
      throw Error("Rating feedback disposable operator credential missing.");
    await executeFormatted(client,"ALTER ROLE %I WITH LOGIN PASSWORD %L",[
      role,password,
    ]);
  }
  // The migrated Guest definer functions are already owned by the trusted M.
  for(const signature of [f.guestBearer4,f.guestBrowser4]){
    await executeFormatted(client,
      `GRANT EXECUTE ON FUNCTION ${signature} TO %I`,[R]);
  }
  await grantOwned(client,F,[[f.phase,R]],executeFormatted);
  await grantOwned(client,P,[
    [f.approveNotice,A],[f.revokeNotice,A],[f.approveDisposition,A],
    [f.applyDisposition,E],[f.expire,E],
  ],executeFormatted);
  if(M===R)throw Error("Rating feedback credential separation lost.");
}

async function grantP5(client,context,executeFormatted){
  const {runtimeRole:R}=context;
  const {reader:F,sessionLocker:S}=feedbackRoles;
  await grantOwned(client,S,[
    [feedbackRoutines.staffLocker,F],
  ],executeFormatted);
  await grantOwned(client,F,[
    [feedbackRoutines.projection,R],
  ],executeFormatted);
}

// No connect, no production release path. Caller must provide a protected
// migration connection after independent local target attestation.
export async function runRatingFeedbackProvisionTransaction(
  client,requested,dependencies=defaults){
  if(requested.stage==="RELEASE")
    throw Error("Rating feedback separate Owner release not authorized.");
  if(!["PREPARE","P2_TEST","P5_TEST"].includes(requested.stage))
    throw Error("Rating feedback explicit provisioning stage is required.");
  await client.query("BEGIN");
  try{
    await client.query("SET LOCAL lock_timeout='2s'");
    const boundary=await dependencies.lockBoundary(client,requested.migrationRole);
    const context=resolveFeedbackStage({
      ...requested,phase:boundary.phase,
    });
    await dependencies.assertSameTransaction(
      client,requested.migrationRole,boundary);
    const before=await dependencies.readStage(client,context.runtimeRole);
    assertRatingFeedbackTransition(before,context.stage);
    await dependencies.verifyAcl(client,{
      ...context,stage:before,boundary,disposable:context.disposable,
    });
    if(before!==context.stage){
      if(context.stage==="P2_TEST"){
        await grantP2(client,context,requested,dependencies.formatted);
      }else{
        await grantP5(client,context,dependencies.formatted);
      }
    }
    if(before!==context.stage)
      await dependencies.verifyAcl(client,{...context,boundary});
    await dependencies.assertSameTransaction(
      client,requested.migrationRole,boundary);
    await client.query("COMMIT");
    return Object.freeze({
      phase:boundary.phase,stage:context.stage,replayed:before===context.stage,
    });
  }catch(error){
    try{await client.query("ROLLBACK");}catch{ /* Preserve primary error. */ }
    throw error;
  }
}
