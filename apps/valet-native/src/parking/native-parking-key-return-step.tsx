import { Text, TextInput, View } from "react-native";
import type {
  EmployeeConfirmParkedSession,
  EmployeeConfirmParkedSnapshot,
  NativeAuthSession,
} from "@valet/employee-client";

import { EmployeeButton } from "../employee-ui/employee-controls";
import {
  EmployeeBadge,
  EmployeeErrorNotice,
} from "../employee-ui/employee-feedback";
import { employeeTextStyle } from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { getNativeParkingConfirmCopy } from "./native-parking-confirm-copy";
import { NativeParkingQrInput } from "./native-parking-qr-input";
import { nativeParkingConfirmStyles as s } from "./native-parking-confirm-styles";

export function NativeParkingKeyReturnStep({
  auth,
  confirmation,
  copy,
  locale,
  online,
  snapshot,
  textAlign,
}: {
  readonly auth: NativeAuthSession;
  readonly confirmation: EmployeeConfirmParkedSession;
  readonly copy: ReturnType<typeof getNativeParkingConfirmCopy>;
  readonly locale: FoundationLocale;
  readonly online: boolean;
  readonly snapshot: EmployeeConfirmParkedSnapshot;
  readonly textAlign: "left" | "right";
}) {
  const submitting = snapshot.phase === "submitting";
  const conflict =
    snapshot.conflict === "slot"
      ? copy.slotConflict
      : snapshot.conflict === "stale"
        ? copy.stale
        : snapshot.failure !== null
          ? copy.reviewAgain
          : null;
  return (
    <>
      {conflict !== null ? (
        <EmployeeErrorNotice textAlign={textAlign} title={copy.keySlot}>
          {conflict}
        </EmployeeErrorNotice>
      ) : null}
      <EmployeeBadge
        label={copy.parking}
        showDot
        textAlign={textAlign}
        variant="warning"
      />
      <View style={s.keyInfoPanel}>
        <View accessibilityElementsHidden style={s.blueDot} />
        <Text style={[s.keyInfoText, employeeTextStyle("human", textAlign)]}>
          {copy.slotBody}
        </Text>
      </View>
      <NativeParkingQrInput
        auth={auth}
        disabled={submitting}
        kind="key-slot"
        label={copy.keySlot}
        locale={locale}
        manualInput={false}
        onChange={(value) => confirmation.enterKeySlot(value)}
        value={snapshot.keySlotCandidate}
      />
      <TextInput
        accessibilityLabel={copy.keySlot}
        accessibilityState={{ disabled: submitting }}
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!submitting}
        onChangeText={(value) => confirmation.enterKeySlot(value)}
        placeholder={copy.enterKeySlotCode}
        style={s.keyInput}
        value={snapshot.keySlotCandidate}
      />
      {!online ? (
        <View style={s.offlinePanel}>
          <View accessibilityElementsHidden style={s.dangerDot} />
          <Text style={[s.offlineText, employeeTextStyle("human", textAlign)]}>
            {copy.noNetwork}
          </Text>
        </View>
      ) : null}
      <EmployeeButton
        busy={submitting}
        disabled={
          !online ||
          submitting ||
          snapshot.keySlotCandidate.trim() === "" ||
          snapshot.phase !== "ready"
        }
        label={submitting ? copy.confirming : copy.confirm}
        onPress={() => void confirmation.confirmParked()}
        variant="success"
      />
    </>
  );
}
