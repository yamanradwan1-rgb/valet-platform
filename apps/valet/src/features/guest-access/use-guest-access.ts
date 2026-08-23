"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { EmployeeApiClient } from "../../lib/api/employee-api-client";
import {
  getDefaultStaffAuthClient,
  useOptionalStaffAuth,
} from "../../lib/auth/staff-auth-context";
import { GuestAccessController } from "./guest-access-controller";
import {
  initialGuestAccessView,
  type GuestAccessView,
} from "./guest-access-types";

export interface UseGuestAccessOptions {
  readonly client?: EmployeeApiClient | undefined;
  readonly onAuthorizationLoss?: (() => void) | undefined;
  readonly sessionId: string | null;
}

/**
 * Thin React binding over the Guest Access controller. The transient
 * shareable URL lives only in this mounted controller/hook state and is
 * discarded on unmount, identity change, revoke, or authoritative loss.
 */
export function useGuestAccess(options: UseGuestAccessOptions): {
  readonly view: GuestAccessView;
  readonly create: () => Promise<void>;
  readonly load: () => Promise<void>;
  readonly revoke: () => Promise<void>;
} {
  const { client: customClient, onAuthorizationLoss, sessionId } = options;
  const auth = useOptionalStaffAuth();
  const authClient = auth?.client;

  const apiClient = useMemo(
    () =>
      customClient ??
      new EmployeeApiClient({
        authClient: authClient ?? getDefaultStaffAuthClient(),
        onAuthorizationLoss,
      }),
    [customClient, authClient, onAuthorizationLoss],
  );

  const [view, setView] = useState<GuestAccessView>(initialGuestAccessView);
  const [controller] = useState(
    () => new GuestAccessController((next) => setView(next)),
  );

  useEffect(() => {
    controller.setApiClient(apiClient);
  }, [controller, apiClient]);

  useEffect(() => {
    if (sessionId !== null) {
      // A different session target must never inherit a prior session's
      // transient shareable URL.
      controller.discardTransientCredential();
      void controller.load(sessionId);
    }
  }, [controller, sessionId]);

  const create = useCallback(async () => {
    if (sessionId !== null) await controller.create(sessionId);
  }, [controller, sessionId]);

  const revoke = useCallback(async () => {
    if (sessionId !== null) await controller.revoke(sessionId);
  }, [controller, sessionId]);

  const load = useCallback(async () => {
    if (sessionId !== null) await controller.load(sessionId);
  }, [controller, sessionId]);

  return { create, load, revoke, view };
}
