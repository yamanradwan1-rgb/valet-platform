import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import {
  EmployeeConditionPhotoSession,
  type EmployeeCheckInSnapshot,
  type EmployeeOperationalScope,
  type NativeAuthSession,
} from "@valet/employee-client";
import { resolveNativeApiOrigin } from "../auth/native-api-http";
import { nativeIdentityState } from "../auth/identity-state-boundary";
import { nativeCheckInWorkflowOwner } from "./native-check-in-ownership";
import { NativeConditionPhotoFiles } from "./native-condition-photo-files";
import { createNativeConditionPhotoTransport } from "./native-condition-photo-transport";

function newOperationId() {
  if (typeof globalThis.crypto?.randomUUID === "function")
    return globalThis.crypto.randomUUID();
  throw new Error("CONDITION_PHOTO_RANDOM_UNAVAILABLE");
}

export function useNativeConditionPhotoOwner(
  auth: NativeAuthSession,
  scope: EmployeeOperationalScope,
  checkIn: EmployeeCheckInSnapshot,
) {
  const [files] = useState(() => new NativeConditionPhotoFiles());
  const [photo] = useState(() => new EmployeeConditionPhotoSession({
    createOperationId: newOperationId,
    captureReady: (handle) => {
      try { files.file(handle); return true; } catch { return false; }
    },
    discard: (handle) => files.discard(handle),
    transport: createNativeConditionPhotoTransport(resolveNativeApiOrigin(), auth, files),
  }));
  const snapshot = useSyncExternalStore(photo.subscribe, photo.current);
  const authGeneration = auth.current().authGeneration;
  const sessionId = checkIn.active?.sessionId;
  const [cacheReady, setCacheReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    void Promise.resolve().then(() => files.purgeStartup()).then(() => {
      if (mounted) setCacheReady(true);
    }).catch(() => {
      if (mounted) {
        setCacheReady(false);
        photo.clear();
      }
    });
    const unregister = nativeIdentityState.register(() => {
      setCacheReady(false);
      photo.clear();
      return files.discardAll().then(() => {
        files.purgeStartup();
        setCacheReady(true);
      });
    });
    return () => {
      mounted = false;
      unregister();
      photo.clear();
      void files.discardAll().catch(() => undefined);
    };
  }, [files, photo]);

  useEffect(() => {
    if (!cacheReady || checkIn.phase !== "created" || sessionId === undefined ||
      checkIn.identityGeneration === null || checkIn.locationId !== scope.locationId) {
      photo.clear();
      return;
    }
    void photo.activate({
      authGeneration, identityGeneration: checkIn.identityGeneration,
      membershipId: scope.membershipId, organizationId: scope.organizationId,
      locationId: scope.locationId, sessionId,
      workflowOwner: nativeCheckInWorkflowOwner(scope),
    });
  }, [authGeneration, cacheReady, checkIn.identityGeneration, checkIn.locationId,
    checkIn.phase, photo, scope.locationId, scope.membershipId,
    scope.organizationId, sessionId, scope]);

  useFocusEffect(useCallback(() => {
    void photo.discover();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") photo.suspend();
      else void photo.discover();
    });
    return () => {
      subscription.remove();
      photo.suspend();
    };
  }, [photo]));

  return { files, photo, photoSnapshot: snapshot };
}
