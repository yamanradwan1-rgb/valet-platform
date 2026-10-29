"use client";

import { useEffect, useState } from "react";
import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { readEmergencyTakeoverContext } from "./emergency-takeover-api";

/** A missing, stale or denied authoritative context never grants action visibility. */
export function useEmergencyActionEligibility(input: {
  readonly api: DashboardApiClient;
  readonly taskId: string;
  readonly updatedAt: string;
  readonly scopeKey: string;
  readonly enabled: boolean;
}) {
  const key = input.enabled
    ? [input.scopeKey, input.taskId, input.updatedAt].join(":")
    : "";
  const [result, setResult] = useState({ key: "", allowed: false });
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    let active = true;
    void readEmergencyTakeoverContext(input.api, input.taskId, controller.signal)
      .then((context) => {
        if (active) {
          // W3's server-owned proposition includes Task, Session, RetrievalRequest
          // and actor eligibility. No client-invented state matrix is used here.
          setResult({
            key,
            allowed: "canInitiate" in context && context.canInitiate === true,
          });
        }
      })
      .catch(() => {
        if (active) setResult({ key, allowed: false });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [input.api, input.taskId, key]);
  return key !== "" && result.key === key && result.allowed;
}
