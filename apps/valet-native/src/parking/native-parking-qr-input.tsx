import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { AppState, Linking, Text, TextInput, View } from "react-native";
import { CameraView } from "expo-camera";
import { useFocusEffect } from "expo-router";
import type { NativeAuthSession, QrResourceKind } from "@valet/employee-client";

import { nativeIdentityState } from "../auth/identity-state-boundary";
import { EmployeeButton } from "../employee-ui/employee-controls";
import {
  EmployeeError,
  EmployeeStatus,
} from "../employee-ui/employee-feedback";
import { employeeTextStyle } from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
import {
  nativeCameraPermissions,
  nativeQrCameraSettings,
} from "../scanner/native-camera-adapter";
import { NativeQrController } from "../scanner/native-qr-controller";
import { getNativeQrCopy } from "../scanner/native-qr-copy";
import { bindNativeQrLifecycle } from "../scanner/native-qr-lifecycle";
import { nativeParkingConfirmStyles as s } from "./native-parking-confirm-styles";

export function NativeParkingQrInput({
  auth,
  disabled,
  kind,
  label,
  locale,
  manualInput = true,
  onChange,
  value,
}: {
  readonly auth: NativeAuthSession;
  readonly disabled: boolean;
  readonly kind: QrResourceKind;
  readonly label: string;
  readonly locale: FoundationLocale;
  readonly manualInput?: boolean | undefined;
  readonly onChange: (value: string) => void;
  readonly value: string;
}) {
  const [controller] = useState(
    () => new NativeQrController(kind, nativeCameraPermissions),
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.current,
  );
  const copy = getNativeQrCopy(locale);
  const textAlign = locale === "ar" ? "right" : "left";
  const cameraMounted =
    snapshot.phase === "starting" || snapshot.phase === "scanning";
  const cameraBusy = cameraMounted || snapshot.phase === "requesting";

  useEffect(() => {
    if (disabled) controller.setEligible(false);
  }, [controller, disabled]);
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
    <View style={{ gap: 12 }}>
      <Text style={employeeTextStyle("human", textAlign)}>{label}</Text>
      {manualInput ? (
        <TextInput
          accessibilityLabel={label}
          accessibilityLiveRegion="polite"
          accessibilityState={{ disabled }}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!disabled}
          onChangeText={(candidate) => {
            controller.manual(candidate);
            onChange(candidate);
          }}
          style={s.input}
          value={value}
        />
      ) : null}
      <EmployeeStatus textAlign={textAlign}>
        {copy.phases[snapshot.phase]}
      </EmployeeStatus>
      {snapshot.rejection !== null ? (
        <EmployeeError textAlign={textAlign}>{copy.invalid}</EmployeeError>
      ) : null}
      {cameraMounted ? (
        <CameraView
          key={snapshot.generation}
          {...nativeQrCameraSettings}
          accessible={false}
          onBarcodeScanned={(event) => {
            const before = controller.current().phase;
            controller.barcode(snapshot.generation, event);
            const accepted = controller.current();
            if (before !== "accepted" && accepted.phase === "accepted")
              onChange(accepted.resourceCode);
          }}
          onCameraReady={() => controller.ready(snapshot.generation)}
          onMountError={() => controller.fail(snapshot.generation)}
          style={{ height: 220 }}
        />
      ) : null}
      <EmployeeButton
        disabled={disabled || cameraBusy}
        label={snapshot.phase === "accepted" ? copy.again : copy.open}
        onPress={() => void controller.open()}
        variant="secondary"
      />
      {cameraMounted ? (
        <EmployeeButton
          disabled={disabled}
          label={copy.close}
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
