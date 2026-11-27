import {
  decodedDatabaseIdentity,parseRuntimeDatabaseUrlForProvisioning,
} from "./database-connection-policy.mjs";
import {readOptionCCutoverConfiguration} from "./option-c-protected-cutover-state.mjs";
import {feedbackRoles} from "./rating-feedback-stage-contract.mjs";

const expectedStage=new Set(["PREPARE","P2_TEST","P5_TEST"]);

export function readRatingFeedbackProvisionConfiguration(env=process.env){
  if(env.NODE_ENV!=="test"||!expectedStage.has(env.RATING_FEEDBACK_STAGE))
    throw Error("Rating feedback provisioning is disposable test-only; RELEASE prohibited.");
  // Reuse Option C's actual credential separation, target and operator opt-ins.
  const optionC=readOptionCCutoverConfiguration(env);
  const {migrationIdentity:M,runtimeIdentity:R}=optionC;
  if(M.host!=="127.0.0.1"||R.host!=="127.0.0.1"||
    !/^(p0463_|issue463_)[a-z0-9_]+$/u.test(M.database)||
    Number(M.port)<1025 || Number(M.port)>65535)
    throw Error("Rating feedback target must be independent loopback PG fixture.");
  if(env.RATING_FEEDBACK_ATTESTED_DATABASE!==M.database||
    !/^\d{15,20}$/u.test(env.RATING_FEEDBACK_ATTESTED_SYSTEM_IDENTIFIER??""))
    throw Error("Rating feedback requires independently attested disposable PG identity.");
  const credentials=[];
  for(const [key,role] of [
    ["RATING_FEEDBACK_APPROVER_DATABASE_URL",feedbackRoles.approver],
    ["RATING_FEEDBACK_EXECUTOR_DATABASE_URL",feedbackRoles.executor]]){
    const connection=parseRuntimeDatabaseUrlForProvisioning(env[key],key);
    const id=decodedDatabaseIdentity(connection);
    if(id.role!==role||id.host!==M.host||id.port!==M.port||
      id.database!==M.database)
      throw Error("Rating feedback operator must have exact isolated identity.");
    credentials.push(id);
  }
  const identities=[M,R,...Object.values(optionC.writers),...credentials];
  if(new Set(identities.map(x=>x.role)).size!==identities.length||
    new Set(identities.map(x=>x.password)).size!==identities.length)
    throw Error("Rating feedback credentials are not independently isolated.");
  return Object.freeze({
    optionC,stage:env.RATING_FEEDBACK_STAGE,
    installed:env.RATING_FEEDBACK_INSTALLED,
    migrationRole:M.role,runtimeRole:R.role,
    approverPassword:credentials[0].password,
    executorPassword:credentials[1].password,
    expectedDatabase:M.database,
    expectedSystemIdentifier:env.RATING_FEEDBACK_ATTESTED_SYSTEM_IDENTIFIER,
    disposable:true,
  });
}

export async function assertRatingFeedbackDisposableTarget(client,config){
  const result=await client.query(
    `SELECT current_setting('server_version_num')::integer AS version,
       current_database() AS database,current_user AS principal,
       session_user AS login,pg_catalog.pg_is_in_recovery() AS recovery,
       system_identifier::text AS system_id
     FROM pg_catalog.pg_control_system()`);
  const row=result.rows[0];
  if(result.rowCount!==1||row?.version<170000||row.version>=180000||
    row.database!==config.expectedDatabase||
    row.principal!==config.migrationRole||
    row.login!==config.migrationRole||row.recovery!==false||
    row.system_id!==config.expectedSystemIdentifier)
    throw Error("Rating feedback disposable PG17 target attestation failed.");
}
