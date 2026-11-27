import {databaseFailureReason} from "./database-failure-reason";
import type {PostgresPool} from "./postgres";
import {
  RuntimeDatabaseUnavailableError,withGeneralDatabaseDeadline,
} from "./runtime-database-deadline";

type RatingFeedbackReadinessMode = "write" | "read";
interface FeedbackReadinessRow {
  phase_ready: boolean;
  functions_ready: boolean;
  owner_ready: boolean;
  grants_safe: boolean;
  guards_ready: boolean;
}

const writeSignatures = [
  "public.rating_feedback_is_protected()",
  "public.guest_rating_submit(text,integer,text,uuid)",
  "public.guest_browser_rating_submit(text,integer,text,uuid)",
];
const readSignature =
  "public.management_rating_feedback_projection(uuid,uuid,text,timestamptz,uuid,uuid,uuid,date,date)";
const writeGuards = [
  ["public.valet_sessions","rating_feedback_privacy_lock_guard"],
  ["public.guest_location_privacy","rating_feedback_notice_lock_guard"],
  ["public.guest_rating_comments","rating_feedback_lock_guard"],
];
const readGuards = [
  ...["organizations","organization_memberships",
    "organization_subscriptions","locations","membership_location_access",
    "user_mfa_totp_factors"].map(table=>[
      `public.${table}`,"rating_feedback_lock_guard",
    ]),
];

// Explicitly activated by the new Guest/Management consumers only.
// The legacy runtime health check remains exactly unchanged.
function readinessQuery(mode:RatingFeedbackReadinessMode):string{
  const names=[...writeSignatures,...(mode==="read"?[readSignature]:[])];
  const guards=[...writeGuards,...(mode==="read"?readGuards:[])];
  const functionValues=names.map(name=>`('${name}')`).join(",");
  const guardValues=guards.map(([table,col])=>
    `('${table}','${col}')`).join(",");
  // A P2-capable API must remain ready after the P5 migration installs
  // the second F-owned reader function, even before P5_TEST/RELEASE.
  const permittedReaderCounts=mode==="read"?"(2)":"(1,2)";
  const readerGrant=mode==="read"?`
    AND COALESCE(pg_catalog.has_function_privilege(
      current_user,pg_catalog.to_regprocedure('${readSignature}'),'EXECUTE'),false)
    AND COALESCE(pg_catalog.has_function_privilege(
      'vaylet_rating_feedback_reader_owner',
      pg_catalog.to_regprocedure(
        'public.staff_auth_lock_current_session(uuid,uuid,text,timestamptz,text)'),
      'EXECUTE'),false)`:"";
  return `WITH required(signature) AS
    (VALUES ${functionValues}),
  guards(relation_name,column_name) AS (VALUES ${guardValues})
  SELECT
    COALESCE(public.rating_feedback_is_protected(),false) AS phase_ready,
    (
      SELECT COALESCE(bool_and(
        COALESCE(pg_catalog.has_function_privilege(
          current_user,pg_catalog.to_regprocedure(signature),'EXECUTE'),false)),
        false)
      FROM required
    ) ${readerGrant} AS functions_ready,
    (
      SELECT COUNT(*) IN ${permittedReaderCounts} FROM pg_catalog.pg_proc
      WHERE proowner=(SELECT oid FROM pg_catalog.pg_roles
        WHERE rolname='vaylet_rating_feedback_reader_owner')
    )
    AND (SELECT COUNT(*)=5 FROM pg_catalog.pg_proc
      WHERE proowner=(SELECT oid FROM pg_catalog.pg_roles
        WHERE rolname='vaylet_rating_feedback_privacy_owner'))
    AND (SELECT COUNT(*)=1 FROM pg_catalog.pg_proc
      WHERE proowner=(SELECT oid FROM pg_catalog.pg_roles
        WHERE rolname='vaylet_staff_session_lock_owner'))
    AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles
      WHERE rolname IN ('vaylet_rating_feedback_reader_owner',
                        'vaylet_rating_feedback_privacy_owner')
        AND (rolcanlogin OR rolinherit OR rolsuper OR rolcreatedb
          OR rolcreaterole OR rolreplication OR rolbypassrls))
      AS owner_ready,
    NOT COALESCE(pg_catalog.has_any_column_privilege(current_user,
      'public.guest_rating_comments','SELECT,INSERT,UPDATE,REFERENCES'),true)
    AND NOT COALESCE(pg_catalog.has_any_column_privilege(current_user,
      'public.guest_rating_comment_privacy_commands',
      'SELECT,INSERT,UPDATE,REFERENCES'),true)
    AND NOT COALESCE(pg_catalog.has_any_column_privilege(current_user,
      'public.guest_rating_comment_notice_approvals',
      'SELECT,INSERT,UPDATE,REFERENCES'),true)
    AND NOT COALESCE(pg_catalog.has_column_privilege(
      'vaylet_rating_feedback_privacy_owner','public.guest_rating_comments',
      'comment_text','SELECT'),true)
    AND NOT COALESCE(pg_catalog.has_column_privilege(
      'vaylet_rating_feedback_reader_owner','public.staff_auth_sessions',
      'current_access_token_hash','SELECT'),true)
    AND NOT EXISTS(
      SELECT 1 FROM required x
      JOIN pg_catalog.pg_proc p
        ON p.oid=pg_catalog.to_regprocedure(x.signature)
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
        p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
      WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'
    ) AS grants_safe,
    (
      SELECT COUNT(*)=${guards.length}
      FROM guards g
      JOIN pg_catalog.pg_class c ON
        c.oid=pg_catalog.to_regclass(g.relation_name)
      JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
        AND a.attname=g.column_name AND a.attnum>0 AND NOT a.attisdropped
      JOIN pg_catalog.pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
      WHERE a.atttypid='pg_catalog.int8'::regtype AND a.attnotnull
        AND pg_catalog.pg_get_expr(d.adbin,d.adrelid) IN ('0','0::bigint')
        AND EXISTS(SELECT 1 FROM pg_catalog.pg_constraint check_rule
          WHERE check_rule.conrelid=c.oid AND check_rule.contype='c'
            AND check_rule.convalidated AND a.attnum=ANY(check_rule.conkey)
            AND regexp_replace(
              pg_catalog.pg_get_constraintdef(check_rule.oid),
              '[() ]','','g') IN
              ('CHECK'||g.column_name||'=0',
               'CHECK'||g.column_name||'=0::bigint'))
    ) AS guards_ready`;
}

export async function verifyRatingFeedbackDatabaseReadiness(
  pool:Pick<PostgresPool,"query">,
  mode:RatingFeedbackReadinessMode,
):Promise<void>{
  if(mode!=="write"&&mode!=="read")
    throw Error("Invalid rating feedback readiness mode.");
  try{
    const result=await withGeneralDatabaseDeadline(2_500,()=>
      pool.query<FeedbackReadinessRow>(readinessQuery(mode)));
    const row=result.rows[0];
    if(result.rowCount!==1||row?.phase_ready!==true||
      row.functions_ready!==true||row.owner_ready!==true||
      row.grants_safe!==true||row.guards_ready!==true)
      throw new RuntimeDatabaseUnavailableError();
  }catch(error){
    if(error instanceof RuntimeDatabaseUnavailableError)throw error;
    throw new RuntimeDatabaseUnavailableError(
      databaseFailureReason(error)??"DATABASE_UNAVAILABLE");
  }
}
