import { useCallback, useState, useSyncExternalStore } from "react";
import { AppState, Linking, StyleSheet, Text, View } from "react-native";
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
import {
  employeeColors as c,
  employeeRadius,
  employeeSpacing as space,
} from "../employee-ui/employee-tokens";
import {
  employeeTextStyle,
  employeeTypography as type,
} from "../employee-ui/employee-typography";

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
  const opened = snapshot.phase !== "idle";
  const failed = snapshot.phase === "denied" || snapshot.phase === "error";
  const closeThen = (action: () => void) => {
    controller.close();
    action();
  };
  return (
    <>
      {opened ? (
        <View style={styles.viewport}>
          {mounted ? (
            <CameraView
              key={snapshot.generation}
              facing="back"
              mute
              style={styles.camera}
              accessible={false}
              onCameraReady={() => controller.ready(snapshot.generation)}
              onMountError={() => controller.fail(snapshot.generation)}
            />
          ) : null}
          {snapshot.phase !== "preview" ? (
            <CameraMessage
              message={camera.phases[snapshot.phase]}
              textAlign={textAlign}
            />
          ) : null}
        </View>
      ) : null}
      {snapshot.phase === "preview" ? (
        <CheckInStatus textAlign={textAlign}>
          {camera.phases.preview}
        </CheckInStatus>
      ) : null}
      {!opened ? (
        <>
          <CheckInButton
            label={camera.open}
            variant="primary"
            onPress={() => void controller.open()}
          />
          <CheckInButton
            label={copy.enterManually}
            variant="secondary"
            onPress={() => closeThen(onManual)}
          />
          <CheckInButton
            label={copy.noPlate}
            variant="ghost"
            onPress={() => closeThen(onNoPlate)}
          />
        </>
      ) : (
        <>
          {snapshot.phase === "preview" ? (
            <CheckInButton
              label={camera.enter}
              variant="primary"
              onPress={() => closeThen(onManual)}
            />
          ) : failed ? (
            <CheckInButton
              label={camera.retry}
              variant="primary"
              onPress={() => void controller.open()}
            />
          ) : null}
          {snapshot.phase !== "preview" ? (
            <CheckInButton
              label={copy.enterManually}
              variant="secondary"
              onPress={() => closeThen(onManual)}
            />
          ) : null}
          {snapshot.phase === "denied" && !snapshot.canAskAgain ? (
            <CheckInButton
              label={camera.settings}
              variant="secondary"
              onPress={() => {
                void Linking.openSettings().catch(() => undefined);
              }}
            />
          ) : null}
          <CheckInButton
            label={copy.noPlate}
            variant="ghost"
            onPress={() => closeThen(onNoPlate)}
          />
          <CheckInButton
            label={camera.close}
            variant="ghost"
            onPress={() => controller.close()}
          />
        </>
      )}
    </>
  );
}

function CameraMessage({
  message,
  textAlign,
}: {
  readonly message: string;
  readonly textAlign: NativeTextAlign;
}) {
  return (
    <View style={styles.messagePosition}>
      <Text
        accessibilityLiveRegion="polite"
        style={[
          styles.message,
          employeeTextStyle("human", textAlign, "center"),
        ]}
      >
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  camera: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  message: {
    ...type.label,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: employeeRadius.form,
    color: c.navy,
    maxWidth: 280,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    textAlign: "center",
  },
  messagePosition: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    padding: space.screen,
    position: "absolute",
    right: 0,
    top: 0,
  },
  viewport: {
    backgroundColor: c.navy2,
    borderRadius: employeeRadius.primary,
    height: 260,
    overflow: "hidden",
  },
});
