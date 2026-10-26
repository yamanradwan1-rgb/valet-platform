import { vi, type Mock } from "vitest";
import type {
  EndShiftResponse,
  StaffOperationalContextResponse,
} from "@valet/contracts";
import type { EmployeeShiftEndTransport } from "./employee-shift-end-types";
import { EmployeeShiftEndSession } from "./employee-shift-end-session";
import { presenceFixture } from "./employee-shift-presence-test-fixture";
import { shiftEndContext } from "./employee-shift-end-test-fixture";
import type {
  PresenceDescriptor,
  PresenceRecovery,
} from "./employee-shift-presence-types";

type EndRecoveryFixture = ReturnType<typeof presenceFixture> & {
  parent: EmployeeShiftEndSession;
  context: StaffOperationalContextResponse;
  loadOperationalContext: Mock<() => Promise<StaffOperationalContextResponse>>;
  onEnded: Mock<(result: EndShiftResponse) => void>;
  legacyEnd: Mock<EmployeeShiftEndTransport["endShift"]>;
  loseResponse: () => Promise<PresenceDescriptor>;
  denied: () => Extract<PresenceRecovery, { state: "RECOVERABLE" }>;
};

export function endRecoveryFixture(
  mode: "OFF" | "REQUIRE_OR_OVERRIDE" = "OFF",
): EndRecoveryFixture {
  const s = presenceFixture(mode, "END");
  const context = shiftEndContext({
    shiftId: s.target.shiftId!,
    membershipId: s.target.membershipId,
    organizationId: s.target.organizationId,
    locationId: s.target.locationId,
  });
  context.contexts[0]!.activeShift!.startedAt = s.result.startedAt;
  const loadOperationalContext = vi.fn(async () => context);
  const onEnded = vi.fn<(result: EndShiftResponse) => void>();
  const legacyEnd = vi.fn<EmployeeShiftEndTransport["endShift"]>();
  const parent = new EmployeeShiftEndSession({
    presence: s.session,
    loadOperationalContext,
    onEnded,
    transport: { endShift: legacyEnd },
  });
  parent.activate(1);
  parent.observeOperationalContext(1, context);
  parent.setCashInput("1.000");
  async function loseResponse() {
    s.transport.submit.mockRejectedValueOnce(s.fail());
    parent.requestConfirmation();
    await parent.endShift();
    return s.session.descriptor()!;
  }
  const denied = () => ({
    ...s.committed(),
    status: "DENIED" as const,
    shiftId: null,
    result: null,
    denialReason: "PRESENCE_REJECTED" as const,
    summary: {
      classification: "CONFIDENT_OUTSIDE" as const,
      reason: "OUTSIDE" as const,
    },
  });
  return {
    ...s,
    parent,
    context,
    loadOperationalContext,
    onEnded,
    legacyEnd,
    loseResponse,
    denied,
  };
}
