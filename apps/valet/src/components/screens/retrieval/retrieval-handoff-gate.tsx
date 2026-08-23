"use client";

import type { JSX } from "react";
import type { StaffOperationalRole } from "@valet/contracts";
import type { HandoffVerificationSnapshot } from "../../../features/handoff/handoff-types";

import type { UseHandoffResult } from "../../../features/handoff/use-handoff";
import type { ActiveRetrievalSession } from "../../../features/retrieval/retrieval-types";
import { useEmployeeI18n } from "../../shell/employee-i18n";
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
  readonly onOpenIncident?: ((sessionId: string) => void) | undefined;
  readonly onComplete: () => void;
  readonly onReturnToReady: () => void;
  readonly session: ActiveRetrievalSession;
}

/**
 * Routes the live post-READY handoff lifecycle. Every branch reflects the
 * authoritative HandoffController state, which only advances from backend
 * responses; abort returns to READY through an A1 re-hydration. Before the
 * lifecycle seeds (first render after A1 recovery), the hydrated session's
 * own handoff projection drives pending/verified rendering.
 */
export function RetrievalHandoffGate({
  canRelease,
  handoff,
  isSupervisor,
  onOpenIncident,
  onComplete,
  onReturnToReady,
  session,
}: RetrievalHandoffGateProps): JSX.Element {
  const { t } = useEmployeeI18n();
  const vehicle = session.vehicle;
  const vehicleHeading =
    `${vehicle.make ?? ""} ${vehicle.model ?? t.vehicle}`.trim() || t.vehicle;
  const vehiclePlate =
    vehicle?.plateNumberRaw ?? vehicle?.temporaryDescriptor ?? t.noPlateTitle;
  const vehicleInfo = `${vehicleHeading} · ${vehiclePlate}`;

  const openIncident =
    onOpenIncident !== undefined
      ? () => onOpenIncident(session.sessionId)
      : undefined;

  if (
    handoff.state.phase === "idle" &&
    session.state === "HANDOFF_PENDING"
  ) {
    // First render after A1 recovery, before the lifecycle seeds.
    const verification = session.handoff.verification;
    if (verification?.status === "VERIFIED") {
      return (
        <LiveHandoffVerifiedStep
          canRelease={canRelease}
          error={null}
          financialBlocked={false}
          isReleasing={false}
          onOpenIncident={openIncident}
          onRelease={() => void handoff.complete(session.sessionId)}
          verification={verification}
          vehicleInfo={vehicleInfo}
        />
      );
    }
    return (
      <LiveHandoffPendingStep
        abortError={null}
        error={null}
        isMutating={false}
        isSupervisor={isSupervisor}
        onAbort={(reason: string) => {
          void handoff.abort(session.sessionId, reason).then((done: boolean) => {
            if (done) onReturnToReady();
          });
        }}
        onOpenIncident={openIncident}
        onOverride={(reason: string) =>
          void handoff.override(session.sessionId, reason)
        }
        onVerifyPickupCode={(code: string) =>
          void handoff.verifyPickupCode(session.sessionId, code)
        }
        onVerifyQrPayload={(payload: string) =>
          void handoff.verifyDynamicQr(session.sessionId, payload)
        }
        retryAfterSeconds={null}
        vehicleInfo={vehicleInfo}
      />
    );
  }

  if (handoff.state.phase === "idle") {
    return (
      <LiveReadyHandoffLaunchStep
        error={handoff.state.error}
        isInitiating={false}
        keyInfo={session.expectedKeySlotCode ?? t.notAssigned}
        onBeginHandoff={() => {
          void handoff.initiate(session.sessionId, session.sessionVersion);
        }}
        onOpenIncident={openIncident}
        vehicleInfo={vehicleInfo}
      />
    );
  }

  if (handoff.state.phase === "initiating") {
    return (
      <LiveReadyHandoffLaunchStep
        error={null}
        isInitiating
        keyInfo={session.expectedKeySlotCode ?? t.notAssigned}
        onBeginHandoff={() => undefined}
        onOpenIncident={openIncident}
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
        onOpenIncident={openIncident}
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
      onOpenIncident={openIncident}
      onOverride={(reason: string) =>
        void handoff.override(session.sessionId, reason)
      }
      onVerifyPickupCode={(code: string) =>
        void handoff.verifyPickupCode(session.sessionId, code)
      }
      onVerifyQrPayload={(payload: string) =>
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

export type { HandoffVerificationSnapshot };
