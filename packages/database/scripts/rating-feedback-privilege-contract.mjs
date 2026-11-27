import {
  feedbackRoles, feedbackRoutines, expectedFeedbackExecutors,
} from "./rating-feedback-stage-contract.mjs";

const {reader:F,privacy:P,sessionLocker:S}=feedbackRoles;
const rights=(table,columns,privilege)=>columns.split(" ")
  .filter(Boolean).map(column=>`${table}|${column}|${privilege}`);
const cols=(table,{SELECT="",INSERT="",UPDATE=""})=>[
  ...rights(table,SELECT,"SELECT"),
  ...rights(table,INSERT,"INSERT"),
  ...rights(table,UPDATE,"UPDATE"),
];

const readerP2=[
  ...cols("auth_proof_private.option_c_launch_boundary",{
    SELECT:"singleton phase",
  }),
  ...cols("public.guest_rating_comments",{
    SELECT:"organization_id location_id valet_session_id comment_text state retention_expires_at",
    UPDATE:"rating_feedback_lock_guard",
  }),
];
const readerP5=[
  ...cols("public.organizations",{
    SELECT:"id status", UPDATE:"rating_feedback_lock_guard",
  }),
  ...cols("public.organization_memberships",{
    SELECT:"id organization_id user_id role status",
    UPDATE:"rating_feedback_lock_guard",
  }),
  ...cols("public.organization_subscriptions",{
    SELECT:"organization_id dashboard_access_enabled",
    UPDATE:"rating_feedback_lock_guard",
  }),
  ...cols("public.locations",{
    SELECT:"id organization_id status name timezone",
    UPDATE:"rating_feedback_lock_guard",
  }),
  ...cols("public.membership_location_access",{
    SELECT:"organization_id membership_id location_id",
    UPDATE:"rating_feedback_lock_guard",
  }),
  ...cols("public.user_mfa_totp_factors",{
    SELECT:"id user_id state",UPDATE:"rating_feedback_lock_guard",
  }),
  ...cols("public.valet_sessions",{
    SELECT:"id organization_id location_id state completed_at",
  }),
  ...cols("public.guest_ratings",{
    SELECT:"organization_id location_id valet_session_id rating rated_at",
  }),
];
const privacyP2=[
  ...cols("public.valet_sessions",{
    SELECT:"id organization_id location_id state completed_at",
    UPDATE:"rating_feedback_privacy_lock_guard",
  }),
  ...cols("public.guest_location_privacy",{
    SELECT:"organization_id location_id published_version",
    UPDATE:"rating_feedback_notice_lock_guard",
  }),
  ...cols("public.guest_privacy_publications",{
    SELECT:"organization_id location_id version en_text en_url ar_text ar_url",
  }),
  ...cols("public.guest_rating_comment_notice_approvals",{
    SELECT:"organization_id location_id published_version approval_case_id approved_at approver_ref revoked_at revocation_case_id revoked_by_ref",
    INSERT:"organization_id location_id published_version approval_case_id approved_at approver_ref",
    UPDATE:"revoked_at revocation_case_id revoked_by_ref",
  }),
  ...cols("public.guest_rating_comments",{
    SELECT:"organization_id location_id valet_session_id state retention_expires_at hold_case_id erase_pending erased_at",
    UPDATE:"state comment_text hold_case_id erase_pending erased_at",
  }),
  ...cols("public.guest_rating_comment_privacy_commands",{
    SELECT:"approval_id organization_id location_id visit_id action case_id valid_until approved_by completed_at executed_by outcome",
    INSERT:"approval_id organization_id location_id visit_id action case_id valid_until approved_by",
    UPDATE:"completed_at executed_by outcome",
  }),
];

export function expectedFeedbackColumns(context){
  return Object.freeze({
    [F]:[...readerP2,...(context.readerInstalled?readerP5:[])],
    [P]:privacyP2,
    [feedbackRoles.approver]:[],
    [feedbackRoles.executor]:[],
  });
}

const equal=(left,right)=>left.length===right.length &&
  [...left].sort().every((item,i)=>item===[...right].sort()[i]);

export function assertFeedbackColumnCatalog(rows,context){
  const expected=expectedFeedbackColumns(context);
  const wanted=Object.entries(expected).flatMap(([role,entries])=>
    entries.map(key=>`${role}|${key}`));
  const actual=rows.map(row=>`${row.role}|${row.key}`);
  if(new Set(actual).size!==actual.length || !equal(actual,wanted))
    throw Error("Rating feedback effective ACL differs from exact column contract.");
}

export function assertFeedbackRoleCatalog({roles,owned,membership},context){
  for(const name of [S,F,P]){
    const role=roles.find(item=>item.name===name);
    if(!role||role.login!==false||role.inherit!==false||
      ["superuser","createdb","createrole","replication","bypassrls"]
        .some(k=>role[k]!==false))
      throw Error("Rating feedback owner role attributes unsafe.");
  }
  const inventory={
    [S]:[feedbackRoutines.staffLocker],
    [F]:[feedbackRoutines.phase,...(context.readerInstalled?
      [feedbackRoutines.projection]:[])],
    [P]:[
      feedbackRoutines.approveNotice,feedbackRoutines.revokeNotice,
      feedbackRoutines.approveDisposition,feedbackRoutines.applyDisposition,
      feedbackRoutines.expire,
    ],
  };
  for(const [name,routines] of Object.entries(inventory)){
    const objects=owned.filter(x=>x.owner===name);
    if(objects.some(x=>!x.signature) ||
      !equal(objects.map(x=>x.signature),routines))
      throw Error(`Rating feedback owner object inventory mismatch: ${name}`);
  }
  for(const name of [F,P,S]){
    const edges=membership.filter(x=>x.parent===name||x.member===name);
    const setOnly=edges.filter(x=>x.parent===name &&
      x.member===context.migrationRole && x.inherit===false &&
      x.set===true && x.admin===false &&
      x.grantor===context.migrationRole);
    const adminOnly=edges.filter(x=>x.parent===name &&
      x.member===context.migrationRole && x.inherit===false &&
      x.set===false && x.admin===true &&
      x.grantor!==context.migrationRole && x.grantor_superuser===true);
    if(edges.length!==2||setOnly.length!==1||adminOnly.length!==1)
      throw Error(`Rating feedback owner membership unsafe: ${name}`);
  }
}

export function assertFeedbackFunctionCatalog(rows,context){
  const expected=expectedFeedbackExecutors(context);
  if(!equal(rows.map(x=>x.signature),Object.keys(expected)))
    throw Error("Rating feedback function ACL inventory incomplete.");
  for(const row of rows){
    const actors=row.actors??[];
    if(!equal(actors.map(x=>x.role),expected[row.signature]) ||
      actors.some(x=>x.grantOption!==false))
      throw Error(`Rating feedback function ACL unauthorized: ${row.signature}`);
  }
}
