// Issue #463: exact stage/owner contract, never a production activation signal.
export const feedbackRoles = Object.freeze({
  sessionLocker: "vaylet_staff_session_lock_owner",
  reader: "vaylet_rating_feedback_reader_owner",
  privacy: "vaylet_rating_feedback_privacy_owner",
  approver: "vaylet_rating_feedback_privacy_approver",
  executor: "vaylet_rating_feedback_privacy_executor",
});

// Persisted production ABI per Master Plan §§6–7,17; no p0_ names.
export const feedbackRoutines = Object.freeze({
  staffLocker:
    "public.staff_auth_lock_current_session(uuid,uuid,text,timestamptz,text)",
  phase: "public.rating_feedback_is_protected()",
  projection:
    "public.management_rating_feedback_projection(uuid,uuid,text,timestamptz,uuid,uuid,uuid,date,date)",
  guestBearer4: "public.guest_rating_submit(text,integer,text,uuid)",
  guestBrowser4: "public.guest_browser_rating_submit(text,integer,text,uuid)",
  approveNotice:
    "public.approve_guest_rating_comment_notice(uuid,uuid,integer,uuid)",
  revokeNotice:
    "public.revoke_guest_rating_comment_notice(uuid,uuid,integer,uuid)",
  approveDisposition:
    "public.approve_guest_rating_comment_disposition(uuid,uuid,uuid,uuid,text,uuid,timestamptz)",
  applyDisposition: "public.apply_guest_rating_comment_disposition(uuid)",
  expire: "public.expire_guest_rating_comments(integer)",
});

const safeRole = /^[a-z_][a-z0-9_]{0,62}$/u;

export function resolveFeedbackStage({
  phase, installed, stage, runtimeRole, migrationRole,
  disposable = false, releaseApproved = false,
}) {
  if (!safeRole.test(runtimeRole??"") ||
      !safeRole.test(migrationRole??"") ||
      new Set([runtimeRole,migrationRole,...Object.values(feedbackRoles)]).size!==7)
    throw Error("Rating feedback roles must be distinct safe principals.");
  if (!["LEGACY","PROTECTED"].includes(phase) ||
      !["P2","P5"].includes(installed) ||
      !["PREPARE","P2_TEST","P5_TEST","RELEASE"].includes(stage))
    throw Error("Rating feedback stage/phase/installation is invalid.");
  if (stage!=="PREPARE" && phase!=="PROTECTED")
    throw Error("Rating feedback activation requires PROTECTED.");
  if (stage==="P5_TEST" && installed!=="P5")
    throw Error("P5_TEST requires P5 migration.");
  if (stage.endsWith("_TEST") && !disposable)
    throw Error("TEST requires attested disposable PostgreSQL target.");
  if (stage==="RELEASE" && (!releaseApproved || installed!=="P5"))
    throw Error("RELEASE requires separate Owner release authorization and P5.");
  return Object.freeze({
    phase,installed,stage,runtimeRole,migrationRole,disposable,
    active:stage!=="PREPARE",
    readerInstalled:installed==="P5",
    readerActive:installed==="P5" &&
      ["P5_TEST","RELEASE"].includes(stage),
  });
}

export function expectedFeedbackExecutors(context) {
  const {sessionLocker: S,reader:F,privacy:P,approver:A,executor:E}=feedbackRoles;
  const {runtimeRole:R,migrationRole:M,active,readerActive,readerInstalled}=context;
  const owner = x => [x];
  const runtime = x => [x,...(active?[R]:[])];
  const expected = {
    [feedbackRoutines.staffLocker]:[S,R,...(readerActive?[F]:[])],
    [feedbackRoutines.phase]:[F,M,P,...(active?[R]:[])],
    [feedbackRoutines.guestBearer4]:runtime(M),
    [feedbackRoutines.guestBrowser4]:runtime(M),
    [feedbackRoutines.approveNotice]:[P,...(active?[A]:[])],
    [feedbackRoutines.revokeNotice]:[P,...(active?[A]:[])],
    [feedbackRoutines.approveDisposition]:[P,...(active?[A]:[])],
    [feedbackRoutines.applyDisposition]:[P,...(active?[E]:[])],
    [feedbackRoutines.expire]:[P,...(active?[E]:[])],
  };
  if (readerInstalled)
    expected[feedbackRoutines.projection]=owner(F).concat(readerActive?[R]:[]);
  return expected;
}
