"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { EmployeeApiClient } from "../../lib/api/employee-api-client";
import {
  getDefaultStaffAuthClient,
  useOptionalStaffAuth,
} from "../../lib/auth/staff-auth-context";
import { IncidentController } from "./incident-controller";
import type { IncidentUiState } from "./incident-controller";
import type {
  IncidentSeverity,
  IncidentType,
} from "@valet/contracts";

export interface UseIncidentOptions {
  readonly client?: EmployeeApiClient | undefined;
}

export interface UseIncidentResult {
  readonly state: IncidentUiState;
  readonly submit: (input: {
    description: string;
    sessionId: string;
    severity: IncidentSeverity;
    type: IncidentType;
  }) => Promise<boolean>;
  readonly reset: () => void;
}

export function useIncident(options: UseIncidentOptions = {}): UseIncidentResult {
  const auth = useOptionalStaffAuth();
  const authClient = auth?.client;

  const apiClient = useMemo(
    () =>
      options.client ??
      new EmployeeApiClient({
        authClient: authClient ?? getDefaultStaffAuthClient(),
      }),
    [options.client, authClient],
  );

  const [state, setState] = useState<IncidentUiState>({
    error: null,
    phase: "idle",
    report: null,
  });

  const [controller] = useState(
    () =>
      new IncidentController(apiClient, (next) => {
        setState(next);
      }),
  );

  useEffect(() => {
    controller.setApiClient(apiClient);
  }, [controller, apiClient]);

  const submit = useCallback<UseIncidentResult["submit"]>(
    async (input) => controller.submit(input),
    [controller],
  );

  const reset = useCallback(() => controller.reset(), [controller]);

  return { reset, state, submit };
}
