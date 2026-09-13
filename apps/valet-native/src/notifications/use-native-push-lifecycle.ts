import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import type {
  EmployeeConnectivityStatus,
  EmployeeLocale,
  EmployeeOperationalSnapshot,
  NativeAuthSnapshot,
} from "@valet/employee-client";
import { shouldAttemptEmployeeConnectivityRecovery } from "@valet/employee-client";

import { nativeIdentityState } from "../auth/identity-state-boundary";
import type { NativeEmployeeRuntime } from "../auth/native-auth-runtime";
import { getNativeTelemetry } from "../telemetry/native-telemetry-owner";
import { AndroidExpoNotificationAdapter } from "./android-expo-notification-adapter";
import {
  ExpoNativePushInstallationStore,
  NativePushInstallationIdOwner,
} from "./native-push-installation";
import { NativePushLifecycleOwner } from "./native-push-lifecycle";
import { NativePushHttpRegistrationTransport } from "./native-push-registration-transport";
import { emptyNativePushSnapshot, type NativePushSnapshot } from "./native-push-types";

function isNetworkFailure(snapshot: EmployeeOperationalSnapshot): boolean {
  const failure = snapshot.queueFailure ?? snapshot.contextFailure;
  return (
    failure?.code === "NETWORK_ERROR" ||
    failure?.status === 408 ||
    (failure?.status !== undefined && failure.status >= 500)
  );
}

/**
 * Production telemetry for push snapshot TRANSITIONS (closed vocabulary).
 * Called only when a monitored field actually changes; the payload is the
 * snapshot's own bounded enums — never a provider token or intent id.
 */
function recordPushTelemetry(
  previous: NativePushSnapshot | undefined,
  next: NativePushSnapshot,
): void {
  const telemetry = getNativeTelemetry();
  const record = (classification: string, outcome: "error" | "success") =>
    telemetry.record({
      classification,
      outcome,
      source: "push",
    });
  if (
    previous === undefined ||
    previous.registration !== next.registration
  ) {
    if (next.registration === "confirmed") record("registration-confirmed", "success");
    else if (
      next.registration === "unavailable" ||
      next.registration === "unconfirmed"
    )
      record("registration-unavailable", "error");
  }
  if (previous === undefined || previous.permission !== next.permission) {
    if (next.permission === "denied" || next.permission === "blocked")
      record("permission-denied", "error");
  }
  if (previous === undefined || previous.channelAvailable !== next.channelAvailable) {
    if (next.channelAvailable === false) record("channel-unavailable", "error");
  }
}

function createOwner(runtime: NativeEmployeeRuntime) {
  return new NativePushLifecycleOwner(
    new AndroidExpoNotificationAdapter(),
    new NativePushInstallationIdOwner(new ExpoNativePushInstallationStore()),
    new NativePushHttpRegistrationTransport(runtime.apiOrigin, runtime.auth),
  );
}

export function useNativePushLifecycle(input: {
  readonly auth: NativeAuthSnapshot;
  readonly connectivity: EmployeeConnectivityStatus;
  readonly locale: EmployeeLocale;
  readonly operations: EmployeeOperationalSnapshot;
  readonly runtime: NativeEmployeeRuntime | undefined;
}) {
  const [owner] = useState(() =>
    input.runtime === undefined ? undefined : createOwner(input.runtime),
  );
  const [snapshot, setSnapshot] = useState(
    owner?.current() ?? emptyNativePushSnapshot(),
  );
  const hadNetworkFailure = useRef(false);
  const previousConnectivity = useRef<EmployeeConnectivityStatus>("unknown");

  useEffect(() => {
    if (owner === undefined) return;
    let previous: NativePushSnapshot | undefined;
    const unsubscribe = owner.subscribe((snapshot) => {
      setSnapshot(snapshot);
      recordPushTelemetry(previous, snapshot);
      previous = snapshot;
    });
    const unregisterPurge = nativeIdentityState.register(() =>
      owner.purgeIdentity(),
    );
    owner.start();
    return () => {
      unregisterPurge();
      unsubscribe();
      owner.dispose();
    };
  }, [owner]);

  useEffect(() => {
    void owner?.setLocale(input.locale);
  }, [input.locale, owner]);
  useEffect(() => {
    void owner?.setAuth(input.auth);
  }, [input.auth, owner]);

  useEffect(() => {
    if (owner === undefined) return;
    void owner.setForeground(AppState.currentState === "active");
    const subscription = AppState.addEventListener("change", (state) => {
      void owner.setForeground(state === "active");
    });
    return () => subscription.remove();
  }, [owner]);

  useEffect(() => {
    const failed = isNetworkFailure(input.operations);
    if (!failed && hadNetworkFailure.current) void owner?.networkRecovered();
    hadNetworkFailure.current = failed;
  }, [input.operations, owner]);

  useEffect(() => {
    if (
      shouldAttemptEmployeeConnectivityRecovery(
        previousConnectivity.current,
        input.connectivity,
      )
    ) {
      void owner?.networkRecovered();
    }
    previousConnectivity.current = input.connectivity;
  }, [input.connectivity, owner]);

  return {
    dismissAttention: (intentId: string) => owner?.dismissAttention(intentId),
    requestPermission: () => owner?.requestPermission() ?? Promise.resolve(),
    snapshot,
  } as const;
}
