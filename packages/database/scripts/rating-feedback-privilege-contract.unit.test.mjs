import assert from "node:assert/strict";
import { test } from "node:test";

import {
  expectedFeedbackColumns,
  assertFeedbackColumnCatalog,
  assertFeedbackRoleCatalog,
  assertFeedbackFunctionCatalog,
} from "./rating-feedback-privilege-contract.mjs";
import {feedbackRoles,feedbackRoutines,resolveFeedbackStage,
  expectedFeedbackExecutors} from "./rating-feedback-stage-contract.mjs";

const stage=resolveFeedbackStage({phase:"PROTECTED",stage:"P5_TEST",
  installed:"P5",disposable:true,
  runtimeRole:"p0463_runtime",migrationRole:"p0463_migrator"});
const F=feedbackRoles.reader,P=feedbackRoles.privacy;
const exact=expectedFeedbackColumns(stage);

test("reader never gains raw staff verifier or business-column UPDATE", () => {
  const reader=exact[F];
  assert.equal(reader.includes("public.staff_auth_sessions|current_access_token_hash|SELECT"),false);
  assert.equal(reader.includes("public.organization_memberships|role|UPDATE"),false);
  assert.equal(reader.includes("public.organizations|rating_feedback_lock_guard|UPDATE"),true);
  assert.equal(reader.includes("public.guest_rating_comments|comment_text|SELECT"),true);
  assert.equal(exact[P].includes("public.guest_rating_comments|comment_text|SELECT"),false);
  assert.equal(exact[P].includes("public.guest_rating_comments|comment_text|UPDATE"),true);
});

test("effective ACL rejects extra sensitive UPDATE or raw credential SELECT", () => {
  const rows=Object.entries(exact).flatMap(([role,list])=>
    list.map(key=>({role,key})));
  assertFeedbackColumnCatalog(rows,stage);
  assert.throws(()=>assertFeedbackColumnCatalog([...rows,
    {role:F,key:"public.organizations|status|UPDATE"}],stage),/effective ACL/);
  assert.throws(()=>assertFeedbackColumnCatalog([...rows,
    {role:F,key:"public.staff_auth_sessions|current_access_token_hash|SELECT"}],stage),
  /effective ACL/);
  assert.throws(()=>assertFeedbackColumnCatalog(rows.slice(1),stage),/effective ACL/);
});

test("owners reject LOGIN, extra relation, and unapproved membership", () => {
  const roles=[F,P,feedbackRoles.sessionLocker].map(name=>({
    name,login:false,inherit:false,superuser:false,createdb:false,
    createrole:false,replication:false,bypassrls:false,
  }));
  const owned=[
    {owner:F,signature:feedbackRoutines.phase},
    {owner:F,signature:feedbackRoutines.projection},
    ...Object.keys(expectedFeedbackExecutors(stage))
      .filter(sig=>[feedbackRoutines.approveNotice,feedbackRoutines.revokeNotice,
        feedbackRoutines.approveDisposition,feedbackRoutines.applyDisposition,
        feedbackRoutines.expire].includes(sig))
      .map(signature=>({owner:P,signature})),
    {owner:feedbackRoles.sessionLocker,signature:feedbackRoutines.staffLocker},
  ];
  const membership=[...[
    F,P,feedbackRoles.sessionLocker].flatMap(parent=>[
    {parent,member:stage.migrationRole,grantor:stage.migrationRole,
      inherit:false,set:true,admin:false},
    {parent,member:stage.migrationRole,grantor:"bootstrap_superuser",
      grantor_superuser:true,inherit:false,set:false,admin:true},
  ])];
  assertFeedbackRoleCatalog({roles,owned,membership},stage);
  assert.throws(()=>assertFeedbackRoleCatalog({roles,owned:[
    ...owned,{owner:F,signature:"public.evil()"}],membership},stage),/inventory/);
  assert.throws(()=>assertFeedbackRoleCatalog({roles:roles.map(x=>
    x.name===F?{...x,login:true}:x),owned,membership},stage),/role/);
  assert.throws(()=>assertFeedbackRoleCatalog({roles,owned,membership:[
    ...membership,{parent:F,member:stage.runtimeRole,grantor:stage.migrationRole,
      inherit:false,set:true,admin:false}]},stage),/membership/);
});

test("function executor ACL rejects PUBLIC, unknown and grant-option", () => {
  const expected=expectedFeedbackExecutors(stage);
  const rows=Object.entries(expected).map(([signature,actors])=>({
    signature,actors:actors.map(role=>({role,grantOption:false})),
  }));
  assertFeedbackFunctionCatalog(rows,stage);
  assert.throws(()=>assertFeedbackFunctionCatalog(rows.map(x=>x.signature===
    feedbackRoutines.projection?{...x,actors:[...x.actors,
      {role:"PUBLIC",grantOption:false}]}:x),stage),/function ACL/);
  assert.throws(()=>assertFeedbackFunctionCatalog(rows.map(x=>x.signature===
    feedbackRoutines.staffLocker?{...x,actors:x.actors.map(a=>
      a.role===F?{...a,grantOption:true}:a)}:x),stage),/function ACL/);
});
