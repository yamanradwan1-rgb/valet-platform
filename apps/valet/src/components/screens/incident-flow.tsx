"use client";

import { useCallback, useEffect, useState, type JSX } from "react";
import type { StaffValetSessionDetailResponse } from "@valet/contracts";

import type { Screen } from "../../types/employee-ui";
import { AlertIcon } from "../icons/employee-icons";
import { BackHeader, Btn, InfoRow } from "../ui/employee-primitives";
import { INCIDENT_TYPES } from "../../features/incidents/incident-controller";
import { IncidentLiveForm } from "./incident-live-form";
import { useIncident } from "../../features/incidents/use-incident";
import { fetchSessionDetail } from "../../features/retrieval/retrieval-api";
import type { EmployeeApiClient } from "../../lib/api/employee-api-client";

export interface IncidentFlowProps {
  readonly apiClient?: EmployeeApiClient | undefined;
  readonly mode?: "live" | "prototype" | undefined;
  readonly nav: (s: Screen) => void;
  /** Authoritative operational context for the live report. */
  readonly returnScreen?: Screen | undefined;
  readonly sessionId?: string | null | undefined;
}

type ContextState = "loading" | "ready" | "error";

function vehicleLine(detail: StaffValetSessionDetailResponse): string {
  const v = detail.vehicle;
  const heading = `${v.make ?? ""} ${v.model ?? ""}`.trim();
  const identifier = v.plateNumberRaw ?? v.temporaryDescriptor ?? "";
  return [heading || null, identifier || null]
    .filter((part): part is string => part !== null && part !== "")
    .join(" · ");
}

/**
 * Live mode submits through the canonical staff endpoint with a stable
 * client-generated incidentId per logical report, against an AUTHORITATIVE
 * session/vehicle context hydrated from the staff A1 read. Prototype mode
 * keeps the demo flow (fake reference, Add Photo) exactly as before.
 */
export function IncidentFlow({
  apiClient,
  mode,
  nav,
  returnScreen = "task-queue",
  sessionId = null,
}: IncidentFlowProps): JSX.Element | null {
  const isLive = mode === "live" || Boolean(sessionId);
  const incident = useIncident();

  // Prototype demo state (hooks stay unconditional across modes).
  const [protoStep, setProtoStep] = useState<"type" | "details" | "submitted">(
    "type",
  );
  const [protoType, setProtoType] = useState("");

  const [contextState, setContextState] =
    useState<ContextState>("loading");
  const [detail, setDetail] =
    useState<StaffValetSessionDetailResponse | null>(null);

  const loadContext = useCallback(async () => {
    if (sessionId === null) {
      setContextState("error");
      return;
    }    try {
      const res = await fetchSessionDetail(
        apiClient as EmployeeApiClient,
        sessionId,
      );
      if (res.state === "COMPLETED" || res.state === "HANDOFF_PENDING") {
        // Context must reflect a live operational custody state; terminal or
        // post-release states are not valid reporting subjects here.
        setDetail(res);
        setContextState("error");
        return;
      }
      setDetail(res);
      setContextState("ready");
    } catch {
      setDetail(null);
      setContextState("error");
    }
  }, [apiClient, sessionId]);

  useEffect(() => {
    if (!isLive) return;
    let active = true;
    queueMicrotask(() => {
      if (active) void loadContext();
    });
    return () => {
      active = false;
    };
  }, [isLive, loadContext]);

  if (isLive) {
    if (contextState === "loading") {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-6 space-y-4">
          <div className="w-8 h-8 border-4 border-vblue border-t-transparent rounded-full animate-spin" />
          <p className="text-navy font-semibold text-sm">
            Loading session context…
          </p>
        </div>
      );
    }

    if (contextState === "error") {
      return (
        <div>
          <BackHeader title="Report Incident" onBack={() => nav(returnScreen)} />
          <div className="p-5 space-y-4">
            <div className="p-4 bg-red-50 border border-vdanger/20 rounded-xl text-vdanger text-sm">
              <p className="font-bold">Cannot establish session context</p>
              <p className="text-xs mt-1">
                The authoritative vehicle/session context could not be loaded.
              </p>
            </div>
            <Btn
              label="Retry"
              onClick={() => {
                setContextState("loading");
                void loadContext();
              }}
            />
            <Btn
              label="Back"
              variant="secondary"
              onClick={() => nav(returnScreen)}
            />
          </div>
        </div>
      );
    }

    // detail === null && !error → initial loading.
    if (detail === null) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-6 space-y-4">
          <div className="w-8 h-8 border-4 border-vblue border-t-transparent rounded-full animate-spin" />
          <p className="text-navy font-semibold text-sm">
            Loading session context…
          </p>
        </div>
      );
    }

    const liveVehicleInfo = vehicleLine(detail);

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
            <InfoRow label="Vehicle" value={liveVehicleInfo} />
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
          <div className="bg-white rounded-xl border border-vborder p-4">
            <p className="font-heading font-bold text-navy">{liveVehicleInfo}</p>
            <p className="text-neutral text-xs mt-1">Session {detail.sessionId.slice(0, 8)}…</p>
          </div>
          <IncidentLiveForm
            detail={detail}
            onSubmit={(input) =>
              incident.submit({ ...input, sessionId: detail.sessionId })
            }
            state={incident.state}
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