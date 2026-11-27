// Isolated P2_TEST/P5_TEST/PREPARE only. There is deliberately no RELEASE path.
// This entrypoint must not be run against production/staging/shared databases.
import "dotenv/config";
import pg from "pg";

import {
  migrationClientConfig,verifyMigrationConnectionTls,
} from "./database-connection-policy.mjs";
import {verifyOptionCCutoverLogins} from "./option-c-cutover-login-verification.mjs";
import {
  assertRatingFeedbackDisposableTarget,
  readRatingFeedbackProvisionConfiguration,
} from "./rating-feedback-provision-config.mjs";
import {
  runRatingFeedbackProvisionTransaction,
} from "./rating-feedback-provision-transaction.mjs";

async function main(){
  const c=readRatingFeedbackProvisionConfiguration();
  const database=migrationClientConfig(c.optionC.migration,process.env.NODE_ENV);
  await verifyOptionCCutoverLogins(c.optionC,database,process.env.NODE_ENV);
  const client=new pg.Client({
    ...database,connectionTimeoutMillis:5000,query_timeout:30000,
  });
  try{
    await client.connect();
    await verifyMigrationConnectionTls(client,process.env.NODE_ENV);
    await assertRatingFeedbackDisposableTarget(client,c);
    const result=await runRatingFeedbackProvisionTransaction(client,c);
    // No database/role/password/credential details emitted to logs.
    console.log(`Rating feedback ${result.stage}: ${result.replayed?
      "verified replay":"verified stage transition"}; phase ${result.phase}.`);
  }finally{
    await client.end();
  }
}

await main();
