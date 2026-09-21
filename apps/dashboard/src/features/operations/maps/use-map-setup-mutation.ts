"use client";

import { useState } from "react";

import { DashboardApiError } from "../../../lib/api/dashboard-api-error";

export type MapMutationNotice = "conflict" | "unknown" | "retry" | "error" | null;

export function useMapSetupMutation(reload: () => Promise<void>) {
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<MapMutationNotice>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(write: () => Promise<unknown>): Promise<boolean> {
    if (pending) return false;
    setPending(true);
    setNotice(null);
    setError(null);
    try {
      await write();
      await reload();
      return true;
    } catch (reason: unknown) {
      try { await reload(); } catch { /* Preserve the original write outcome. */ }
      if (reason instanceof DashboardApiError) {
        if (reason.kind === "conflict") setNotice("conflict");
        else if (reason.kind === "network") setNotice("unknown");
        else if (reason.code === "AUTH_RECONCILED_RETRY_REQUIRED") setNotice("retry");
        else setError(reason.message);
      } else {
        setNotice("unknown");
      }
      return false;
    } finally {
      setPending(false);
    }
  }

  return { error, notice, pending, run, setNotice };
}
