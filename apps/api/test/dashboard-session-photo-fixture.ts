import { createHash } from "node:crypto";
import { expect, vi } from "vitest";
import type { PostgresPool } from "../src/common/database/postgres";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import type { SelectedConditionPhotoCandidate } from "../src/modules/valet-sessions/condition-photo-qualified-receipt";
import {
  deliverManagementSessionPhotoBytes,
  type SessionPhotoReadDependencies,
} from "../src/modules/dashboard/session-photo-service";
export const id = {
  user: "00000000-0000-4000-8000-000000000001",
  organization: "00000000-0000-4000-8000-000000000002",
  location: "00000000-0000-4000-8000-000000000003",
  membership: "00000000-0000-4000-8000-000000000004",
  session: "00000000-0000-4000-8000-000000000005",
  photo: "00000000-0000-4000-8000-000000000006",
  operation: "00000000-0000-4000-8000-000000000007",
  attempt: "00000000-0000-4000-8000-000000000008",
} as const;
export const bytes = Buffer.from([255,216,255,224,7,8,9,10,255,217]);
const sha256 = createHash("sha256").update(bytes).digest();
const credential: StaffSessionContext = {
  userId:id.user,staffAuthSessionId:id.session,accessTokenHash:"test-hash",createdAt:new Date("2026-10-21"),
};
const scope = {organizationId:id.organization,locationId:id.location,membershipId:id.membership};
export const request = {authenticatedUserId:id.user,credential,locationId:id.location,sessionId:id.session};

export function candidate(overrides: Partial<SelectedConditionPhotoCandidate> = {}): SelectedConditionPhotoCandidate {
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

export function harness(overrides: Partial<State> = {}) {
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
        if(sql.includes("SELECT public.condition_photo_lock_management_evidence(")){
          expect(args).toHaveLength(12);
          expect(args).toEqual([
            id.photo,id.organization,id.location,id.session,
            id.operation,id.attempt,id.membership,candidate().objectKey,
            expect.any(Buffer),bytes.length,"private","version-1",
          ]);
          expect((args?.[8] as Buffer).equals(sha256)).toBe(true);
          return {rows:[{qualifies:true}],rowCount:1};
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

export async function deliver(h: ReturnType<typeof harness>,photoId:string=id.photo) {
  let delivered: Buffer | undefined;
  await deliverManagementSessionPhotoBytes(h.deps,request,photoId,(buffer,release)=>{
    expect(h.state.activeTransactions).toBe(1);
    delivered=Buffer.from(buffer);
    release();
  });
  return delivered;
}
