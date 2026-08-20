import { useState, type JSX } from "react";

import type { IncidentStep, Screen } from "../../types/employee-ui";
import { AlertIcon } from "../icons/employee-icons";
import {
  BackHeader,
  Btn,
  InfoRow,
  VehicleIdentity,
} from "../ui/employee-primitives";

const INCIDENT_TYPES = [
  "Vehicle damage",
  "Key missing",
  "Wrong key",
  "Key damaged",
  "Key locked inside",
  "Unauthorized exit",
  "Payment issue",
  "Customer complaint",
  "Employee safety",
  "System issue",
  "Other",
];

export function IncidentFlow({
  nav,
}: {
  nav: (s: Screen) => void;
}): JSX.Element | null {
  const [step, setStep] = useState<IncidentStep>("type");
  const [selected, setSelected] = useState("");
  const [description, setDescription] = useState("");

  if (step === "type") {
    return (
      <div>
        <BackHeader title="Report Incident" onBack={() => nav("task-queue")} />
        <div className="p-5 space-y-5">
          <div className="bg-white rounded-xl border border-vborder p-4">
            <VehicleIdentity />
          </div>
          <p className="text-navy font-semibold text-sm">
            Select incident type
          </p>
          <div className="grid grid-cols-2 gap-2">
            {INCIDENT_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => setSelected(type)}
                className={`text-left px-3 py-3 rounded-xl border-2 text-sm font-semibold transition-all cursor-pointer leading-tight ${
                  selected === type
                    ? "border-vdanger bg-[#FFF0F0] text-vdanger"
                    : "border-vborder bg-white text-navy hover:bg-gray-50"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
          <Btn
            label="Next"
            onClick={() => selected && setStep("details")}
            disabled={!selected}
          />
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
            <span className="text-vdanger font-semibold text-sm">
              {selected}
            </span>
          </div>
          <div className="bg-white rounded-xl border border-vborder p-4">
            <VehicleIdentity />
          </div>
          <div>
            <label className="text-navy font-semibold text-sm block mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Briefly describe what happened..."
              rows={4}
              className="w-full border border-vborder rounded-xl px-4 py-3 text-navy text-sm focus:outline-none focus:border-vblue transition-colors resize-none bg-white"
            />
          </div>
          <button className="w-full h-11 border border-dashed border-vborder rounded-xl text-neutral text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer hover:bg-gray-50">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect
                x="1"
                y="3"
                width="14"
                height="11"
                rx="1.5"
                stroke="#8C98AA"
                strokeWidth="1.25"
              />
              <circle
                cx="8"
                cy="8.5"
                r="2"
                stroke="#8C98AA"
                strokeWidth="1.25"
              />
            </svg>
            Add Photo (optional)
          </button>
          <Btn
            label="Open Incident"
            variant="danger"
            onClick={() => setStep("submitted")}
          />
        </div>
      </div>
    );
  }

  if (step === "submitted") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] p-6 space-y-6">
        <div className="w-20 h-20 bg-[#FFF0F0] rounded-full flex items-center justify-center">
          <AlertIcon />
        </div>
        <div className="text-center">
          <p className="font-heading font-bold text-2xl text-navy">
            Incident opened
          </p>
          <p className="text-neutral text-sm mt-1">Reference: INC-1042</p>
        </div>
        <div className="w-full bg-white rounded-2xl border border-vborder divide-y divide-vborder">
          <InfoRow label="Type" value={selected} />
          <InfoRow label="Vehicle" value="BMW X5 · 12-34567" />
          <InfoRow label="Supervisor" value="Notified ✓" accent />
        </div>
        <p className="text-muted text-xs text-center">
          Incidents cannot be deleted. Any corrections are recorded as new
          events.
        </p>
        <div className="w-full">
          <Btn label="Return to Task" onClick={() => nav("task-queue")} />
        </div>
      </div>
    );
  }

  return null;
}
