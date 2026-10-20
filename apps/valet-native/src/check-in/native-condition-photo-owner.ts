import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import {
  conditionPhotoScopeKey,
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
import { instrumentConditionPhotoUpload } from "./native-photo-upload-diagnostics";
import { getNativeTelemetry } from "../telemetry/native-telemetry-owner";

export function useNativeConditionPhotoOwner(
  auth: NativeAuthSession,
  scope: EmployeeOperationalScope,
  checkIn: EmployeeCheckInSnapshot,
) {
  const [files] = useState(() => new NativeConditionPhotoFiles());
  const [owner] = useState(() => {
    const diagnostics = instrumentConditionPhotoUpload(
      (onDispatch, onResponse) => createNativeConditionPhotoTransport(
        resolveNativeApiOrigin(), auth, files, onDispatch, onResponse,
      ),
      getNativeTelemetry().pinned,
    );
    const photo = new EmployeeConditionPhotoSession({
      createOperationId: diagnostics.createOperationId,
      captureReady: (handle) => {
        try { files.file(handle); return true; } catch { return false; }
      },
      discard: (handle) => files.discard(handle),
      transport: diagnostics.transport,
    });
    return { photo, cancelDiagnostics: diagnostics.cancel };
  });
  const { photo, cancelDiagnostics } = owner;
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
        cancelDiagnostics();
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
      cancelDiagnostics();
      photo.clear();
      void files.discardAll().catch(() => undefined);
    };
  }, [files, photo, cancelDiagnostics]);

  useEffect(() => {
    if (!cacheReady || checkIn.phase !== "created" || sessionId === undefined ||
      checkIn.identityGeneration === null || checkIn.locationId !== scope.locationId) {
      cancelDiagnostics();
      photo.clear();
      return;
    }
    const nextScope = {
      authGeneration, identityGeneration: checkIn.identityGeneration,
      membershipId: scope.membershipId, organizationId: scope.organizationId,
      locationId: scope.locationId, sessionId,
      workflowOwner: nativeCheckInWorkflowOwner(scope),
    };
    const previousScope = photo.current().scope;
    if (previousScope !== null &&
      conditionPhotoScopeKey(previousScope) !== conditionPhotoScopeKey(nextScope))
      cancelDiagnostics();
    void photo.activate(nextScope);
  }, [authGeneration, cacheReady, checkIn.identityGeneration, checkIn.locationId,
    checkIn.phase, photo, cancelDiagnostics, scope.locationId, scope.membershipId,
    scope.organizationId, sessionId, scope]);

  useFocusEffect(useCallback(() => {
    void photo.discover();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") photo.suspend();
      else void photo.discover();
    });
    return () => {
      subscription.remove();
      cancelDiagnostics();
      photo.suspend();
    };
  }, [photo, cancelDiagnostics]));

  return { files, photo, photoSnapshot: snapshot };
}
