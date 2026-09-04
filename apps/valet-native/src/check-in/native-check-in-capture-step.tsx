import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type {
  EmployeeCheckInSession,
  EmployeeCheckInSnapshot,
  NativeAuthSession,
} from "@valet/employee-client";

import type { NativeCheckInCopy } from "./native-check-in-copy";
import {
  CheckInButton,
  CheckInError,
  CheckInField,
  CheckInStatus,
  type NativeTextAlign,
} from "./native-check-in-primitives";
import { checkInFailureMessage } from "./native-check-in-presentation";
import { NativePlateCameraStep } from "./native-plate-camera-step";
import { getNativePlateCameraCopy } from "./native-plate-camera-copy";
import { checkInStyles as s } from "./native-check-in-styles";

interface CaptureProps {
  readonly auth: NativeAuthSession;
  readonly copy: NativeCheckInCopy;
  readonly session: EmployeeCheckInSession;
  readonly snapshot: EmployeeCheckInSnapshot;
  readonly textAlign: NativeTextAlign;
}

export function NativeCaptureStep(props: CaptureProps) {
  const { auth, copy, session, snapshot, textAlign } = props;
  const noPlate = snapshot.vehicle.mode === "TEMPORARY_DESCRIPTOR";
  const [manual, setManual] = useState(
    () => noPlate || snapshot.vehicle.plateNumberRaw !== "",
  );
  const cameraCopy = getNativePlateCameraCopy(textAlign);
  return (
    <>
      <Text accessibilityRole="header" style={[s.title, { textAlign }]}>
        {copy.scanPlate}
      </Text>
      {manual || noPlate ? (
        <>
          <NativeManualIdentityFields {...props} />
          <CheckInButton
            label={cameraCopy.open}
            secondary
            onPress={() => {
              session.setVehicle({ mode: "CONFIRMED_PLATE" });
              setManual(false);
            }}
          />
        </>
      ) : (
        <NativePlateCameraStep
          auth={auth}
          session={session}
          textAlign={textAlign}
          copy={copy}
          onManual={() => setManual(true)}
          onNoPlate={() => {
            setManual(true);
            session.setVehicle({ mode: "TEMPORARY_DESCRIPTOR" });
          }}
        />
      )}
    </>
  );
}

export function NativeManualIdentityFields({
  copy,
  session,
  snapshot,
  textAlign,
}: Omit<CaptureProps, "auth">) {
  const noPlate = snapshot.vehicle.mode === "TEMPORARY_DESCRIPTOR";
  const error = checkInFailureMessage(copy, snapshot.error);
  return (
    <>
      <CheckInStatus textAlign={textAlign}>{copy.manualOnly}</CheckInStatus>
      <View accessibilityRole="tablist" style={s.row}>
        {(["CONFIRMED_PLATE", "TEMPORARY_DESCRIPTOR"] as const).map((mode) => (
          <View key={mode} style={{ flex: 1 }}>
            <CheckInButton
              label={
                mode === "CONFIRMED_PLATE" ? copy.enterPlate : copy.noPlate
              }
              selected={snapshot.vehicle.mode === mode}
              role="tab"
              secondary={snapshot.vehicle.mode !== mode}
              onPress={() => session.setVehicle({ mode })}
            />
          </View>
        ))}
      </View>
      {noPlate ? (
        <CheckInField
          accessibilityLabel={copy.unreadable}
          kind="human"
          textAlign={textAlign}
          maxLength={160}
          placeholder={copy.noPlateExample}
          value={snapshot.vehicle.temporaryDescriptor}
          onChangeText={(temporaryDescriptor) =>
            session.setVehicle({ temporaryDescriptor })
          }
        />
      ) : (
        <>
          <CheckInField
            accessibilityLabel={copy.plate}
            kind="identifier"
            textAlign={textAlign}
            maxLength={40}
            value={snapshot.vehicle.plateNumberRaw}
            onChangeText={(plateNumberRaw) =>
              session.setVehicle({ plateNumberRaw })
            }
          />
          <PlateCountrySelection
            label={copy.country}
            textAlign={textAlign}
            value={snapshot.vehicle.plateCountry}
            onChange={(plateCountry) => session.setVehicle({ plateCountry })}
          />
        </>
      )}
      {error ? (
        <CheckInError textAlign={textAlign}>{error}</CheckInError>
      ) : null}
      <CheckInButton
        label={copy.continueLabel}
        onPress={() => session.reviewIdentity()}
      />
    </>
  );
}

const COUNTRIES = ["JO", "AE", "SA", "KW", "BH", "OTHER"] as const;
function PlateCountrySelection({
  label,
  onChange,
  textAlign,
  value,
}: {
  readonly label: string;
  readonly onChange: (country: string) => void;
  readonly textAlign: NativeTextAlign;
  readonly value: string;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={[s.fieldLabel, { textAlign }]}>{label}</Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
      >
        {COUNTRIES.map((country) => (
          <Pressable
            key={country}
            accessibilityRole="radio"
            accessibilityLabel={country}
            accessibilityState={{ checked: value === country }}
            onPress={() => onChange(country)}
            style={[
              s.button,
              value !== country && s.secondaryButton,
              { minWidth: 80 },
            ]}
          >
            <Text
              style={[
                s.buttonLabel,
                value !== country && s.secondaryLabel,
                { writingDirection: "ltr" },
              ]}
            >
              {country}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
