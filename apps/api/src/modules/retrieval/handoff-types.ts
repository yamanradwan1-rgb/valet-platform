import type { HandoffStandardMethod } from "@valet/contracts";

export interface HandoffScope {
  readonly id: string;
  readonly location_id: string;
  readonly organization_id: string;
}

export interface LockedHandoffSession extends HandoffScope {
  readonly handoff_pending_at: Date | null;
  readonly ready_at: Date | null;
  readonly retrieval_requested_at: Date | null;
  readonly retrieval_started_at: Date | null;
  readonly state: string;
  readonly version: number;
}

export interface LockedHandoffTask {
  readonly current_assignee_membership_id: string | null;
  readonly id: string;
  readonly status: string;
  readonly version: number;
}

export interface LockedHandoffRequest {
  readonly id: string;
  readonly status: string;
}

export interface HandoffActor {
  readonly membershipId: string;
}

export interface LockedHandoffVerification {
  readonly attempt_count: number;
  readonly consumed_at: Date | null;
  readonly created_at: Date;
  readonly expires_at: Date | null;
  readonly id: string;
  readonly max_attempts: number;
  readonly method: "PICKUP_CODE" | "DYNAMIC_QR" | "SUPERVISOR_OVERRIDE";
  readonly secret_hash: string | null;
  readonly verified_at: Date | null;
}

export type HandoffPolicy = HandoffStandardMethod | "EITHER";

export interface StaffHandoffProjection {
  readonly sessionId: string;
  readonly sessionVersion: number;
  readonly state: "HANDOFF_PENDING" | "READY";
  readonly taskId: string;
  readonly taskStatus: "IN_PROGRESS";
  readonly taskVersion: number;
}

export type GuestHandoffMaterial =
  | {
      readonly expiresAt: string;
      readonly method: "PICKUP_CODE";
      readonly pickupCode: string;
      readonly state: "HANDOFF_PENDING";
      readonly valetSessionId: string;
    }
  | {
      readonly expiresAt: string;
      readonly method: "DYNAMIC_QR";
      readonly qrPayload: string;
      readonly state: "HANDOFF_PENDING";
      readonly valetSessionId: string;
    };
