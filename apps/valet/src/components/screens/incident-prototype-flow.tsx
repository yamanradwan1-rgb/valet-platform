"use client";

import { useState, type JSX } from "react";

import { INCIDENT_TYPES } from "../../features/incidents/incident-controller";
import type { Screen } from "../../types/employee-ui";
import { AlertIcon } from "../icons/employee-icons";
import { BackHeader, Btn, InfoRow, VehicleIdentity } from "../ui/employee-primitives";

interface IncidentPrototypeFlowProps {
  readonly nav: (screen: Screen) => void;
}

export function IncidentPrototypeFlow({
  nav,
}: IncidentPrototypeFlowProps): JSX.Element {
  const [step, setStep] = useState<"type" | "details" | "submitted">("type");
  const [type, setType] = useState("");

  if (step === "type") {
    return (
      <div>
        <BackHeader title="Report Incident" onBack={() => nav("task-queue")} />
        <div className="p-5 space-y-5">
          <div className="bg-white rounded-xl border border-vborder p-4">
            <VehicleIdentity />
          </div>
          <p className="text-navy font-semibold text-sm">Select incident type</p>
          <div className="grid grid-cols-2 gap-2">
            {INCIDENT_TYPES.map((option) => (
              <button
                key={option.value}
                className={`text-left px-3 py-3 rounded-xl border-2 text-sm font-semibold transition-all cursor-pointer leading-tight ${
                  type === option.label
                    ? "border-vdanger bg-[#FFF0F0] text-vdanger"
                    : "border-vborder bg-white text-navy hover:bg-gray-50"
                }`}
                onClick={() => setType(option.label)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <Btn disabled={!type} label="Next" onClick={() => setStep("details")} />
        </div>
      </div>
    );
  }

  if (step === "details") {
    return (
      <div>
        <BackHeader title="Incident Details" onBack={() => setStep("type")} />
        <div className="p-5 space-y-5">
          <div className="bg-[#FFF0F0] border border-vdanger/20 rounded-xl px-4 py-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-vdanger flex-shrink-0" />
            <span className="text-vdanger font-semibold text-sm">{type}</span>
          </div>
          <div className="bg-white rounded-xl border border-vborder p-4">
            <VehicleIdentity />
          </div>
          <textarea
            className="w-full border border-vborder rounded-xl px-4 py-3 text-navy text-sm focus:outline-none focus:border-vblue transition-colors resize-none bg-white"
            placeholder="Briefly describe what happened..."
            rows={4}
          />
          <button className="w-full h-11 border border-dashed border-vborder rounded-xl text-neutral text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer hover:bg-gray-50">
            Add Photo (optional)
          </button>
          <Btn
            label="Open Incident"
            onClick={() => setStep("submitted")}
            variant="danger"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[500px] p-6 space-y-6">
      <div className="w-20 h-20 bg-[#FFF0F0] rounded-full flex items-center justify-center">
        <AlertIcon />
      </div>
      <div className="text-center">
        <p className="font-heading font-bold text-2xl text-navy">Incident opened</p>
        <p className="text-neutral text-sm mt-1">Reference: INC-1042</p>
      </div>
      <div className="w-full bg-white rounded-2xl border border-vborder divide-y divide-vborder">
        <InfoRow label="Type" value={type} />
        <InfoRow label="Vehicle" value="BMW X5 · 12-34567" />
        <InfoRow label="Supervisor" value="Notified ✓" accent />
      </div>
      <div className="w-full">
        <Btn label="Return to Task" onClick={() => nav("task-queue")} />
      </div>
    </div>
  );
}
