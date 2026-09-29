import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  AppState,
  Linking,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { CameraView } from "expo-camera";
import { useFocusEffect } from "expo-router";
import type {
  NativeAuthSession,
  QrResourceKind,
  QrResourcePayload,
} from "@valet/employee-client";

import { nativeIdentityState } from "../auth/identity-state-boundary";
import { EmployeeButton } from "../employee-ui/employee-controls";
import type { EmployeeButtonVariant } from "../employee-ui/employee-controls";
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
  autoOpen = false,
  disabled,
  kind,
  label,
  labelStyle,
  locale,
  manualInput = true,
  manualHint,
  onChange,
  onResourceScan,
  openHeight,
  openLabel,
  openRadius,
  openVariant = "secondary",
  closeLabel,
  placeholder,
  inputStyle,
  scannerFirst = false,
  scannerContentStyle,
  hideIdleStatus = false,
  value,
}: {
  readonly auth: NativeAuthSession;
  readonly autoOpen?: boolean | undefined;
  readonly disabled: boolean;
  readonly kind: QrResourceKind;
  readonly label: string;
  readonly labelStyle?: StyleProp<TextStyle> | undefined;
  readonly locale: FoundationLocale;
  readonly manualInput?: boolean | undefined;
  readonly manualHint?: string | undefined;
  readonly onChange: (value: string) => void;
  readonly onResourceScan?: ((value: QrResourcePayload) => void) | undefined;
  readonly openHeight?: number | undefined;
  readonly openLabel?: string | undefined;
  readonly openRadius?: number | undefined;
  readonly openVariant?: EmployeeButtonVariant | undefined;
  readonly closeLabel?: string | undefined;
  readonly placeholder?: string | undefined;
  readonly inputStyle?: StyleProp<TextStyle> | undefined;
  readonly scannerFirst?: boolean | undefined;
  readonly scannerContentStyle?: StyleProp<ViewStyle> | undefined;
  readonly hideIdleStatus?: boolean | undefined;
  readonly value: string;
}) {
  const [controller] = useState(
    () => new NativeQrController(kind, nativeCameraPermissions),
  );
  const disabledRef = useRef(disabled);
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.current,
  );
  const copy = getNativeQrCopy(locale);
  const textAlign = locale === "ar" ? "right" : "left";
  const cameraMounted =
    snapshot.phase === "starting" || snapshot.phase === "scanning";
  const cameraBusy = cameraMounted || snapshot.phase === "requesting";
  const manualField = manualInput ? (
    <>
      <Text style={[employeeTextStyle("human", textAlign), labelStyle]}>
        {label}
      </Text>
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
        placeholder={placeholder}
        style={[s.input, inputStyle]}
        value={value}
      />
    </>
  ) : null;

  useEffect(() => {
    disabledRef.current = disabled;
    if (disabled) controller.setEligible(false);
  }, [controller, disabled]);
  useFocusEffect(
    useCallback(() => {
      const dispose = bindNativeQrLifecycle(controller, {
        appState: AppState,
        auth,
        identity: nativeIdentityState,
      });
      if (autoOpen && !disabledRef.current) void controller.open();
      return dispose;
    }, [auth, autoOpen, controller]),
  );

  return (
    <View style={{ gap: 12 }}>
      {scannerFirst ? null : manualField}
      <View style={[{ gap: 12 }, scannerContentStyle]}>
        {snapshot.phase !== "idle" || !hideIdleStatus ? (
          <EmployeeStatus textAlign={textAlign}>
            {copy.phases[snapshot.phase]}
          </EmployeeStatus>
        ) : null}
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
              const input = controller.barcode(snapshot.generation, event);
              const accepted = controller.current();
              if (before !== "accepted" && accepted.phase === "accepted") {
                if (
                  input !== null &&
                  input.kind !== "dynamic-handoff" &&
                  onResourceScan !== undefined
                ) {
                  onResourceScan(input);
                } else {
                  onChange(accepted.resourceCode);
                }
              }
            }}
            onCameraReady={() => controller.ready(snapshot.generation)}
            onMountError={() => controller.fail(snapshot.generation)}
            style={{ height: 220 }}
          />
        ) : null}
        <EmployeeButton
          disabled={disabled || cameraBusy}
          height={openHeight}
          label={
            snapshot.phase === "accepted"
              ? copy.again
              : (openLabel ?? copy.open)
          }
          onPress={() => void controller.open()}
          radius={openRadius}
          size="standard"
          variant={openVariant}
        />
        {cameraMounted ? (
          <EmployeeButton
            disabled={disabled}
            label={closeLabel ?? copy.close}
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
        {manualHint ? (
          <EmployeeStatus textAlign={textAlign}>{manualHint}</EmployeeStatus>
        ) : null}
      </View>
      {scannerFirst ? manualField : null}
    </View>
  );
}
