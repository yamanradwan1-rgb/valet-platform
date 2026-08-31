"use client";

import { useEffect } from "react";

import { handleEmployeePushClientMessage } from "./employee-push-identity-bridge";

export function createEmployeePushTasksHandler(
  navigateToTasks: () => void,
  refreshCanonicalQueue: () => void,
): () => void {
  return () => {
    navigateToTasks();
    refreshCanonicalQueue();
  };
}

export function useEmployeePushClientMessages(
  onTasks: (identity: string) => void,
): void {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return undefined;
    const listener = (event: MessageEvent<unknown>): void => {
      handleEmployeePushClientMessage(event.data, onTasks);
    };
    navigator.serviceWorker.addEventListener("message", listener);
    return () =>
      navigator.serviceWorker.removeEventListener("message", listener);
  }, [onTasks]);
}
