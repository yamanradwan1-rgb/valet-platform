import { useState } from "react";
import type {
  EmployeeConfirmParkedSession,
  EmployeeConfirmParkedSnapshot,
  NativeAuthSession,
} from "@valet/employee-client";

import { EmployeeButton } from "../employee-ui/employee-controls";
import { EmployeeErrorNotice } from "../employee-ui/employee-feedback";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { getNativeParkingConfirmCopy } from "./native-parking-confirm-copy";
import {
  NativeParkingResourceCapture,
  NativeParkingResourceResult,
} from "./native-parking-resource-step";

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
        <NativeParkingResourceCapture
          auth={auth}
          body={copy.spotBody}
          disabled={false}
          kind="parking-spot"
          label={copy.parkingSpot}
          locale={locale}
          manualLabel={copy.enterSpotManually}
          onCandidate={(value) => {
            confirmation.enterParkingSpot(value);
            if (value.trim() !== "") setReviewing(true);
          }}
          onScanCandidate={(payload) => {
            if (confirmation.acceptParkingSpotScan(payload)) setReviewing(true);
          }}
          onManual={() => setReviewing(true)}
          textAlign={textAlign}
          title={copy.spotTitle}
          value={snapshot.parkingSpotCandidate}
        />
      </>
    );
  }
  return (
    <>
      <NativeParkingResourceResult
        codeLabel={copy.spotCode}
        label={copy.location}
        onChange={(value) => confirmation.enterParkingSpot(value)}
        placeholder={copy.enterSpotCode}
        value={snapshot.parkingSpotCandidate}
        valueHero={destination}
      />
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
