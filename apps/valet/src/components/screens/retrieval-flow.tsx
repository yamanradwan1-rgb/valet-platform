import { useState, type JSX } from "react";

import type { RetrievalStep, Screen } from "../../types/employee-ui";
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

export function RetrievalFlow({
  nav,
}: {
  nav: (s: Screen) => void;
}): JSX.Element | null {
  const [step, setStep] = useState<RetrievalStep>("task");
  const [taskAccepted, setTaskAccepted] = useState(false);
  const [keyState, setKeyState] = useState<"idle" | "correct" | "wrong">(
    "idle",
  );
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
    if (pin.join("") === "4821") setStep("guest-verified");
    else setPinError(true);
  };

  if (step === "task") {
    return (
      <RetrievalTaskStep
        taskAccepted={taskAccepted}
        onAcceptTask={() => setTaskAccepted(true)}
        onCheckOutKey={() => setStep("key-checkout")}
        onBack={() => nav("task-queue")}
      />
    );
  }

  if (step === "key-checkout") {
    return (
      <RetrievalKeyCheckoutStep
        keyState={keyState}
        onScanCorrect={() => setKeyState("correct")}
        onScanWrong={() => setKeyState("wrong")}
        onStartRetrieval={() => setStep("in-progress")}
        onScanAgain={() => setKeyState("idle")}
        onBack={() => setStep("task")}
      />
    );
  }

  if (step === "in-progress") {
    return (
      <RetrievalInProgressStep
        onVehicleReady={() => setStep("vehicle-ready")}
        onReportIssue={() => nav("incident")}
      />
    );
  }

  if (step === "vehicle-ready") {
    return (
      <RetrievalVehicleReadyStep onVerifyGuest={() => setStep("handoff-pin")} />
    );
  }

  if (step === "handoff-pin") {
    return (
      <RetrievalHandoffPinStep
        pin={pin}
        pinError={pinError}
        onDigitChange={handleDigit}
        onVerify={verifyPin}
        onBack={() => setStep("vehicle-ready")}
      />
    );
  }

  if (step === "guest-verified") {
    return <RetrievalGuestVerifiedStep onRelease={() => setStep("released")} />;
  }

  if (step === "released") {
    return <RetrievalReleasedStep onNextTask={() => nav("task-queue")} />;
  }

  return null;
}
