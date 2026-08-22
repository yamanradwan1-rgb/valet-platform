"use client";

import type { JSX } from "react";
import type { StaffOperationalRole } from "@valet/contracts";

import type { UseHandoffResult } from "../../../features/handoff/use-handoff";
import type { ActiveRetrievalSession } from "../../../features/retrieval/retrieval-types";
import {
  LiveReadyHandoffLaunchStep,
  LiveHandoffPendingStep,
} from "./retrieval-handoff-live-steps";
import {
  LiveHandoffCompletedStep,
  LiveHandoffVerifiedStep,
} from "./retrieval-handoff-live-release-steps";

export interface RetrievalHandoffGateProps {
  readonly canRelease: boolean;
  readonly handoff: UseHandoffResult;
  readonly isSupervisor: boolean;
  readonly onComplete: () => void;
  readonly onReturnToReady: () => void;
  readonly session: ActiveRetrievalSession;
}

/**
 * Routes the live post-READY handoff lifecycle. Every branch reflects the
 * authoritative HandoffController state, which only advances from backend
 * responses; abort returns to READY through an A1 re-hydration.
 */
export function RetrievalHandoffGate({
  canRelease,
  handoff,
  isSupervisor,
  onComplete,
  onReturnToReady,
  session,
}: RetrievalHandoffGateProps): JSX.Element {
  const vehicle = session.vehicle;
  const vehicleHeading =
    `${vehicle.make ?? ""} ${vehicle.model ?? "Vehicle"}`.trim() || "Vehicle";
  const vehiclePlate =
    vehicle?.plateNumberRaw ?? vehicle?.temporaryDescriptor ?? "No Plate";
  const vehicleInfo = `${vehicleHeading} · ${vehiclePlate}`;

  if (handoff.state.phase === "idle") {
    return (
      <LiveReadyHandoffLaunchStep
        error={handoff.state.error}
        isInitiating={false}
        keyInfo={session.expectedKeySlotCode ?? "Not assigned"}
        onBeginHandoff={() => {
          void handoff.initiate(session.sessionId, session.sessionVersion);
        }}
        vehicleInfo={vehicleInfo}
      />
    );
  }

  if (handoff.state.phase === "initiating") {
    return (
      <LiveReadyHandoffLaunchStep
        error={null}
        isInitiating
        keyInfo={session.expectedKeySlotCode ?? "Not assigned"}
        onBeginHandoff={() => undefined}
        vehicleInfo={vehicleInfo}
      />
    );
  }

  if (handoff.state.phase === "completed") {
    return (
      <LiveHandoffCompletedStep
        onDone={onComplete}
        vehicleInfo={vehicleInfo}
      />
    );
  }

  if (handoff.state.verification?.status === "VERIFIED") {
    const financialBlocked =
      handoff.state.errorMeta.code === "FINANCIAL_RELEASE_NOT_SATISFIED";
    return (
      <LiveHandoffVerifiedStep
        canRelease={canRelease}
        error={financialBlocked ? null : handoff.state.error}
        financialBlocked={financialBlocked}
        isReleasing={handoff.state.phase === "releasing"}
        onRelease={() => void handoff.complete(session.sessionId)}
        verification={handoff.state.verification}
        vehicleInfo={vehicleInfo}
      />
    );
  }

  return (
    <LiveHandoffPendingStep
      abortError={null}
      error={handoff.state.error}
      isMutating={
        handoff.state.phase === "verifying" ||
        handoff.state.phase === "aborting"
      }
      isSupervisor={isSupervisor}
      onAbort={(reason: string) => {
        void handoff.abort(session.sessionId, reason).then((done: boolean) => {
          if (done) onReturnToReady();
        });
      }}
      onOverride={(reason) => void handoff.override(session.sessionId, reason)}
      onVerifyPickupCode={(code) =>
        void handoff.verifyPickupCode(session.sessionId, code)
      }
      onVerifyQrPayload={(payload) =>
        void handoff.verifyDynamicQr(session.sessionId, payload)
      }
      retryAfterSeconds={handoff.state.errorMeta.retryAfterSeconds}
      vehicleInfo={vehicleInfo}
    />
  );
}

export function supervisorCanOverride(
  role: StaffOperationalRole | null | undefined,
): boolean {
  return role === "VALET_SUPERVISOR";
}
