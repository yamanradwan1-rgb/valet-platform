"use client";

import { useState, type JSX } from "react";
import type {
  IncidentSeverity,
  IncidentType,
  StaffValetSessionDetailResponse,
} from "@valet/contracts";

import { Btn } from "../ui/employee-primitives";
import {
  INCIDENT_SEVERITIES,
  INCIDENT_TYPES,
} from "../../features/incidents/incident-controller";
import type { IncidentUiState } from "../../features/incidents/incident-controller";

export interface IncidentLiveFormProps {
  readonly detail: StaffValetSessionDetailResponse;
  readonly onSubmit: (input: {
    description: string;
    sessionId: string;
    severity: IncidentSeverity;
    type: IncidentType;
  }) => void;
  readonly state: IncidentUiState;
}

/**
 * Live reporting form rendered only after authoritative session/vehicle
 * context has been hydrated from the staff A1 read.
 */
export function IncidentLiveForm({
  detail,
  onSubmit,
  state,
}: IncidentLiveFormProps): JSX.Element {
  const [selected, setSelected] = useState<IncidentType | null>(null);
  const [severity, setSeverity] = useState<IncidentSeverity>("LOW");
  const [description, setDescription] = useState("");

  const v = detail.vehicle;
  const heading = `${v.make ?? ""} ${v.model ?? ""}`.trim();
  const identifier = v.plateNumberRaw ?? v.temporaryDescriptor ?? "";

  return (
    <div className="p-5 space-y-4">
      <div className="bg-white rounded-xl border border-vborder p-4">
        <p className="font-heading font-bold text-navy">
          {[heading, identifier].filter(Boolean).join(" · ")}
        </p>
        <p className="text-neutral text-xs mt-1">
          Session {detail.sessionId.slice(0, 8)}…
        </p>
      </div>

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

      {state.error !== null && (
        <div className="p-3 bg-red-50 border border-vdanger/20 rounded-xl text-vdanger text-xs">
          {state.error}
        </div>
      )}

      <Btn
        disabled={
          state.phase === "submitting" ||
          selected === null ||
          description.trim().length === 0
        }
        label={state.phase === "submitting" ? "Opening…" : "Open Incident"}
        variant="danger"
        onClick={() => {
          if (selected === null) return;
          onSubmit({
            description,
            sessionId: detail.sessionId,
            severity,
            type: selected,
          });
        }}
      />
    </div>
  );
}
