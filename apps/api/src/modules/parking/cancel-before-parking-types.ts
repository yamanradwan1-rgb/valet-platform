import type { CancelBeforeParkingRequest } from "@valet/contracts";
import type { LockedTaskRow } from "../dispatch/dispatch-types";

export interface ParkingCancellationAuthorityInput {
  authenticatedUserId: string;
  sessionId: string;
  taskId: string;
  expectedShiftId: string;
}
export type ParkingCancellationCommandInput =
  ParkingCancellationAuthorityInput & CancelBeforeParkingRequest;
export interface ParkingCancellationSession {
  id: string;
  organization_id: string;
  location_id: string;
  checked_in_by_membership_id: string;
  state: string;
  version: number;
  updated_at: Date;
  no_custody: boolean;
  completed_intake: boolean;
}
export interface ParkingCancellationTarget {
  session: ParkingCancellationSession;
  task: LockedTaskRow;
  actorMembershipId: string;
}
