"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ExportFormat } from "@valet/contracts";

import type { StaffApiClient } from "../../lib/api/staff-api-client";

import { createReportExportController } from "./reports-export-controller";
import type {
  ReportExportController,
  ReportExportState,
} from "./reports-export-controller";
import type { ReportKind } from "@valet/contracts";

/**
 * Thin React binding for the framework-free export controller.
 *
 * Any identity change (location, kind or applied period) resets the status
 * synchronously through the controller; unmount disposes it so late
 * outcomes can never reach the UI (the download itself, if already
 * started, still saves honestly — see the controller contract).
 */
export function useReportExport(
  client: StaffApiClient,
  identity: {
    readonly kind: ReportKind;
    readonly locationId: string;
    readonly periodValue: string;
  },
): {
  readonly state: ReportExportState;
  startExport: (format: ExportFormat) => void;
} {
  const [state, setState] = useState<ReportExportState>({
    error: null,
    format: null,
    phase: "idle",
  });
  const clientRef = useRef(client);
  useEffect(() => {
    clientRef.current = client;
  }, [client]);

  const controllerRef = useRef<ReportExportController | null>(null);

  // Primitive identity inputs keep the effect honest without object churn.
  const locationId = identity.locationId;
  const kind = identity.kind;
  const periodValue = identity.periodValue;

  useEffect(() => {
    const controller = createReportExportController({
      client: clientRef.current,
      onState: setState,
    });
    controllerRef.current = controller;
    controller.setIdentity({ kind, locationId, periodValue });
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, [kind, locationId, periodValue]);

  const startExport = useCallback((format: ExportFormat): void => {
    controllerRef.current?.startExport(format);
  }, []);

  return { startExport, state };
}
