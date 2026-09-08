import { useCallback, useState, useSyncExternalStore } from "react";
import { AppState, Linking, TextInput, View } from "react-native";
import { CameraView } from "expo-camera";
import { useFocusEffect } from "expo-router";
import type { NativeAuthSession } from "@valet/employee-client";

import { nativeIdentityState } from "../auth/identity-state-boundary";
import { EmployeeButton } from "../employee-ui/employee-controls";
import {
  EmployeeError,
  EmployeeStatus,
} from "../employee-ui/employee-feedback";
import type { FoundationLocale } from "../foundation/foundation-locale";
import {
  nativeCameraPermissions,
  nativeQrCameraSettings,
} from "../scanner/native-camera-adapter";
import { NativeQrController } from "../scanner/native-qr-controller";
import { getNativeQrCopy } from "../scanner/native-qr-copy";
import { bindNativeQrLifecycle } from "../scanner/native-qr-lifecycle";
import type { NativeHandoffCopy } from "./native-handoff-copy";
import { nativeHandoffStyles as s } from "./native-handoff-styles";

export function NativeHandoffScanner({
  auth,
  copy,
  disabled,
  locale,
  onCandidate,
  value,
  onChange,
}: {
  readonly auth: NativeAuthSession;
  readonly copy: NativeHandoffCopy;
  readonly disabled: boolean;
  readonly locale: FoundationLocale;
  readonly onCandidate: (proof: string) => void;
  readonly value: string;
  readonly onChange: (proof: string) => void;
}) {
  const [controller] = useState(
    () => new NativeQrController("dynamic-handoff", nativeCameraPermissions),
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.current,
  );
  const scannerCopy = getNativeQrCopy(locale);
  const cameraMounted =
    snapshot.phase === "starting" || snapshot.phase === "scanning";
  useFocusEffect(
    useCallback(
      () =>
        bindNativeQrLifecycle(controller, {
          appState: AppState,
          auth,
          identity: nativeIdentityState,
        }),
      [auth, controller],
    ),
  );
  return (
    <View style={s.section}>
      <TextInput
        accessibilityLabel={copy.manualQr}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!disabled}
        onChangeText={(candidate) => {
          controller.close();
          onChange(candidate);
        }}
        style={[s.input, s.ltr]}
        value={value}
      />
      <EmployeeStatus textAlign={locale === "ar" ? "right" : "left"}>
        {scannerCopy.phases[snapshot.phase]}
      </EmployeeStatus>
      {snapshot.rejection ? (
        <EmployeeError textAlign={locale === "ar" ? "right" : "left"}>
          {copy.invalidQr}
        </EmployeeError>
      ) : null}
      {cameraMounted ? (
        <CameraView
          key={snapshot.generation}
          {...nativeQrCameraSettings}
          accessible={false}
          onBarcodeScanned={(event) => {
            const input = controller.barcode(snapshot.generation, event);
            if (input?.kind === "dynamic-handoff") onCandidate(input.proof);
          }}
          onCameraReady={() => controller.ready(snapshot.generation)}
          onMountError={() => controller.fail(snapshot.generation)}
          style={s.camera}
        />
      ) : null}
      <EmployeeButton
        disabled={disabled || cameraMounted || snapshot.phase === "requesting"}
        label={copy.camera}
        onPress={() => void controller.open()}
        variant="secondary"
      />
      {cameraMounted ? (
        <EmployeeButton
          disabled={disabled}
          label={copy.closeCamera}
          onPress={() => controller.close()}
          variant="secondary"
        />
      ) : null}
      {snapshot.permission === "denied" && !snapshot.canAskAgain ? (
        <EmployeeButton
          disabled={disabled}
          label={copy.settings}
          onPress={() => void Linking.openSettings().catch(() => undefined)}
          variant="secondary"
        />
      ) : null}
    </View>
  );
}
