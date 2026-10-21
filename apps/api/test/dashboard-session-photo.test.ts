import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";
import { NotFoundException, ServiceUnavailableException, HttpException, UnauthorizedException } from "@nestjs/common";
import { mapApiError } from "../src/common/http/api-errors";
import { ApiOperationRunner } from "../src/common/http/api-operation-runner";
import { AntiAbuseService, AntiAbuseUnavailableError } from "../src/modules/anti-abuse/anti-abuse.service";
import { MfaStepUpRequiredError } from "../src/modules/auth/mfa/mfa-errors";
import type { PostgresPool } from "../src/common/database/postgres";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import type { SelectedConditionPhotoCandidate } from "../src/modules/valet-sessions/condition-photo-qualified-receipt";
import {
  listManagementSessionPhotos,
  deliverManagementSessionPhotoBytes,
  type SessionPhotoReadDependencies,
} from "../src/modules/dashboard/session-photo-service";
import { unchangedVerifiedPhoto } from "../src/modules/dashboard/session-photo-query";
import { DashboardSessionPhotoAdmission } from "../src/modules/dashboard/session-photo-admission";

const id = {
  user: "00000000-0000-4000-8000-000000000001",
  organization: "00000000-0000-4000-8000-000000000002",
  location: "00000000-0000-4000-8000-000000000003",
  membership: "00000000-0000-4000-8000-000000000004",
  session: "00000000-0000-4000-8000-000000000005",
  photo: "00000000-0000-4000-8000-000000000006",
  operation: "00000000-0000-4000-8000-000000000007",
  attempt: "00000000-0000-4000-8000-000000000008",
} as const;
const bytes = Buffer.from([255,216,255,224,7,8,9,10,255,217]);
const sha256 = createHash("sha256").update(bytes).digest();
const credential: StaffSessionContext = {
  userId:id.user,staffAuthSessionId:id.session,accessTokenHash:"test-hash",createdAt:new Date("2026-10-21"),
};
const scope = {organizationId:id.organization,locationId:id.location,membershipId:id.membership};
const request = {authenticatedUserId:id.user,credential,locationId:id.location,sessionId:id.session};

function candidate(overrides: Partial<SelectedConditionPhotoCandidate> = {}): SelectedConditionPhotoCandidate {
  return {
    organizationId:id.organization, locationId:id.location,valetSessionId:id.session,
    photoId:id.photo,operationId:id.operation,attemptId:id.attempt,
    capturedByMembershipId:id.membership,objectKey:
      "condition-photo/00000000-0000-4000-8000-000000000007/00000000-0000-4000-8000-000000000008",
    bucketAlias:"private",objectVersion:"version-1",contentSha256:Buffer.from(sha256),
    byteSize:bytes.length,...overrides,
  };
}

type State = {
  authorized: boolean;
  exists: boolean;
  candidates: SelectedConditionPhotoCandidate[];
  queryLog: string[];
  activeTransactions: number;
  onRead?: () => void;
};

function harness(overrides: Partial<State> = {}) {
  const state: State = {
    authorized:true, exists:true,candidates:[candidate()],
    queryLog:[],activeTransactions:0,...overrides,
  };
  const storeRead = vi.fn(async (_ref: unknown,_deadline: number) => {
    void _ref;
    void _deadline;
    expect(state.activeTransactions).toBe(0);
    state.onRead?.();
    return {bytes:Buffer.from(bytes),version:"version-1"};
  });
  const admission = vi.fn(async (_userId: string) => {void _userId;});
  const release = vi.fn();
  const reserve = vi.fn((_userId: string) => {void _userId;return release;});
  const authorize = vi.fn(async () => state.authorized ? scope : null);
  const pool = {
    connect:vi.fn(async () => ({
      query:vi.fn(async (sql: string, args?: unknown[]) => {
        state.queryLog.push(sql);
        if(sql==="BEGIN"){state.activeTransactions++;return {rows:[],rowCount:0};}
        if(sql==="COMMIT"||sql==="ROLLBACK"){state.activeTransactions--;return {rows:[],rowCount:0};}
        if(sql.includes("FROM valet_sessions AS session")){
          expect(args).toEqual([id.session,id.organization,id.location]);
          return {rows:[{exists:state.exists}],rowCount:1};
        }
        if(sql.includes("ORDER BY v.verified_at")){
          return {
            rows:state.candidates.map(c=>({
              photo_id:c.photoId,operation_id:c.operationId,attempt_id:c.attemptId,
              captured_by_membership_id:c.capturedByMembershipId,
              object_key:c.objectKey,bucket_alias:c.bucketAlias,object_version:c.objectVersion,
              content_sha256:c.contentSha256,byte_size:c.byteSize,
            })),
            rowCount:state.candidates.length,
          };
        }
        if(sql.includes("SELECT v.vehicle_photo_id::text AS photo_id, v.verified_at")){
          return {rows:state.candidates
            .filter(c=>(args?.[3] as string[])?.includes(c.photoId))
            .map(c=>({photo_id:c.photoId,verified_at:new Date("2026-10-21T14:00:00.000Z")})),
          };
        }
        if(sql.includes("FOR SHARE OF v,o,a,availability")){
          return {rows:state.candidates.map(c=>({photo_id:c.photoId})),rowCount:state.candidates.length};
        }
        throw new Error("Unexpected SQL (test must not simulate missing permission): "+sql.slice(0,65));
      }),
      release:vi.fn(),
    })),
  };
  const deps = {
    pool:pool as unknown as PostgresPool,
    authorize:authorize as unknown as SessionPhotoReadDependencies["authorize"],
    admission:{admit:admission,reserve},
    storage:{config:{bucketAlias:"private"},store:{
      readExact:storeRead,
    } as unknown as NonNullable<SessionPhotoReadDependencies["storage"]>["store"]},
  } satisfies SessionPhotoReadDependencies;
  return {state,storeRead,admission,reserve,release,authorize,pool,deps};
}

async function deliver(h: ReturnType<typeof harness>,photoId:string=id.photo) {
  let delivered: Buffer | undefined;
  await deliverManagementSessionPhotoBytes(h.deps,request,photoId,(buffer,release)=>{
    expect(h.state.activeTransactions).toBe(1);
    delivered=Buffer.from(buffer);
    release();
  });
  return delivered;
}

describe("Issue309 management session condition photos (isolated read pipeline)",()=>{
  it("returns bounded, verified, scoped manifest with only public display metadata",async()=>{
    const h=harness();
    const manifest=await listManagementSessionPhotos(h.deps,request);
    expect(manifest).toEqual({items:[{
      photoId:id.photo,verifiedAt:"2026-10-21T14:00:00.000Z",contentType:"image/jpeg",
    }]});
    expect(JSON.stringify(manifest)).not.toMatch(/objectKey|bucket|sha256|version|operationId|attemptId/i);
    expect(h.storeRead).not.toHaveBeenCalled();
    expect(h.authorize).toHaveBeenCalledOnce();
    expect(h.state.activeTransactions).toBe(0);
  });

  it("checks exact ValetSession binding even for zero photos and denies foreign scope",async()=>{
    const h=harness({exists:false,candidates:[]});
    await expect(listManagementSessionPhotos(h.deps,request)).rejects.toHaveProperty("code","DASHBOARD_SESSION_PHOTO_NOT_VISIBLE");
    expect(h.storeRead).not.toHaveBeenCalled();
  });

  it("never lists when the dedicated W3 authorization denies",async()=>{
    const h=harness({authorized:false});
    await expect(listManagementSessionPhotos(h.deps,request)).rejects.toHaveProperty("code","DASHBOARD_SESSION_PHOTO_NOT_VISIBLE");
    expect(h.state.queryLog.every(sql=>!sql.includes("ORDER BY v.verified_at"))).toBe(true);
  });

  it("only delivers verified exact-version SHA256 checked photo bytes, without external I/O in DB transaction",async()=>{
    const h=harness();
    expect(await deliver(h)).toEqual(bytes);
    expect(h.storeRead).toHaveBeenCalledWith({
      key:candidate().objectKey,version:"version-1",
    },10000);
    expect(h.authorize).toHaveBeenCalledTimes(2);
    expect(h.release).toHaveBeenCalledOnce();
    expect(h.state.activeTransactions).toBe(0);
  });

  it("denies once W3 authority disappears during external storage I/O",async()=>{
    const h=harness();
    h.state.onRead=()=>{h.state.authorized=false;};
    await expect(deliver(h)).rejects.toHaveProperty("code","DASHBOARD_SESSION_PHOTO_NOT_VISIBLE");
    expect(h.authorize).toHaveBeenCalledTimes(2);
  });

  it("denies photo revocation/change to verified availability between before/after S3",async()=>{
    const h=harness();
    h.state.onRead=()=>{h.state.candidates=[];};
    await expect(deliver(h)).rejects.toHaveProperty("code","DASHBOARD_SESSION_PHOTO_NOT_VISIBLE");
  });

  it("denies different immutable source object version or hash in final recheck",async()=>{
    for(const change of [{objectVersion:"version-2"},
      {contentSha256:Buffer.alloc(32,3)},{byteSize:bytes.length+1}]){
      const h=harness();
      h.state.onRead=()=>{h.state.candidates=[candidate(change)];};
      await expect(deliver(h)).rejects.toHaveProperty("code","DASHBOARD_SESSION_PHOTO_NOT_VISIBLE");
    }
  });

  it("does not fetch arbitrary photo IDs, unversioned rows, invalid bucket, or too-large object",async()=>{
    for (const rows of [[candidate()],[candidate({objectVersion:null})],
      [candidate({bucketAlias:"public"})],[candidate({byteSize:9*1024*1024})]]) {
      const h=harness({candidates:rows});
      const photoId=rows[0]?.objectVersion==="version-1" && rows[0].bucketAlias==="private" &&
        rows[0].byteSize<=8*1024*1024 ? id.operation:id.photo;
      await expect(deliver(h,photoId)).rejects.toHaveProperty("code","DASHBOARD_SESSION_PHOTO_NOT_VISIBLE");
      expect(h.storeRead).not.toHaveBeenCalled();
    }
  });

  it("denies bad store version, bad digest and provider outage without leaking internal keys",async()=>{
    for(const storeResponse of [
      {bytes:Buffer.from(bytes),version:"other"},
      {bytes:Buffer.alloc(bytes.length,3),version:"version-1"},
    ]){
      const h=harness();
      h.storeRead.mockImplementation(async()=>storeResponse);
      await expect(deliver(h)).rejects.toHaveProperty("code","DASHBOARD_SESSION_PHOTO_UNAVAILABLE");
    }
    const h=harness();
    h.storeRead.mockRejectedValueOnce(new Error("secret private key / bucket-id"));
    await expect(deliver(h)).rejects.toMatchObject({
      code:"DASHBOARD_SESSION_PHOTO_UNAVAILABLE",
      message:"Photo evidence is temporarily unavailable.",
    });
  });

  it("enforces persisted rate budget before any scoped DB/object access",async()=>{
    const h=harness();
    h.admission.mockRejectedValueOnce(Object.assign(new Error("rate"),{code:"DASHBOARD_SESSION_PHOTO_RATE_LIMITED"}));
    await expect(deliver(h)).rejects.toHaveProperty("code","DASHBOARD_SESSION_PHOTO_RATE_LIMITED");
    expect(h.pool.connect).not.toHaveBeenCalled();
  });

  it("prohibits the same photoId with modified cross-tenant scope",()=>{
    expect(unchangedVerifiedPhoto(candidate(),candidate({organizationId:id.location}))).toBe(false);
    expect(unchangedVerifiedPhoto(candidate(),candidate())).toBe(true);
  });

  it("keeps the in-flight image reservation until HTTP finish/close, not until transaction COMMIT",async()=>{
    const h=harness();
    let releaseOnFinish: (()=>void) | undefined;
    await deliverManagementSessionPhotoBytes(h.deps,request,id.photo,(_body,release)=>{
      expect(h.state.activeTransactions).toBe(1);
      releaseOnFinish=release;
    });
    expect(h.release).not.toHaveBeenCalled();
    expect(releaseOnFinish).toBeTypeOf("function");
    releaseOnFinish!();
    expect(h.release).toHaveBeenCalledOnce();
  });

  it("releases reserved S3 slot immediately on post-I/O authorization failure",async()=>{
    const h=harness();
    h.state.onRead=()=>{h.state.authorized=false;};
    await expect(deliver(h)).rejects.toHaveProperty("code","DASHBOARD_SESSION_PHOTO_NOT_VISIBLE");
    expect(h.release).toHaveBeenCalledOnce();
  });

  it("dedicated photo-view budget never increments the staff Check-In status scope",async()=>{
    const key=vi.fn((_scope:string,_user:string)=>{
      void _scope; void _user;
      return {keyHash:"dummy",lockHigh:1,lockLow:1};
    });
    const count=vi.fn(async()=>({allowed:true as const}));
    const admission=new DashboardSessionPhotoAdmission({key,count} as never);
    await admission.admit(id.user);
    expect(key).toHaveBeenCalledWith("v1:dashboard-session-photo-view-user",id.user);
    expect(count).toHaveBeenCalledOnce();
  });

  it("enforces 2 per user and 4 global concurrent byte buffers independently",()=>{
    const admission=new DashboardSessionPhotoAdmission({} as never);
    const releaseA=admission.reserve("user-a");
    const releaseB=admission.reserve("user-a");
    expect(()=>admission.reserve("user-a")).toThrow();
    const releaseC=admission.reserve("user-b");
    const releaseD=admission.reserve("user-b");
    expect(()=>admission.reserve("user-c")).toThrow();
    releaseA();
    const releaseE=admission.reserve("user-c");
    releaseA();
    releaseB();releaseC();releaseD();releaseE();
    const releaseF=admission.reserve("user-a");
    releaseF();
  });

  it.each([
    ["DASHBOARD_SESSION_PHOTO_NOT_VISIBLE",404,"The requested resource is not available."],
    ["DASHBOARD_SESSION_PHOTO_UNAVAILABLE",503,"Photo evidence is temporarily unavailable."],
    ["DASHBOARD_SESSION_PHOTO_RATE_LIMITED",429,"Too many photo requests. Try again later."],
  ] as const)("runner returns safe photo-view %s HTTP response",async(code,status,message)=>{
    const observer=vi.fn(async(_measurement:unknown)=>{void _measurement;});
    const runner=new ApiOperationRunner({now:()=>5} as never,{observe:observer} as never);
    const request={requestId:"safe-request-309"} as never;
    const failure=Object.assign(new Error(
      "SQL 23514 secret bucket=private/sensitive_object_key",
    ),{code});
    await expect(runner.run("DASHBOARD_SESSION_PHOTO_MANIFEST",request,async()=>{
      throw failure;
    })).rejects.toMatchObject({
      status,
      response:{code,message,requestId:"safe-request-309"},
    });
    const mapped=mapApiError(failure);
    expect(mapped).toMatchObject({code,message,status});
    expect(JSON.stringify(mapped)).not.toMatch(/23514|secret|bucket|object_key/i);
    expect(observer).toHaveBeenCalledOnce();
    expect(observer.mock.calls[0]?.[0]).toMatchObject({errorCode:code,outcome:"ERROR"});
  });

  it("does not accidentally reinterpret Nest HttpException statuses outside coded photo errors",()=>{
    for(const exception of [
      new NotFoundException("sensitive"),
      new ServiceUnavailableException("sensitive"),
      new HttpException("sensitive",429),
    ]){
      expect(mapApiError(exception)).toEqual({
        code:"INTERNAL_ERROR",status:500,message:"The operation could not be completed.",
      });
    }
  });

  it("returns private 404/503 codes without exposing session, SQL or provider details",async()=>{
    const hidden=harness({authorized:false});
    await expect(listManagementSessionPhotos(hidden.deps,request)).rejects.toMatchObject({
      code:"DASHBOARD_SESSION_PHOTO_NOT_VISIBLE",
    });
    const noStorage=harness();
    const missingStorage={
      pool:noStorage.deps.pool,authorize:noStorage.deps.authorize,
      admission:noStorage.deps.admission,
    };
    await expect(listManagementSessionPhotos(missingStorage,request)).rejects.toMatchObject({
      code:"DASHBOARD_SESSION_PHOTO_UNAVAILABLE",
    });
    const broken=harness();
    broken.pool.connect.mockRejectedValueOnce(Object.assign(
      new Error("SQLSTATE42501 secret photo table"),{code:"42501"},
    ));
    await expect(listManagementSessionPhotos(broken.deps,request)).rejects.toMatchObject({
      code:"DASHBOARD_SESSION_PHOTO_UNAVAILABLE",
    });
    const brokenBytes=harness();
    brokenBytes.pool.connect.mockRejectedValueOnce(Object.assign(
      new Error("SQLSTATE42501 private FOR SHARE"),{code:"42501"},
    ));
    await expect(deliver(brokenBytes)).rejects.toMatchObject({
      code:"DASHBOARD_SESSION_PHOTO_UNAVAILABLE",
    });
  });

  it("maps persistent 120-view budget and in-memory concurrency to coded 429",async()=>{
    const count=vi.fn(async()=>({allowed:false as const,retryAfter:37}));
    const admission=new DashboardSessionPhotoAdmission({
      key:vi.fn(()=>({keyHash:"private",lockHigh:1,lockLow:1})),count,
    } as never);
    await expect(admission.admit(id.user)).rejects.toMatchObject({
      code:"DASHBOARD_SESSION_PHOTO_RATE_LIMITED",retryAfter:37,
    });
    try {await admission.admit(id.user);} catch(error){
      expect(mapApiError(error)).toEqual({
        code:"DASHBOARD_SESSION_PHOTO_RATE_LIMITED",
        message:"Too many photo requests. Try again later.",
        status:429,retryAfter:37,
      });
    }
    const bufferAdmission=new DashboardSessionPhotoAdmission({} as never);
    const releaseA=bufferAdmission.reserve(id.user);
    const releaseB=bufferAdmission.reserve(id.user);
    try {bufferAdmission.reserve(id.user);} catch(error){
      expect(mapApiError(error)).toMatchObject({
        code:"DASHBOARD_SESSION_PHOTO_RATE_LIMITED",status:429,
      });
    } finally {releaseA();releaseB();}
  });

  it("maps SQLSTATE23514 view-budget CHECK failure to sanitized anti-abuse 503, not 429",async()=>{
    const pool={
      connect:vi.fn(async()=>({
        query:vi.fn(async(sql:string)=>{
          if(sql==="BEGIN"||sql==="ROLLBACK") return {rows:[],rowCount:0};
          throw Object.assign(new Error("private constraint name"),{
            code:"23514",constraint:"anti_abuse_events_scope_check",
          });
        }),
        release:vi.fn(),
      })),
    };
    const abuse=new AntiAbuseService(pool as never,{
      derive:()=>({scope:"v1:dashboard-session-photo-view-user",keyHash:"dummy",lockHigh:1,lockLow:1}),
    } as never);
    const admission=new DashboardSessionPhotoAdmission(abuse);
    let thrown:unknown;
    try {await admission.admit(id.user);} catch(error){thrown=error;}
    expect(thrown).toBeInstanceOf(AntiAbuseUnavailableError);
    expect(mapApiError(thrown)).toEqual({
      code:"ANTI_ABUSE_UNAVAILABLE",
      status:503,
      message:"Service temporarily unavailable.",
    });
    expect(JSON.stringify(mapApiError(thrown))).not.toMatch(/23514|constraint|scope_check/i);
    expect(pool.connect).toHaveBeenCalledOnce();
  });

  it("preserves 401 expired session and 403 MFA-step-up across private photo DB boundaries",async()=>{
    for(const failure of [new UnauthorizedException("private auth context"),new MfaStepUpRequiredError()]){
      const code=failure instanceof UnauthorizedException
        ? "STAFF_AUTHENTICATION_REQUIRED":"MFA_STEP_UP_REQUIRED";
      const status=failure instanceof UnauthorizedException ? 401:403;
      for(const action of ["manifest","pre-byte","post-byte"] as const){
        const h=harness();
        if(action==="post-byte"){
          h.state.onRead=()=>h.authorize.mockRejectedValueOnce(failure);
        }else{
          h.authorize.mockRejectedValueOnce(failure);
        }
        const requestPromise=action==="manifest"
          ? listManagementSessionPhotos(h.deps,request)
          : deliver(h);
        let caught:unknown;
        try{await requestPromise;}catch(error){caught=error;}
        expect(caught).toBe(failure);
        expect(mapApiError(caught)).toMatchObject({code,status});
        expect(JSON.stringify(mapApiError(caught))).not.toMatch(/private auth context/i);
      }
    }
  });
});
