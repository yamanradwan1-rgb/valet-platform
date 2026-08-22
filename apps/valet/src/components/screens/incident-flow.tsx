"use client";

import { useState, type JSX } from "react";
import type {
  IncidentSeverity,
  IncidentType,
} from "@valet/contracts";

import type { Screen } from "../../types/employee-ui";
import { AlertIcon } from "../icons/employee-icons";
import {
  BackHeader,
  Btn,
  InfoRow,
  VehicleIdentity,
} from "../ui/employee-primitives";
import { useIncident } from "../../features/incidents/use-incident";
import {
  INCIDENT_SEVERITIES,
  INCIDENT_TYPES,
} from "../../features/incidents/incident-controller";

export interface IncidentFlowProps {
  readonly mode?: "live" | "prototype" | undefined;
  readonly nav: (s: Screen) => void;
  /** Authoritative operational context for the live report. */
  readonly returnScreen?: Screen | undefined;
  readonly sessionId?: string | null | undefined;
  readonly vehicleInfo?: string | null | undefined;
}

/**
 * Live mode submits through the canonical staff endpoint with a stable
 * client-generated incidentId per logical report. Prototype mode keeps the
 * demo flow (fake reference, Add Photo) exactly as before.
 */
export function IncidentFlow({
  mode,
  nav,
  returnScreen = "task-queue",
  sessionId = null,
  vehicleInfo = null,
}: IncidentFlowProps): JSX.Element | null {
  const isLive = mode === "live" || Boolean(sessionId);
  const incident = useIncident();

  // Prototype demo state (hooks stay unconditional across modes).
  const [protoStep, setProtoStep] = useState<"type" | "details" | "submitted">(
    "type",
  );
  const [protoType, setProtoType] = useState("");

  const [selected, setSelected] = useState<IncidentType | null>(null);
  const [severity, setSeverity] = useState<IncidentSeverity>("LOW");
  const [description, setDescription] = useState("");

  if (isLive) {
    if (incident.state.phase === "reported" && incident.state.report) {
      const report = incident.state.report;
      return (
        <div className="flex flex-col items-center justify-center min-h-[500px] p-6 space-y-6">
          <div className="w-20 h-20 bg-[#FFF0F0] rounded-full flex items-center justify-center">
            <AlertIcon />
          </div>
          <div className="text-center">
            <p className="font-heading font-bold text-2xl text-navy">
              Incident opened
            </p>
            <p className="text-neutral text-sm mt-1 break-all">
              Reference: {report.incidentId}
            </p>
          </div>
          <div className="w-full bg-white rounded-2xl border border-vborder divide-y divide-vborder">
            <InfoRow label="Type" value={report.type} />
            <InfoRow label="Severity" value={report.severity} />
            {vehicleInfo !== null && (
              <InfoRow label="Vehicle" value={vehicleInfo} />
            )}
          </div>
          <div className="w-full">
            <Btn label="Return" onClick={() => nav(returnScreen)} />
          </div>
        </div>
      );
    }

    return (
      <div>
        <BackHeader title="Report Incident" onBack={() => nav(returnScreen)} />
        <div className="p-5 space-y-4">
          <div className="bg-white rounded-xl border border-vborder p-4">`r`n            <p className="font-heading font-bold text-navy">{vehicleInfo}</p>`r`n          </div>

          <p className="text-navy font-semibold text-sm">Select type</p>
          <div className="grid grid-cols-2 gap-2">
            {INCIDENT_TYPES.map((type) => (
              <button
                key={type.value}
                onClick={() => setSelected(type.value)}
                className={`text-left px-3 py-2.5 rounded-xl border-2 text-xs font-semibold transition-all cursor-pointer leading-tight ${
                  selected === type.value
                    ? "border-vdanger bg-[#FFF0F0] text-vdanger"
                    : "border-vborder bg-white text-navy hover:bg-gray-50"
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>

          <p className="text-navy font-semibold text-sm">Severity</p>
          <div className="grid grid-cols-4 gap-2">
            {INCIDENT_SEVERITIES.map((sev) => (
              <button
                key={sev.value}
                onClick={() => setSeverity(sev.value)}
                className={`px-2 py-2 rounded-xl border-2 text-xs font-bold transition-all cursor-pointer ${
                  severity === sev.value
                    ? "border-vdanger bg-[#FFF0F0] text-vdanger"
                    : "border-vborder bg-white text-navy"
                }`}
              >
                {sev.label}
              </button>
            ))}
          </div>

          <textarea
            maxLength={500}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Briefly describe what happened..."
            rows={4}
            value={description}
            className="w-full border border-vborder rounded-xl px-4 py-3 text-navy text-sm focus:outline-none focus:border-vblue transition-colors resize-none bg-white"
          />

          {incident.state.error !== null && (
            <div className="p-3 bg-red-50 border border-vdanger/20 rounded-xl text-vdanger text-xs">
              {incident.state.error}
            </div>
          )}

          <Btn
            disabled={
              incident.state.phase === "submitting" ||
              selected === null ||
              description.trim().length === 0 ||
              sessionId === null
            }
            label={
              incident.state.phase === "submitting"
                ? "Opening…"
                : "Open Incident"
            }
            variant="danger"
            onClick={() => {
              if (sessionId === null || selected === null) return;
              void incident.submit({
                description,
                sessionId,
                severity,
                type: selected,
              });
            }}
          />

          {/* Live mode intentionally has NO photo upload: no accepted
              incident attachment capability exists yet. */}
        </div>
      </div>
    );
  }

  if (protoStep === "type") {
    return (
      <div>
        <BackHeader title="Report Incident" onBack={() => nav("task-queue")} />
        <div className="p-5 space-y-5">
          <div className="bg-white rounded-xl border border-vborder p-4">
            <VehicleIdentity />
          </div>
          <p className="text-navy font-semibold text-sm">Select incident type</p>
          <div className="grid grid-cols-2 gap-2">
            {INCIDENT_TYPES.map((type) => (
              <button
                key={type.value}
                onClick={() => setProtoType(type.label)}
                className={`text-left px-3 py-3 rounded-xl border-2 text-sm font-semibold transition-all cursor-pointer leading-tight ${
                  protoType === type.label
                    ? "border-vdanger bg-[#FFF0F0] text-vdanger"
                    : "border-vborder bg-white text-navy hover:bg-gray-50"
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>
          <Btn
            disabled={!protoType}
            label="Next"
            onClick={() => setProtoStep("details")}
          />
        </div>
      </div>
    );
  }

  if (protoStep === "details") {
    return (
      <div>
        <BackHeader title="Incident Details" onBack={() => setProtoStep("type")} />
        <div className="p-5 space-y-5">
          <div className="bg-[#FFF0F0] border border-vdanger/20 rounded-xl px-4 py-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-vdanger flex-shrink-0" />
            <span className="text-vdanger font-semibold text-sm">{protoType}</span>
          </div>
          <div className="bg-white rounded-xl border border-vborder p-4">
            <VehicleIdentity />
          </div>
          <textarea
            placeholder="Briefly describe what happened..."
            rows={4}
            className="w-full border border-vborder rounded-xl px-4 py-3 text-navy text-sm focus:outline-none focus:border-vblue transition-colors resize-none bg-white"
          />
          <button className="w-full h-11 border border-dashed border-vborder rounded-xl text-neutral text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer hover:bg-gray-50">
            Add Photo (optional)
          </button>
          <Btn
            label="Open Incident"
            variant="danger"
            onClick={() => setProtoStep("submitted")}
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
        <p className="font-heading font-bold text-2xl text-navy">
          Incident opened
        </p>
        <p className="text-neutral text-sm mt-1">Reference: INC-1042</p>
      </div>
      <div className="w-full bg-white rounded-2xl border border-vborder divide-y divide-vborder">
        <InfoRow label="Type" value={protoType} />
        <InfoRow label="Vehicle" value="BMW X5 · 12-34567" />
        <InfoRow label="Supervisor" value="Notified ✓" accent />
      </div>
      <div className="w-full">
        <Btn label="Return to Task" onClick={() => nav("task-queue")} />
      </div>
    </div>
  );
}
