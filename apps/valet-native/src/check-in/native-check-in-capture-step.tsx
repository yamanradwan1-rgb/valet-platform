import type {
  EmployeeCheckInSession,
  EmployeeCheckInSnapshot,
  EmployeeLocale,
  NativeAuthSession,
} from "@valet/employee-client";

import type { NativeCheckInCopy } from "./native-check-in-copy";
import {
  CheckInButton,
  CheckInError,
  CheckInField,
  type NativeTextAlign,
} from "./native-check-in-primitives";
import {
  checkInFailureMessage,
  type NativeCapturePresentation,
} from "./native-check-in-presentation";
import { NativePlateCameraStep } from "./native-plate-camera-step";
import { NativePlateCountrySelector } from "./native-plate-country-selector";

interface CaptureProps {
  readonly auth: NativeAuthSession;
  readonly copy: NativeCheckInCopy;
  readonly locale: EmployeeLocale;
  readonly onPresentationChange: (value: NativeCapturePresentation) => void;
  readonly presentation: NativeCapturePresentation;
  readonly session: EmployeeCheckInSession;
  readonly snapshot: EmployeeCheckInSnapshot;
  readonly textAlign: NativeTextAlign;
}

export function NativeCaptureStep(props: CaptureProps) {
  const { auth, copy, onPresentationChange, presentation, session, textAlign } =
    props;
  if (presentation === "manual") {
    return <NativeManualPlateFields {...props} />;
  }
  if (presentation === "descriptor") {
    return <NativeDescriptorFields {...props} />;
  }
  return (
    <NativePlateCameraStep
      auth={auth}
      locale={props.locale}
      session={session}
      textAlign={textAlign}
      copy={copy}
      onManual={() => {
        session.setVehicle({ mode: "CONFIRMED_PLATE" });
        onPresentationChange("manual");
      }}
      onNoPlate={() => {
        session.setVehicle({ mode: "TEMPORARY_DESCRIPTOR" });
        onPresentationChange("descriptor");
      }}
    />
  );
}

export function NativeManualPlateFields({
  copy,
  onPresentationChange,
  session,
  snapshot,
  textAlign,
}: CaptureProps) {
  const error = checkInFailureMessage(copy, snapshot.error);
  return (
    <>
      <CheckInField
        accessibilityLabel={copy.plate}
        alignment="center"
        kind="identifier"
        textAlign={textAlign}
        maxLength={40}
        value={snapshot.vehicle.plateNumberRaw}
        onChangeText={(plateNumberRaw) =>
          session.setVehicle({ plateNumberRaw })
        }
      />
      <NativePlateCountrySelector
        copy={copy}
        textAlign={textAlign}
        value={snapshot.vehicle.plateCountry}
        onChange={(plateCountry) => session.setVehicle({ plateCountry })}
      />
      {error ? (
        <CheckInError textAlign={textAlign}>{error}</CheckInError>
      ) : null}
      <CheckInButton
        label={copy.continueLabel}
        onPress={() => session.reviewIdentity()}
      />
      <CheckInButton
        label={copy.noPlate}
        variant="ghost"
        onPress={() => {
          session.setVehicle({ mode: "TEMPORARY_DESCRIPTOR" });
          onPresentationChange("descriptor");
        }}
      />
    </>
  );
}

export function NativeDescriptorFields({
  copy,
  onPresentationChange,
  session,
  snapshot,
  textAlign,
}: CaptureProps) {
  const error = checkInFailureMessage(copy, snapshot.error);
  return (
    <>
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
      {error ? (
        <CheckInError textAlign={textAlign}>{error}</CheckInError>
      ) : null}
      <CheckInButton
        label={copy.continueLabel}
        onPress={() => session.reviewIdentity()}
      />
      <CheckInButton
        label={copy.enterPlate}
        variant="ghost"
        onPress={() => {
          session.setVehicle({ mode: "CONFIRMED_PLATE" });
          onPresentationChange("manual");
        }}
      />
    </>
  );
}
