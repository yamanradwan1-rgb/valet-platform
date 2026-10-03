import { useEmployeeStyles } from "../appearance/employee-appearance-context";
import { ScrollView } from "react-native";
import type {
  EmployeeConfirmParkedSession,
  EmployeeConfirmParkedSnapshot,
  NativeAuthSession,
} from "@valet/employee-client";

import { EmployeeBackHeader } from "../employee-ui/employee-back-header";
import { EmployeeButton } from "../employee-ui/employee-controls";
import {
  EmployeeErrorNotice,
  EmployeeProgress,
} from "../employee-ui/employee-feedback";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { getNativeParkingConfirmCopy } from "./native-parking-confirm-copy";
import { nativeParkingConfirmStylesTheme as sTheme } from "./native-parking-confirm-styles";
import { NativeParkingKeyReturnStep } from "./native-parking-key-return-step";
import { NativeParkingSuccess } from "./native-parking-success";
import { NativeParkingSpotStep } from "./native-parking-spot-step";

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
  const s = useEmployeeStyles(sTheme);

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
    : snapshot.phase === "spot"
      ? () => {
          confirmation.backToSpot();
          (onBack ?? onDone)();
        }
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
          <NativeParkingSpotStep
            auth={auth}
            confirmation={confirmation}
            copy={copy}
            locale={locale}
            snapshot={snapshot}
            textAlign={textAlign}
          />
        ) : (
          <NativeParkingKeyReturnStep
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

interface ContentProps {
  readonly confirmation: EmployeeConfirmParkedSession;
  readonly copy: Copy;
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
