import { execFileSync } from "node:child_process";
import { Client } from "pg";
import { expect } from "vitest";
import type { acquireIssue463BrowserTarget } from "./issue463-browser-target";
import { assertContainer } from "./issue463-browser-target";
import type {
  CaseScopedVisit, QuarantinedRestoreTarget,
} from "../src/modules/guest-access/rating-disposition-ledger-restore";

type Target = Awaited<ReturnType<typeof acquireIssue463BrowserTarget>>;
type State = { rating: number; state: string; comment_text: string | null; outcome: string | null; case_id: string };

/** Immediate (within approval TTL) backup/restore on the owned synthetic PG17.
 * A delayed restore with an expired A approval fails closed: this is not a
 * provider-qualified recovery path, and it never bypasses E's expiry check.
 * No runtime connection to the restored DB; no production inspector/provider. */
export async function snapshotQuarantinedIssue463Restore(
  target: Target, scope: CaseScopedVisit, expectedText: string,
) {
  if (process.env.NODE_ENV !== "test" ||
      process.env.ISSUE463_BROWSER_QA !== "I_OWN_DISPOSABLE_463" ||
      process.env.CI !== undefined ||
      !/^[a-f0-9]{32}$/.test(target.owner) || !/^[a-f0-9]{64}$/.test(target.id) ||
      target.database !== "issue463_p7_" + target.owner.slice(0, 12)) {
    throw Error("Issue463 restore refuses unattested fixture.");
  }
  const restored = "issue463_restore_" + target.owner.slice(0, 12);
  const archive = "/var/lib/postgresql/data/issue463-" + target.owner + ".dump";
  function docker(args: string[], capture = false) {
    if (assertContainer(target.id,target.owner) !== target.port) {
      throw Error("Issue463 restore target changed.");
    }
    return execFileSync("docker", ["exec", target.id, ...args], {
      encoding: "utf8", timeout: 120_000, windowsHide: true,
      stdio: ["ignore", capture ? "pipe" : "ignore", "pipe"],
    })?.trim() ?? "";
  }
  function sql(query: string) {
    return docker(["psql","-X","-Atq","-v","ON_ERROR_STOP=1","-U","postgres",
      "-d","postgres","-c",query], true);
  }
  if (sql("SELECT system_identifier::text FROM pg_control_system()") !== target.system ||
      sql("SELECT count(*) FROM pg_database WHERE datname='" + restored + "'") !== "0") {
    throw Error("Issue463 restore database already exists or cluster differs.");
  }
  // Never overwrite a previous run's archive, even after an interrupted run.
  try { docker(["test","!","-e",archive]); }
  catch { throw Error("Issue463 restore archive existence could not be disproved."); }
  const mUrl = new URL(process.env.MIGRATION_DATABASE_URL ?? "");
  const eUrl = new URL(target.executorUrl);
  if (mUrl.hostname !== "127.0.0.1" || eUrl.hostname !== "127.0.0.1" ||
      mUrl.port !== target.port || eUrl.port !== target.port ||
      mUrl.pathname !== "/" + target.database ||
      eUrl.pathname !== "/" + target.database ||
      mUrl.username !== "issue463_p7_migrator" ||
      eUrl.username !== "vaylet_rating_feedback_privacy_executor") {
    throw Error("Issue463 restore URLs do not match the attested original.");
  }
  mUrl.pathname = "/" + restored; eUrl.pathname = "/" + restored;
  let m: Client | undefined;
  let e: Client | undefined;
  let archiveAttempted = false;
  let databaseAttempted = false;
  let cleaned = false;
  async function close() {
    if (cleaned) return;
    const failures: Error[] = [];
    const endClient = async (client: Client | undefined) => {
      try { await client?.end(); return true; }
      catch { return false; }
    };
    const clients = await Promise.all([endClient(m), endClient(e)]);
    if (clients.some((ended) => !ended))
      failures.push(Error("Issue463 restore client cleanup failed."));
    if (databaseAttempted) {
      try {
        sql("DROP DATABASE IF EXISTS " + restored + " WITH (FORCE)");
        if (sql("SELECT count(*) FROM pg_database WHERE datname='" + restored + "'") !== "0")
          throw Error("Issue463 restore database still exists.");
      } catch { failures.push(Error("Issue463 restore database cleanup failed.")); }
    }
    if (archiveAttempted) {
      try {
        docker(["rm","-f",archive]);
        docker(["test","!","-e",archive]);
      } catch { failures.push(Error("Issue463 restore archive cleanup failed.")); }
    }
    if (failures.length > 0)
      throw new AggregateError(failures, "Issue463 restore cleanup incomplete.");
    cleaned = true;
  }
  try {
    archiveAttempted = true; // pg_dump can leave a partial file when it fails.
    docker(["pg_dump","-U","postgres","-d",target.database,"-Fc","-f",archive]);
    databaseAttempted = true; // CREATE may commit before an output/transport error.
    // Only the fresh exact database. No production or shared fixture connection.
    sql("CREATE DATABASE " + restored + " OWNER issue463_p7_migrator TEMPLATE template0");
    const migrator = new Client({ connectionString:mUrl.toString(),connectionTimeoutMillis:5000 });
    m = migrator;
    const executor = new Client({ connectionString:eUrl.toString(),connectionTimeoutMillis:5000 });
    e = executor;
    // The target is never exposed to any real application, including API R.
    sql("REVOKE CONNECT ON DATABASE " + restored + " FROM PUBLIC, issue463_p7_runtime; GRANT CONNECT ON DATABASE " + restored + " TO vaylet_rating_feedback_privacy_executor");
    docker(["pg_restore","-U","postgres","--exit-on-error","--single-transaction","-d",restored,archive]);
    await migrator.connect(); await executor.connect();
    async function keepAllFeedbackTrafficClosed() {
      const row=await migrator.query<{db:string;owner:string;system:string;runtime:boolean;connections:number}>(
        "SELECT current_database() db,pg_get_userbyid(datdba) owner,(SELECT system_identifier::text FROM pg_control_system()) system,has_database_privilege('issue463_p7_runtime',current_database(),'CONNECT') runtime,(SELECT count(*)::int FROM pg_stat_activity WHERE datname=current_database() AND usename='issue463_p7_runtime') connections FROM pg_database WHERE datname=current_database()");
      expect(row.rows).toEqual([{db:restored,owner:"issue463_p7_migrator",system:target.system,runtime:false,connections:0}]);
    }
    const params=[scope.organizationId,scope.locationId,scope.visitId,scope.approvalId,scope.caseId];
    async function state() {
      const rows=await migrator.query<State>(`SELECT r.rating,c.state,c.comment_text,p.outcome,p.case_id
        FROM guest_ratings r JOIN guest_rating_comments c USING(organization_id,location_id,valet_session_id)
        JOIN guest_rating_comment_privacy_commands p ON p.organization_id=r.organization_id
        AND p.location_id=r.location_id AND p.visit_id=r.valet_session_id
        WHERE r.organization_id=$1 AND r.location_id=$2 AND r.valet_session_id=$3
        AND p.approval_id=$4 AND p.case_id=$5`,params);
      if(rows.rows.length!==1)throw Error("Issue463 exact restore row absent.");
      return rows.rows[0]!;
    }
    const same=(visit:CaseScopedVisit)=>visit.approvalId===scope.approvalId &&
      visit.caseId===scope.caseId && visit.visitId===scope.visitId &&
      visit.locationId===scope.locationId && visit.organizationId===scope.organizationId;
    const isErased=async()=> {
      const row=await state();
      return row.rating===5 && row.state==="ERASED" && row.comment_text===null &&
        row.outcome==="ERASED" && row.case_id===scope.caseId;
    };
    await keepAllFeedbackTrafficClosed();
    const restoredBefore=await state();
    expect(restoredBefore).toEqual({rating:5,state:"PRESENT",comment_text:expectedText,
      outcome:null,case_id:scope.caseId});
    const replayTarget:QuarantinedRestoreTarget={
      keepAllFeedbackTrafficClosed,
      async eraseTextAndKeepTombstone(visit){
        if(!same(visit))return "UNKNOWN";
        const already=await isErased();
        const applied=await executor.query<{outcome:string}>(
          "SELECT public.apply_guest_rating_comment_disposition($1::uuid) AS outcome",[visit.approvalId]);
        if(applied.rows.length!==1 || applied.rows[0]?.outcome!=="ERASED" || !await isErased())return "UNKNOWN";
        return already?"ALREADY":"APPLIED";
      },
      async verifyTerminalErased(visit){return same(visit)&&await isErased();},
      async verifyNoVisibleText(visit){
        return visit.visitId===scope.visitId && visit.organizationId===scope.organizationId &&
          visit.locationId===scope.locationId && await isErased();
      },
      async suppressHeldText(){return "UNKNOWN";},
      async reconcileHeldPending(){return "UNKNOWN";},
      async reconcileHistoricalRelease(){return "UNKNOWN";},
      async verifyClosedNoRecord(){return {exactCommittedCase:false,original24hWindowClosed:false,ratingAbsent:false};},
      async verifyFencedNoOpClosure(){return "UNKNOWN";},
      async recomputeExpiredTextFromServerTime(){
        const sweep = await executor.query<{expired:number}>(
          "SELECT public.expire_guest_rating_comments(100) AS expired");
        if (sweep.rows.length !== 1 || !Number.isInteger(sweep.rows[0]?.expired) ||
            sweep.rows[0]!.expired < 0 || sweep.rows[0]!.expired > 100) return "UNKNOWN";
        // The SQL writer is bounded to 100; a successful call is NOT proof
        // that the rest of the restored database contains no due PII.
        const residual = await migrator.query<{due:boolean}>(`SELECT EXISTS(
          SELECT 1 FROM public.guest_rating_comments
          WHERE state='PRESENT' AND retention_expires_at<=clock_timestamp()
        ) AS due`);
        return residual.rows.length === 1 && residual.rows[0]?.due === false
          ? "VERIFIED" : "UNKNOWN";
      },
    };
    return { replayTarget, state, close };
  } catch(error) {
    try { await close(); }
    catch(cleanupError) {
      const details = cleanupError instanceof AggregateError
        ? cleanupError.errors.filter((entry): entry is Error =>
          entry instanceof Error &&
          /^Issue463 restore (client|database|archive) cleanup failed\.$/.test(entry.message))
        : [];
      throw new AggregateError(
        [Error("Issue463 restore setup failed."), ...details],
        "Issue463 restore setup and cleanup failed.");
    }
    throw error;
  }
}
