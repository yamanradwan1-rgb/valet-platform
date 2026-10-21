import { describe, expect, it, vi } from "vitest";
import {
  listManagementSessionPhotos,
  deliverManagementSessionPhotoBytes,
} from "../src/modules/dashboard/session-photo-service";
import { unchangedVerifiedPhoto } from "../src/modules/dashboard/session-photo-query";
import { DashboardSessionPhotoAdmission } from "../src/modules/dashboard/session-photo-admission";
import { id, bytes, candidate, request, harness, deliver } from "./dashboard-session-photo-fixture";
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
    expect(h.authorize).toHaveBeenCalledTimes(3);
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

  it("enqueues only after COMMIT, retaining admission until HTTP finish/close",async()=>{
    const h=harness();
    let releaseOnFinish: (()=>void) | undefined;
    await deliverManagementSessionPhotoBytes(h.deps,request,id.photo,(_body,release)=>{
      expect(h.state.activeTransactions).toBe(1);
      expect(h.state.queryLog).toContain("COMMIT");
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

});
