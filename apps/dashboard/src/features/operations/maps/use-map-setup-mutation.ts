"use client";

import { useEffect, useRef, useState } from "react";

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
type IsCurrent = () => boolean;

const staleExecution: MapMutationExecution = {
  closeEditor: false,
  error: null,
  notice: null,
};

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
  isCurrent: IsCurrent = () => true,
): Promise<MapMutationExecution> {
  try {
    await write();
    if (!isCurrent()) return staleExecution;
    const reloaded = await reload();
    if (!isCurrent()) return staleExecution;
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
    if (!isCurrent()) return staleExecution;
    const reloaded = await reload();
    if (!isCurrent()) return staleExecution;
    const classified = noticeFor(reason, reloaded.ok);
    return { closeEditor: true, ...classified };
  }
}

export function useMapSetupMutation(reload: Reload) {
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<MapMutationNotice>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      pendingRef.current = false;
    };
  }, []);

  async function run(write: () => Promise<unknown>): Promise<boolean> {
    if (pendingRef.current) return false;
    generationRef.current += 1;
    const generation = generationRef.current;
    const isCurrent = () =>
      mountedRef.current &&
      generationRef.current === generation;
    pendingRef.current = true;
    setPending(true);
    setNotice(null);
    setError(null);
    try {
      const result = await executeMapSetupMutation(write, reload, isCurrent);
      if (!isCurrent()) return false;
      setNotice(result.notice);
      setError(result.error);
      return result.closeEditor;
    } finally {
      if (isCurrent()) {
        pendingRef.current = false;
        setPending(false);
      }
    }
  }

  return { error, notice, pending, run };
}
