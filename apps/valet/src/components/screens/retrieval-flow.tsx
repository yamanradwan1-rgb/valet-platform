"use client";

import { useState, type JSX } from "react";

import type { RetrievalStep, Screen } from "../../types/employee-ui";
import {
  useRetrieval,
  type ActiveRetrievalSession,
} from "../../features/retrieval";
import {
  LiveRetrievalInProgressStep,
  LiveRetrievalKeyCheckoutStep,
  LiveRetrievalVehicleReadyStep,
} from "./retrieval/retrieval-live-steps";
import {
  RetrievalGuestVerifiedStep,
  RetrievalHandoffPinStep,
  RetrievalReleasedStep,
} from "./retrieval/retrieval-handoff-steps";
import {
  RetrievalInProgressStep,
  RetrievalKeyCheckoutStep,
  RetrievalTaskStep,
  RetrievalVehicleReadyStep,
} from "./retrieval/retrieval-task-steps";
import { BackHeader, Btn } from "../ui/employee-primitives";

export interface RetrievalFlowProps {
  readonly initialSession?: ActiveRetrievalSession | null | undefined;
  readonly membershipId?: string | null | undefined;
  readonly mode?: "live" | "prototype" | undefined;
  readonly nav: (s: Screen) => void;
  readonly onAuthorizationLoss?: (() => void) | undefined;
  readonly onComplete?: (() => void) | undefined;
  readonly sessionId?: string | null | undefined;
  readonly taskId?: string | null | undefined;
  readonly taskVersion?: number | null | undefined;
}

export function RetrievalFlow({
  nav,
  initialSession = null,
  membershipId = null,
  mode,
  sessionId = null,
  taskId = null,
  taskVersion = null,
  onAuthorizationLoss,
  onComplete,
}: RetrievalFlowProps): JSX.Element | null {
  const isLive = mode === "live" || Boolean(sessionId || initialSession);

  const retrieval = useRetrieval({
    initialSession,
    membershipId,
    onAuthorizationLoss,
    sessionId: isLive ? sessionId : null,
    taskId: isLive ? taskId : null,
    taskVersion: isLive ? taskVersion : null,
  });

  // Prototype state
  const [protoStep, setProtoStep] = useState<RetrievalStep>("task");
  const [taskAccepted, setTaskAccepted] = useState(false);
  const [keyState, setKeyState] = useState<"idle" | "correct" | "wrong">("idle");
  const [pin, setPin] = useState(["", "", "", ""]);
  const [pinError, setPinError] = useState(false);

  const handleDigit = (i: number, val: string) => {
    if (!/^\d*$/.test(val)) return;
    const next = [...pin];
    next[i] = val.slice(-1);
    setPin(next);
    setPinError(false);
  };

  const verifyPin = () => {
    if (pin.join("") === "4821") setProtoStep("guest-verified");
    else setPinError(true);
  };

  if (isLive) {
    const session = retrieval.activeSession;
    const vehicle = session?.vehicle;

    const vehicleHeading = vehicle
      ? `${vehicle.make ?? ""} ${vehicle.model ?? "Vehicle"}`.trim() || "Vehicle"
      : "Vehicle";

    const vehiclePlate =
      vehicle?.plateNumberRaw ??
      vehicle?.temporaryDescriptor ??
      "No Plate";

    const vehicleInfo = `${vehicleHeading} · ${vehiclePlate}`;
    const keyInfo = session?.expectedKeySlotCode ?? "Not assigned";
    const parkingLocation = session?.parkingZoneCode
      ? `Zone ${session.parkingZoneCode}${session.parkingSpotCode ? ` · Spot ${session.parkingSpotCode}` : ""}`
      : session?.parkingSpotCode
        ? `Spot ${session.parkingSpotCode}`
        : "Parking area";

    if (retrieval.isHydrating) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-6 space-y-4">
          <div className="w-8 h-8 border-4 border-vblue border-t-transparent rounded-full animate-spin" />
          <p className="text-navy font-semibold text-sm">
            Loading retrieval session details...
          </p>
        </div>
      );
    }

    if (retrieval.error && !session) {
      return (
        <div>
          <BackHeader title="Retrieval Operation" onBack={() => nav("task-queue")} />
          <div className="p-5 space-y-4">
            <div className="p-4 bg-red-50 border border-vdanger/20 rounded-xl text-vdanger text-sm">
              <p className="font-bold">Cannot resume retrieval flow</p>
              <p className="text-xs mt-1">{retrieval.error}</p>
            </div>
            <Btn label="Retry" onClick={() => void retrieval.retry()} />
            <Btn label="Back to Task Queue" variant="secondary" onClick={() => nav("task-queue")} />
          </div>
        </div>
      );
    }

    if (retrieval.step === "key-checkout" || retrieval.step === "task") {
      return (
        <LiveRetrievalKeyCheckoutStep
          expectedKey={session?.expectedKeySlotCode ?? null}
          isKeyConfirmed={session?.isKeyConfirmed ?? false}
          isSubmitting={retrieval.isSubmitting}
          error={retrieval.error}
          vehicleInfo={vehicleInfo}
          parkingLocation={parkingLocation}
          onConfirmKey={(code) => retrieval.confirmKey(code)}
          onStartRetrieval={async () => {
            await retrieval.startRetrieval();
          }}
          onBack={() => nav("task-queue")}
        />
      );
    }

    if (retrieval.step === "in-progress") {
      return (
        <LiveRetrievalInProgressStep
          vehicleHeading={vehicleHeading}
          vehicleInfo={vehicleInfo}
          keyInfo={keyInfo}
          parkingLocation={parkingLocation}
          retrievalStartedAt={session?.retrievalStartedAt ?? null}
          isSubmitting={retrieval.isSubmitting}
          error={retrieval.error}
          onMarkReady={async () => {
            await retrieval.markReady();
          }}
        />
      );
    }

    if (retrieval.step === "vehicle-ready") {
      return (
        <LiveRetrievalVehicleReadyStep
          vehicleInfo={vehicleInfo}
          keyInfo={keyInfo}
          parkingLocation={parkingLocation}
          onDone={() => {
            onComplete?.();
            nav("task-queue");
          }}
        />
      );
    }

    return null;
  }

  // Prototype mode
  if (protoStep === "task") {
    return (
      <RetrievalTaskStep
        taskAccepted={taskAccepted}
        onAcceptTask={() => setTaskAccepted(true)}
        onCheckOutKey={() => setProtoStep("key-checkout")}
        onBack={() => nav("task-queue")}
      />
    );
  }

  if (protoStep === "key-checkout") {
    return (
      <RetrievalKeyCheckoutStep
        keyState={keyState}
        onScanCorrect={() => setKeyState("correct")}
        onScanWrong={() => setKeyState("wrong")}
        onStartRetrieval={() => setProtoStep("in-progress")}
        onScanAgain={() => setKeyState("idle")}
        onBack={() => setProtoStep("task")}
      />
    );
  }

  if (protoStep === "in-progress") {
    return (
      <RetrievalInProgressStep
        onVehicleReady={() => setProtoStep("vehicle-ready")}
        onReportIssue={() => nav("incident")}
      />
    );
  }

  if (protoStep === "vehicle-ready") {
    return (
      <RetrievalVehicleReadyStep onVerifyGuest={() => setProtoStep("handoff-pin")} />
    );
  }

  if (protoStep === "handoff-pin") {
    return (
      <RetrievalHandoffPinStep
        pin={pin}
        pinError={pinError}
        onDigitChange={handleDigit}
        onVerify={verifyPin}
        onBack={() => setProtoStep("vehicle-ready")}
      />
    );
  }

  if (protoStep === "guest-verified") {
    return <RetrievalGuestVerifiedStep onRelease={() => setProtoStep("released")} />;
  }

  if (protoStep === "released") {
    return <RetrievalReleasedStep onNextTask={() => nav("task-queue")} />;
  }

  return null;
}
