"use client";

import { useRef, useState } from "react";

import { DashboardApiError } from "../../../lib/api/dashboard-api-error";
import type { MapSetupReloadResult } from "./use-map-setup-state";

export type MapMutationNotice =
  | "saved_refresh_failed"
  | "conflict_reloaded"
  | "conflict_reload_failed"
  | "unknown_reloaded"
  | "unknown_reload_failed"
  | "retry_reloaded"
  | "retry_reload_failed"
  | null;

export interface MapMutationExecution {
  readonly closeEditor: boolean;
  readonly error: string | null;
  readonly notice: MapMutationNotice;
}

type Reload = () => Promise<MapSetupReloadResult>;

function noticeFor(
  reason: unknown,
  reloaded: boolean,
): Pick<MapMutationExecution, "error" | "notice"> {
  if (reason instanceof DashboardApiError) {
    if (reason.code === "AUTH_RECONCILED_RETRY_REQUIRED") {
      return { error: null, notice: reloaded ? "retry_reloaded" : "retry_reload_failed" };
    }
    if (reason.kind === "conflict") {
      return { error: null, notice: reloaded ? "conflict_reloaded" : "conflict_reload_failed" };
    }
    if (reason.kind === "network") {
      return { error: null, notice: reloaded ? "unknown_reloaded" : "unknown_reload_failed" };
    }
    return { error: reason.message, notice: null };
  }
  return { error: null, notice: reloaded ? "unknown_reloaded" : "unknown_reload_failed" };
}

export async function executeMapSetupMutation(
  write: () => Promise<unknown>,
  reload: Reload,
): Promise<MapMutationExecution> {
  try {
    await write();
    const reloaded = await reload();
    return reloaded.ok
      ? { closeEditor: true, error: null, notice: null }
      : { closeEditor: true, error: null, notice: "saved_refresh_failed" };
  } catch (reason: unknown) {
    if (reason instanceof DashboardApiError &&
      reason.kind !== "conflict" &&
      reason.kind !== "network" &&
      reason.code !== "AUTH_RECONCILED_RETRY_REQUIRED") {
      return { closeEditor: false, error: reason.message, notice: null };
    }
    const reloaded = await reload();
    const classified = noticeFor(reason, reloaded.ok);
    return { closeEditor: false, ...classified };
  }
}

export function useMapSetupMutation(reload: Reload) {
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<MapMutationNotice>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(write: () => Promise<unknown>): Promise<boolean> {
    if (pendingRef.current) return false;
    pendingRef.current = true;
    setPending(true);
    setNotice(null);
    setError(null);
    try {
      const result = await executeMapSetupMutation(write, reload);
      setNotice(result.notice);
      setError(result.error);
      return result.closeEditor;
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return { error, notice, pending, run };
}
