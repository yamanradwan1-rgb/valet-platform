import { useCallback, useState, useSyncExternalStore } from "react";
import {
  AppState,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { CameraView } from "expo-camera";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import type {
  EmployeeLocale,
  NativeAuthSession,
  QrResourceKind,
} from "@valet/employee-client";

import { nativeIdentityState } from "../auth/identity-state-boundary";
import { styles } from "../foundation/foundation-styles";
import {
  nativeCameraPermissions,
  nativeQrCameraSettings,
} from "./native-camera-adapter";
import { NativeQrController } from "./native-qr-controller";
import { bindNativeQrLifecycle } from "./native-qr-lifecycle";
import { getNativeQrCopy } from "./native-qr-copy";

interface PanelProps {
  readonly locale: EmployeeLocale;
  readonly auth: NativeAuthSession;
}

export function NativeQrPanel({ locale, auth }: PanelProps) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<QrResourceKind>("key-slot");
  const copy = getNativeQrCopy(locale);
  useFocusEffect(useCallback(() => () => setOpen(false), []));
  return (
    <>
      <ScanButton label={copy.title} onPress={() => setOpen(true)} />
      {open ? (
        <ScanWorkflow
          key={kind}
          auth={auth}
          locale={locale}
          kind={kind}
          onKind={setKind}
          onExit={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function ScanWorkflow({
  auth,
  locale,
  kind,
  onKind,
  onExit,
}: PanelProps & {
  readonly kind: QrResourceKind;
  readonly onKind: (kind: QrResourceKind) => void;
  readonly onExit: () => void;
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
  const mounted =
    snapshot.phase === "starting" || snapshot.phase === "scanning";
  const busy = mounted || snapshot.phase === "requesting";
  const generation = snapshot.generation;

  useFocusEffect(
    useCallback(
      () =>
        bindNativeQrLifecycle(controller, {
          auth,
          identity: nativeIdentityState,
          appState: AppState,
        }),
      [auth, controller],
    ),
  );

  const exit = () => {
    controller.clear();
    onExit();
  };
  return (
    <Modal onRequestClose={exit} animationType="slide">
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={{
            padding: 20,
            gap: 14,
            direction: locale === "ar" ? "rtl" : "ltr",
          }}
          keyboardShouldPersistTaps="handled"
        >
          <Text
            accessibilityRole="header"
            style={[styles.taskHeading, { textAlign }]}
          >
            {copy.title}
          </Text>
          <Text style={[styles.taskStatus, { textAlign }]}>
            {copy.disclaimer}
          </Text>
          <ScanButton label={copy.exit} onPress={exit} />
          <View accessibilityRole="tablist" style={{ gap: 8 }}>
            {(["key-slot", "parking-spot"] as const).map((option) => (
              <ScanButton
                key={option}
                label={copy.kinds[option]}
                selected={option === kind}
                onPress={() => {
                  controller.clear();
                  onKind(option);
                }}
              />
            ))}
          </View>
          <Text style={[styles.taskStatus, { textAlign }]}>{copy.manual}</Text>
          <TextInput
            accessibilityLabel={copy.manual}
            value={snapshot.resourceCode}
            onChangeText={(value) => controller.manual(value)}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={120}
            style={[
              styles.input,
              { writingDirection: "ltr", textAlign: "left" },
            ]}
          />
          <Text style={[styles.taskStatus, { textAlign }]}>
            {copy.manualHint}
          </Text>
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.taskStatus, { textAlign }]}
          >
            {copy.phases[snapshot.phase]}
          </Text>
          {snapshot.rejection !== null ? (
            <Text
              key={snapshot.rejectionCount}
              accessibilityLiveRegion="polite"
              style={[styles.errorText, { textAlign }]}
            >
              {copy.invalid}
            </Text>
          ) : null}
          {mounted ? (
            <CameraView
              key={generation}
              {...nativeQrCameraSettings}
              style={{ height: 220 }}
              accessible={false}
              onCameraReady={() => controller.ready(generation)}
              onMountError={() => controller.fail(generation)}
              onBarcodeScanned={(event) =>
                controller.barcode(generation, event)
              }
            />
          ) : null}
          <ScanButton
            label={snapshot.phase === "accepted" ? copy.again : copy.open}
            disabled={busy}
            onPress={() => void controller.open()}
          />
          {snapshot.permission === "denied" && !snapshot.canAskAgain ? (
            <ScanButton
              label={copy.settings}
              onPress={() => {
                void Linking.openSettings().catch(() => undefined);
              }}
            />
          ) : null}
          <ScanButton label={copy.close} onPress={() => controller.close()} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function ScanButton({
  label,
  onPress,
  disabled = false,
  selected,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole={selected === undefined ? "button" : "tab"}
      accessibilityLabel={label}
      accessibilityState={
        selected === undefined ? { disabled } : { disabled, selected }
      }
      disabled={disabled}
      onPress={onPress}
      style={[styles.actionButton, disabled && styles.disabledButton]}
    >
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}
