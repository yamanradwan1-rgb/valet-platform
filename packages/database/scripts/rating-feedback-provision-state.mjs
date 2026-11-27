import {feedbackRoles,feedbackRoutines} from "./rating-feedback-stage-contract.mjs";

const P2=[
  "guestBearer","guestBrowser","phase","approveNotice",
  "revokeNotice","approveDisposition","applyDisposition","expire",
];

export function classifyRatingFeedbackGrants(permissions){
  const p2=P2.map(key=>permissions[key]===true);
  const p5=[permissions.reader===true,permissions.nested===true];
  if(p2.every(x=>!x)&&p5.every(x=>!x))return "PREPARE";
  if(p2.every(Boolean)&&p5.every(x=>!x))return "P2_TEST";
  if(p2.every(Boolean)&&p5.every(Boolean))return "P5_TEST";
  throw Error("Rating feedback partial or unexpected staged EXECUTE privileges.");
}

export function assertRatingFeedbackTransition(before,next){
  if(next==="RELEASE")throw Error("Rating feedback separate Owner release required.");
  const permitted={
    PREPARE:["PREPARE","P2_TEST"],
    P2_TEST:["P2_TEST","P5_TEST"],
    P5_TEST:["P5_TEST"],
  };
  if(!permitted[before]?.includes(next))
    throw Error(`Rating feedback nonmonotonic or skipped stage ${before}→${next}.`);
}

export async function readRatingFeedbackGrantStage(client,runtimeRole){
  const query=`SELECT
    COALESCE(pg_catalog.has_function_privilege($1,
      pg_catalog.to_regprocedure($2),'EXECUTE'),false) AS "guestBearer",
    COALESCE(pg_catalog.has_function_privilege($1,
      pg_catalog.to_regprocedure($3),'EXECUTE'),false) AS "guestBrowser",
    COALESCE(pg_catalog.has_function_privilege($1,
      pg_catalog.to_regprocedure($4),'EXECUTE'),false) AS phase,
    COALESCE(pg_catalog.has_function_privilege($5,
      pg_catalog.to_regprocedure($6),'EXECUTE'),false) AS "approveNotice",
    COALESCE(pg_catalog.has_function_privilege($5,
      pg_catalog.to_regprocedure($7),'EXECUTE'),false) AS "revokeNotice",
    COALESCE(pg_catalog.has_function_privilege($5,
      pg_catalog.to_regprocedure($8),'EXECUTE'),false) AS "approveDisposition",
    COALESCE(pg_catalog.has_function_privilege($9,
      pg_catalog.to_regprocedure($10),'EXECUTE'),false) AS "applyDisposition",
    COALESCE(pg_catalog.has_function_privilege($9,
      pg_catalog.to_regprocedure($11),'EXECUTE'),false) AS expire,
    COALESCE(pg_catalog.has_function_privilege($1,
      pg_catalog.to_regprocedure($12),'EXECUTE'),false) AS reader,
    COALESCE(pg_catalog.has_function_privilege($13,
      pg_catalog.to_regprocedure($14),'EXECUTE'),false) AS nested`;
  const f=feedbackRoutines;
  const result=await client.query(query,[
    runtimeRole,f.guestBearer4,f.guestBrowser4,f.phase,
    feedbackRoles.approver,f.approveNotice,f.revokeNotice,f.approveDisposition,
    feedbackRoles.executor,f.applyDisposition,f.expire,
    f.projection,feedbackRoles.reader,f.staffLocker,
  ]);
  if(result.rowCount!==1)throw Error("Rating feedback stage probe is missing.");
  return classifyRatingFeedbackGrants(result.rows[0]);
}
