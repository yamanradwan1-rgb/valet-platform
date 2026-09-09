import { ScrollView, Text, View } from "react-native";
import type {
  EmployeeConfirmParkedSession,
  EmployeeConfirmParkedSnapshot,
  NativeAuthSession,
} from "@valet/employee-client";

import { EmployeeBackHeader } from "../employee-ui/employee-back-header";
import { EmployeeButton } from "../employee-ui/employee-controls";
import {
  EmployeeBadge,
  EmployeeErrorNotice,
  EmployeeProgress,
  EmployeeStatus,
} from "../employee-ui/employee-feedback";
import { employeeTextStyle } from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { getNativeParkingConfirmCopy } from "./native-parking-confirm-copy";
import { NativeParkingQrInput } from "./native-parking-qr-input";
import { nativeParkingConfirmStyles as s } from "./native-parking-confirm-styles";
import { NativeParkingSuccess } from "./native-parking-success";

export function NativeParkingConfirmPanel({
  auth,
  confirmation,
  locale,
  online = true,
  onBack,
  onDone,
  snapshot,
}: {
  readonly auth: NativeAuthSession;
  readonly confirmation: EmployeeConfirmParkedSession;
  readonly locale: FoundationLocale;
  readonly online?: boolean | undefined;
  readonly onBack?: (() => void) | undefined;
  readonly onDone: () => void;
  readonly snapshot: EmployeeConfirmParkedSnapshot;
}) {
  const copy = getNativeParkingConfirmCopy(locale);
  const direction = locale === "ar" ? "rtl" : "ltr";
  const textAlign = locale === "ar" ? "right" : "left";
  const busy =
    snapshot.phase === "submitting" || snapshot.phase === "reconciling";
  const inSlotStep =
    snapshot.phase === "slot" ||
    snapshot.phase === "ready" ||
    snapshot.phase === "submitting";
  const back = inSlotStep
    ? () => confirmation.backToSpot()
    : (onBack ?? onDone);
  const headerTitle = inSlotStep
    ? copy.keySlot
    : snapshot.phase === "spot"
      ? copy.parkingSpot
      : copy.taskTitle;

  return (
    <>
      {snapshot.phase !== "parked" ? (
        <EmployeeBackHeader
          accessibilityLabel={copy.back}
          direction={direction}
          disabled={busy}
          onBack={back}
          textAlign={textAlign}
          title={headerTitle}
        />
      ) : null}
      <ScrollView contentContainerStyle={[s.body, { direction }]}>
        {snapshot.phase === "loading" ||
        snapshot.phase === "reconciling" ||
        snapshot.phase === "inactive" ? (
          <EmployeeProgress label={copy.checkState} textAlign={textAlign} />
        ) : snapshot.phase === "ambiguous" ? (
          <AmbiguousContent
            confirmation={confirmation}
            copy={copy}
            textAlign={textAlign}
          />
        ) : snapshot.phase === "unavailable" ? (
          <UnavailableContent
            confirmation={confirmation}
            copy={copy}
            onDone={onDone}
            textAlign={textAlign}
          />
        ) : snapshot.phase === "parked" ? (
          <NativeParkingSuccess
            copy={copy}
            onDone={onDone}
            snapshot={snapshot}
            textAlign={textAlign}
          />
        ) : snapshot.phase === "spot" ? (
          <SpotContent
            auth={auth}
            confirmation={confirmation}
            copy={copy}
            locale={locale}
            snapshot={snapshot}
            textAlign={textAlign}
          />
        ) : (
          <SlotContent
            auth={auth}
            confirmation={confirmation}
            copy={copy}
            locale={locale}
            online={online}
            snapshot={snapshot}
            textAlign={textAlign}
          />
        )}
      </ScrollView>
    </>
  );
}

type Copy = ReturnType<typeof getNativeParkingConfirmCopy>;
type Align = "left" | "right";

function SpotContent({
  auth,
  confirmation,
  copy,
  locale,
  snapshot,
  textAlign,
}: ContentProps) {
  const hasSpot = snapshot.parkingSpotCandidate.trim() !== "";
  const destination = snapshot.session?.parking.parkingZoneCode
    ? `${copy.zone} ${snapshot.session.parking.parkingZoneCode}`
    : copy.parkingArea;
  return (
    <>
      {snapshot.conflict === "spot" ? (
        <EmployeeErrorNotice textAlign={textAlign} title={copy.parkingSpot}>
          {copy.spotConflict}
        </EmployeeErrorNotice>
      ) : null}
      {!hasSpot ? (
        <>
          <Text style={[s.title, employeeTextStyle("human", textAlign)]}>
            {copy.spotTitle}
          </Text>
          <EmployeeStatus textAlign={textAlign}>{copy.spotBody}</EmployeeStatus>
          <NativeParkingQrInput
            auth={auth}
            disabled={false}
            kind="parking-spot"
            label={copy.parkingSpot}
            locale={locale}
            onChange={(value) => confirmation.enterParkingSpot(value)}
            value={snapshot.parkingSpotCandidate}
          />
        </>
      ) : (
        <>
          <View style={s.successSurface}>
            <Text style={s.fieldLabel}>{copy.location}</Text>
            <Text style={s.locationHero}>{destination}</Text>
            <Text style={s.fieldLabel}>{copy.spotCode}</Text>
            <Text style={s.identifier}>{snapshot.parkingSpotCandidate}</Text>
          </View>
          <EmployeeButton
            label={copy.continueLabel}
            onPress={() => confirmation.continueToKeySlot()}
            variant="success"
          />
          <EmployeeButton
            label={copy.scanAgain}
            onPress={() => confirmation.enterParkingSpot("")}
            variant="secondary"
          />
        </>
      )}
    </>
  );
}

function SlotContent({
  auth,
  confirmation,
  copy,
  locale,
  online = true,
  snapshot,
  textAlign,
}: ContentProps) {
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
      <EmployeeBadge label={copy.parking} textAlign={textAlign} />
      {conflict !== null ? (
        <EmployeeErrorNotice textAlign={textAlign} title={copy.keySlot}>
          {conflict}
        </EmployeeErrorNotice>
      ) : null}
      <EmployeeStatus textAlign={textAlign}>{copy.slotBody}</EmployeeStatus>
      <NativeParkingQrInput
        auth={auth}
        disabled={submitting}
        kind="key-slot"
        label={copy.keySlot}
        locale={locale}
        onChange={(value) => confirmation.enterKeySlot(value)}
        value={snapshot.keySlotCandidate}
      />
      {!online ? (
        <EmployeeStatus textAlign={textAlign}>{copy.noNetwork}</EmployeeStatus>
      ) : null}
      <EmployeeButton
        busy={submitting}
        disabled={!online || snapshot.phase !== "ready"}
        label={submitting ? copy.confirming : copy.confirm}
        onPress={() => void confirmation.confirmParked()}
      />
    </>
  );
}

interface ContentProps {
  readonly auth: NativeAuthSession;
  readonly confirmation: EmployeeConfirmParkedSession;
  readonly copy: Copy;
  readonly locale: FoundationLocale;
  readonly online?: boolean | undefined;
  readonly snapshot: EmployeeConfirmParkedSnapshot;
  readonly textAlign: Align;
}

function AmbiguousContent({
  confirmation,
  copy,
  textAlign,
}: Pick<ContentProps, "confirmation" | "copy" | "textAlign">) {
  return (
    <>
      <EmployeeErrorNotice textAlign={textAlign} title={copy.ambiguousTitle}>
        {copy.ambiguousBody}
      </EmployeeErrorNotice>
      <EmployeeButton
        label={copy.checkState}
        onPress={() => void confirmation.checkServerState()}
      />
    </>
  );
}

function UnavailableContent({
  confirmation,
  copy,
  onDone,
  textAlign,
}: Pick<ContentProps, "confirmation" | "copy" | "textAlign"> & {
  readonly onDone: () => void;
}) {
  return (
    <>
      <EmployeeErrorNotice textAlign={textAlign} title={copy.unavailableTitle}>
        {copy.unavailableBody}
      </EmployeeErrorNotice>
      <EmployeeButton
        label={copy.checkState}
        onPress={() => void confirmation.checkServerState()}
      />
      <EmployeeButton
        label={copy.backToTasks}
        onPress={onDone}
        variant="secondary"
      />
    </>
  );
}
