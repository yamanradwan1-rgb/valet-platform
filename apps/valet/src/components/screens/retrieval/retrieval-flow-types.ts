import type { StaffOperationalRole } from "@valet/contracts";

import type { ActiveRetrievalSession } from "../../../features/retrieval";
import type { Screen } from "../../../types/employee-ui";

export interface RetrievalFlowProps {
  readonly currentAssigneeMembershipId?: string | null | undefined;
  readonly initialSession?: ActiveRetrievalSession | null | undefined;
  readonly membershipId?: string | null | undefined;
  readonly mode?: "live" | "prototype" | undefined;
  readonly nav: (screen: Screen) => void;
  readonly onAuthorizationLoss?: (() => void) | undefined;
  readonly onComplete?: (() => void) | undefined;
  readonly onOpenIncident?: ((sessionId: string) => void) | undefined;
  readonly role?: StaffOperationalRole | null | undefined;
  readonly sessionId?: string | null | undefined;
  readonly taskId?: string | null | undefined;
  readonly taskStatus?: "ACCEPTED" | "IN_PROGRESS" | null | undefined;
  readonly taskVersion?: number | null | undefined;
}
