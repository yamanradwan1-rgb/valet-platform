import { useCallback, useState, useSyncExternalStore } from "react";
import { AppState, Linking } from "react-native";
import { CameraView } from "expo-camera";
import { useFocusEffect } from "expo-router";
import type {
  EmployeeCheckInSession,
  NativeAuthSession,
} from "@valet/employee-client";

import { nativeIdentityState } from "../auth/identity-state-boundary";
import { nativeCameraPermissions } from "../scanner/native-camera-adapter";
import { NativePlateCameraController } from "./native-plate-camera-controller";
import { bindNativePlateCameraLifecycle } from "./native-plate-camera-lifecycle";
import { getNativePlateCameraCopy } from "./native-plate-camera-copy";
import type { NativeCheckInCopy } from "./native-check-in-copy";
import {
  CheckInButton,
  CheckInStatus,
  type NativeTextAlign,
} from "./native-check-in-primitives";

export function NativePlateCameraStep({
  auth,
  session,
  copy,
  onManual,
  onNoPlate,
  textAlign,
}: {
  readonly auth: NativeAuthSession;
  readonly session: EmployeeCheckInSession;
  readonly copy: NativeCheckInCopy;
  readonly onManual: () => void;
  readonly onNoPlate: () => void;
  readonly textAlign: NativeTextAlign;
}) {
  const [controller] = useState(
    () => new NativePlateCameraController(nativeCameraPermissions),
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.current,
  );
  const camera = getNativePlateCameraCopy(textAlign);
  useFocusEffect(
    useCallback(
      () =>
        bindNativePlateCameraLifecycle(controller, session, {
          auth,
          identity: nativeIdentityState,
          appState: AppState,
        }),
      [auth, controller, session],
    ),
  );
  const mounted = snapshot.phase === "starting" || snapshot.phase === "preview";
  const busy = mounted || snapshot.phase === "requesting";
  const closeThen = (action: () => void) => {
    controller.close();
    action();
  };
  return (
    <>
      <CheckInStatus textAlign={textAlign}>
        {camera.phases[snapshot.phase]}
      </CheckInStatus>
      {mounted ? (
        <CameraView
          key={snapshot.generation}
          facing="back"
          mute
          style={{ height: 260, borderRadius: 16, overflow: "hidden" }}
          accessible={false}
          onCameraReady={() => controller.ready(snapshot.generation)}
          onMountError={() => controller.fail(snapshot.generation)}
        />
      ) : null}
      {snapshot.phase === "preview" ? (
        <CheckInButton
          label={camera.enter}
          onPress={() => closeThen(onManual)}
        />
      ) : (
        <CheckInButton
          label={camera.open}
          disabled={busy}
          onPress={() => void controller.open()}
        />
      )}
      <CheckInButton
        label={copy.enterPlate}
        secondary
        onPress={() => closeThen(onManual)}
      />
      <CheckInButton
        label={copy.noPlate}
        secondary
        onPress={() => closeThen(onNoPlate)}
      />
      {snapshot.phase === "denied" && !snapshot.canAskAgain ? (
        <CheckInButton
          label={camera.settings}
          secondary
          onPress={() => {
            void Linking.openSettings().catch(() => undefined);
          }}
        />
      ) : null}
      {snapshot.phase !== "idle" ? (
        <CheckInButton
          label={camera.close}
          secondary
          onPress={() => controller.close()}
        />
      ) : null}
    </>
  );
}
