import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import type {
  EmployeeConfirmParkedSession,
  EmployeeConfirmParkedSnapshot,
  NativeAuthSession,
} from "@valet/employee-client";

import { EmployeeButton } from "../employee-ui/employee-controls";
import {
  EmployeeErrorNotice,
  EmployeeStatus,
} from "../employee-ui/employee-feedback";
import { employeeTextStyle } from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { getNativeParkingConfirmCopy } from "./native-parking-confirm-copy";
import { NativeParkingQrInput } from "./native-parking-qr-input";
import { nativeParkingConfirmStyles as s } from "./native-parking-confirm-styles";

export function NativeParkingSpotStep({
  auth,
  confirmation,
  copy,
  locale,
  snapshot,
  textAlign,
}: {
  readonly auth: NativeAuthSession;
  readonly confirmation: EmployeeConfirmParkedSession;
  readonly copy: ReturnType<typeof getNativeParkingConfirmCopy>;
  readonly locale: FoundationLocale;
  readonly snapshot: EmployeeConfirmParkedSnapshot;
  readonly textAlign: "left" | "right";
}) {
  const [reviewing, setReviewing] = useState(
    snapshot.parkingSpotCandidate.trim() !== "",
  );
  const destination = snapshot.session?.parking.parkingZoneCode
    ? `${copy.zone} ${snapshot.session.parking.parkingZoneCode}`
    : copy.parkingArea;
  if (!reviewing) {
    return (
      <>
        {snapshot.conflict === "spot" ? (
          <EmployeeErrorNotice textAlign={textAlign} title={copy.parkingSpot}>
            {copy.spotConflict}
          </EmployeeErrorNotice>
        ) : null}
        <Text style={[s.title, employeeTextStyle("human", textAlign)]}>
          {copy.spotTitle}
        </Text>
        <EmployeeStatus textAlign={textAlign}>{copy.spotBody}</EmployeeStatus>
        <NativeParkingQrInput
          auth={auth}
          autoOpen
          disabled={false}
          kind="parking-spot"
          label={copy.parkingSpot}
          locale={locale}
          manualInput={false}
          onChange={(value) => {
            confirmation.enterParkingSpot(value);
            if (value.trim() !== "") setReviewing(true);
          }}
          value={snapshot.parkingSpotCandidate}
        />
        <EmployeeButton
          label={copy.enterSpotManually}
          onPress={() => setReviewing(true)}
          variant="secondary"
        />
      </>
    );
  }
  return (
    <>
      <View style={s.successSurface}>
        <Text style={s.fieldLabel}>{copy.location}</Text>
        <Text style={s.locationHero}>{destination}</Text>
        <Text style={s.fieldLabel}>{copy.spotCode}</Text>
        <TextInput
          accessibilityLabel={copy.spotCode}
          autoCapitalize="characters"
          autoCorrect={false}
          onChangeText={(value) => confirmation.enterParkingSpot(value)}
          placeholder={copy.enterSpotCode}
          style={s.spotInput}
          value={snapshot.parkingSpotCandidate}
        />
      </View>
      <EmployeeButton
        disabled={snapshot.parkingSpotCandidate.trim() === ""}
        label={copy.continueLabel}
        onPress={() => confirmation.continueToKeySlot()}
        variant="success"
      />
      <EmployeeButton
        label={copy.scanAgain}
        onPress={() => {
          confirmation.enterParkingSpot("");
          setReviewing(false);
        }}
        variant="secondary"
      />
    </>
  );
}
