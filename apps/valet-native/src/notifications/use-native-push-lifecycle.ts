import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import type {
  EmployeeConnectivityStatus,
  EmployeeLocale,
  EmployeeOperationalSnapshot,
  NativeAuthSnapshot,
} from "@valet/employee-client";

import { nativeIdentityState } from "../auth/identity-state-boundary";
import type { NativeEmployeeRuntime } from "../auth/native-auth-runtime";
import { AndroidExpoNotificationAdapter } from "./android-expo-notification-adapter";
import {
  ExpoNativePushInstallationStore,
  NativePushInstallationIdOwner,
} from "./native-push-installation";
import { NativePushLifecycleOwner } from "./native-push-lifecycle";
import { NativePushHttpRegistrationTransport } from "./native-push-registration-transport";
import { emptyNativePushSnapshot } from "./native-push-types";

function isNetworkFailure(snapshot: EmployeeOperationalSnapshot): boolean {
  const failure = snapshot.queueFailure ?? snapshot.contextFailure;
  return (
    failure?.code === "NETWORK_ERROR" ||
    failure?.status === 408 ||
    (failure?.status !== undefined && failure.status >= 500)
  );
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
    const unsubscribe = owner.subscribe(setSnapshot);
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
      input.connectivity === "online" &&
      previousConnectivity.current !== "online"
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
