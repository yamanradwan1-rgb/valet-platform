import { useState } from "react";
import { Text, View } from "react-native";
import type {
  EmployeeConfirmParkedSession,
  EmployeeConfirmParkedSnapshot,
  NativeAuthSession,
} from "@valet/employee-client";

import { EmployeeButton } from "../employee-ui/employee-controls";
import { EmployeeErrorNotice } from "../employee-ui/employee-feedback";
import { employeeTextStyle } from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { getNativeParkingConfirmCopy } from "./native-parking-confirm-copy";
import { nativeParkingConfirmStyles as s } from "./native-parking-confirm-styles";
import {
  NativeParkingResourceCapture,
  NativeParkingResourceResult,
} from "./native-parking-resource-step";

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
  const [reviewing, setReviewing] = useState(
    snapshot.keySlotCandidate.trim() !== "" || snapshot.conflict !== null,
  );
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
      {!reviewing ? (
        <NativeParkingResourceCapture
          auth={auth}
          body={copy.slotBody}
          disabled={submitting}
          kind="key-slot"
          label={copy.keySlot}
          locale={locale}
          manualLabel={copy.enterKeySlotManually}
          onCandidate={(value) => {
            confirmation.enterKeySlot(value);
            if (value.trim() !== "") setReviewing(true);
          }}
          onManual={() => setReviewing(true)}
          textAlign={textAlign}
          title={copy.keySlot}
          value={snapshot.keySlotCandidate}
        />
      ) : (
        <NativeParkingResourceResult
          codeLabel={copy.keySlot}
          label={copy.keySlot}
          onChange={(value) => confirmation.enterKeySlot(value)}
          placeholder={copy.enterKeySlotCode}
          value={snapshot.keySlotCandidate}
          valueHero={snapshot.keySlotCandidate.trim() || "—"}
        />
      )}
      {!online ? (
        <View style={s.offlinePanel}>
          <View accessibilityElementsHidden style={s.dangerDot} />
          <Text style={[s.offlineText, employeeTextStyle("human", textAlign)]}>
            {copy.noNetwork}
          </Text>
        </View>
      ) : null}
      {reviewing ? (
        <>
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
          <EmployeeButton
            disabled={submitting}
            label={copy.scanAgain}
            onPress={() => {
              confirmation.enterKeySlot("");
              setReviewing(false);
            }}
            variant="secondary"
          />
        </>
      ) : null}
    </>
  );
}
