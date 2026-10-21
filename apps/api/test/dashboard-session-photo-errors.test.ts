import { describe, expect, it, vi } from "vitest";
import { NotFoundException, ServiceUnavailableException, HttpException, UnauthorizedException } from "@nestjs/common";
import { mapApiError } from "../src/common/http/api-errors";
import { ApiOperationRunner } from "../src/common/http/api-operation-runner";
import { AntiAbuseService, AntiAbuseUnavailableError } from "../src/modules/anti-abuse/anti-abuse.service";
import { MfaStepUpRequiredError } from "../src/modules/auth/mfa/mfa-errors";
import { listManagementSessionPhotos } from "../src/modules/dashboard/session-photo-service";
import { DashboardSessionPhotoAdmission } from "../src/modules/dashboard/session-photo-admission";
import { id, request, harness, deliver } from "./dashboard-session-photo-fixture";

describe("Issue309 protected photo HTTP status and error handling", () => {  it.each([
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
