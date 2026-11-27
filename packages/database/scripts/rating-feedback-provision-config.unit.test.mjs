import assert from "node:assert/strict";
import {test} from "node:test";

import {
  readRatingFeedbackProvisionConfiguration,
  assertRatingFeedbackDisposableTarget,
} from "./rating-feedback-provision-config.mjs";

const root="postgresql://";
const host="@127.0.0.1:55673/p0463_own_fixture";
const url=(role,secret)=>`${root}${role}:${secret}${host}`;
const configuration={
  NODE_ENV:"test",OPTION_C_PROTECTED_CUTOVER:"1",
  OPTION_C_LEGACY_WORKERS_DRAINED:"1",
  MIGRATION_DATABASE_URL:url("p0463_migrator","migrate1"),
  DATABASE_URL:url("p0463_runtime","runtime2"),
  STAFF_AUTH_WRITER_DATABASE_URL:url("vaylet_staff_auth_writer","writer3"),
  MFA_WRITER_DATABASE_URL:url("vaylet_mfa_writer","writer4"),
  MANAGEMENT_WRITER_DATABASE_URL:url("vaylet_management_writer","writer5"),
  RATING_FEEDBACK_APPROVER_DATABASE_URL:url(
    "vaylet_rating_feedback_privacy_approver","privacy6"),
  RATING_FEEDBACK_EXECUTOR_DATABASE_URL:url(
    "vaylet_rating_feedback_privacy_executor","privacy7"),
  RATING_FEEDBACK_INSTALLED:"P2",RATING_FEEDBACK_STAGE:"P2_TEST",
  RATING_FEEDBACK_ATTESTED_DATABASE:"p0463_own_fixture",
  RATING_FEEDBACK_ATTESTED_SYSTEM_IDENTIFIER:"7712310296557080617",
};

test("disposable configuration reuses Option C exact credential topology",()=>{
  const result=readRatingFeedbackProvisionConfiguration(configuration);
  assert.equal(result.migrationRole,"p0463_migrator");
  assert.equal(result.runtimeRole,"p0463_runtime");
  assert.equal(result.expectedSystemIdentifier,"7712310296557080617");
  assert.equal(result.disposable,true);
});

test("rejects production, release, wrong host, credentials and unknown target",()=>{
  const fail=change=>assert.throws(()=>
    readRatingFeedbackProvisionConfiguration({...configuration,...change}));
  fail({NODE_ENV:"production"});
  fail({RATING_FEEDBACK_STAGE:"RELEASE"});
  fail({OPTION_C_LEGACY_WORKERS_DRAINED:"0"});
  fail({RATING_FEEDBACK_ATTESTED_SYSTEM_IDENTIFIER:undefined});
  fail({RATING_FEEDBACK_ATTESTED_DATABASE:"different"});
  fail({DATABASE_URL:url("p0463_runtime","migrate1")});
  fail({RATING_FEEDBACK_APPROVER_DATABASE_URL:url("p0463_runtime","privacy6")});
  fail({MIGRATION_DATABASE_URL:"postgresql://p0463_migrator:p@db.example:5432/prod"});
});

test("requires actual matching PG17 system identifier before any transaction",async()=>{
  const c=readRatingFeedbackProvisionConfiguration(configuration);
  const fake=row=>({async query(){return {rowCount:1,rows:[row]};}});
  const valid={version:170011,database:c.expectedDatabase,
    principal:c.migrationRole,login:c.migrationRole,
    recovery:false,system_id:c.expectedSystemIdentifier};
  await assertRatingFeedbackDisposableTarget(fake(valid),c);
  await assert.rejects(assertRatingFeedbackDisposableTarget(
    fake({...valid,version:180000}),c),/attestation/);
  await assert.rejects(assertRatingFeedbackDisposableTarget(
    fake({...valid,system_id:"0000000000000000000"}),c),/attestation/);
  await assert.rejects(assertRatingFeedbackDisposableTarget(
    fake({...valid,login:"postgres"}),c),/attestation/);
});
