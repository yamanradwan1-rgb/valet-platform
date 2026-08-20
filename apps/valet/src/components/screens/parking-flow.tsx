import { useState, type JSX } from "react";

import type { ParkingStep, Screen } from "../../types/employee-ui";
import {
  BackHeader,
  Badge,
  Btn,
  ElapsedTimer,
  InfoRow,
  ScannerFrame,
  SuccessCircle,
  TrackingPill,
} from "../ui/employee-primitives";

export function ParkingFlow({
  nav,
}: {
  nav: (s: Screen) => void;
}): JSX.Element | null {
  const [step, setStep] = useState<ParkingStep>("in-progress");
  const [spotScanned, setSpotScanned] = useState(false);

  if (step === "in-progress") {
    return (
      <div>
        <div className="bg-white border-b border-vborder px-5 py-4 flex items-center justify-between">
          <div>
            <Badge variant="parking" />
            <p className="font-heading font-bold text-xl text-navy mt-2">
              Parking BMW X5
            </p>
          </div>
          <TrackingPill />
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-white rounded-2xl border border-vborder p-5 flex flex-col items-center gap-1">
            <p className="text-muted text-xs uppercase tracking-wider">
              Elapsed
            </p>
            <ElapsedTimer offsetSeconds={102} />
          </div>
          <div className="bg-white rounded-2xl border border-vborder divide-y divide-vborder">
            <InfoRow label="Vehicle" value="BMW X5 · 12-34567" />
            <InfoRow label="Key" value="B-214" />
            <InfoRow label="Destination" value="Zone B" />
          </div>
          <Btn label="Park Vehicle" onClick={() => setStep("spot-scan")} />
          <Btn
            label="Report Issue"
            variant="secondary"
            size="md"
            onClick={() => nav("incident")}
          />
        </div>
      </div>
    );
  }

  if (step === "spot-scan") {
    return (
      <div>
        <BackHeader
          title="Parking Spot"
          onBack={() => setStep("in-progress")}
        />
        {!spotScanned ? (
          <>
            <ScannerFrame
              label="Scan parking spot QR"
              sublabel="Or choose manually below"
            />
            <div className="p-5 space-y-3">
              <Btn
                label="Simulate Spot Scan"
                onClick={() => setSpotScanned(true)}
              />
              <Btn
                label="Choose manually"
                variant="secondary"
                onClick={() => setSpotScanned(true)}
              />
            </div>
          </>
        ) : (
          <div className="p-5 space-y-5">
            <div className="bg-[#EEFBF5] border border-vsuccess/20 rounded-2xl p-5 text-center">
              <p className="text-muted text-xs font-semibold uppercase tracking-wider mb-2">
                Confirmed location
              </p>
              <p className="font-heading font-bold text-3xl text-navy">
                Zone B
              </p>
              <p className="font-heading font-semibold text-lg text-neutral mt-1">
                Spot B-17
              </p>
            </div>
            <Btn
              label="Confirm Parking"
              onClick={() => setStep("success")}
              variant="success"
            />
            <Btn
              label="Scan again"
              variant="secondary"
              size="md"
              onClick={() => setSpotScanned(false)}
            />
          </div>
        )}
      </div>
    );
  }

  if (step === "success") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] p-6 space-y-6">
        <SuccessCircle />
        <div className="text-center">
          <p className="font-heading font-bold text-2xl text-navy">
            Vehicle parked
          </p>
          <p className="text-vsuccess text-sm font-semibold mt-1">
            Tracking stopped · Guest notified
          </p>
        </div>
        <div className="w-full bg-white rounded-2xl border border-vborder divide-y divide-vborder">
          <InfoRow label="Vehicle" value="BMW X5 · 12-34567" />
          <InfoRow label="Zone / Spot" value="Zone B · B-17" />
          <InfoRow label="Key" value="B-214" />
        </div>
        <div className="w-full">
          <Btn label="Done" onClick={() => nav("task-queue")} />
        </div>
      </div>
    );
  }

  return null;
}
