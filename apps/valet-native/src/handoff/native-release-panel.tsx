import { ScrollView } from "react-native";
import type {
  EmployeeReleaseSession,
  EmployeeReleaseSnapshot,
} from "@valet/employee-client";

import { EmployeeBackHeader } from "../employee-ui/employee-back-header";
import { EmployeeButton } from "../employee-ui/employee-controls";
import {
  EmployeeBadge,
  EmployeeErrorNotice,
  EmployeeProgress,
  EmployeeStatus,
} from "../employee-ui/employee-feedback";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { getNativeReleaseCopy } from "./native-release-copy";
import { nativeReleaseBackBlocked } from "./native-release-protection";
import { nativeHandoffStyles as s } from "./native-handoff-styles";
import { NativeHandoffVehicle } from "./native-handoff-vehicle";

export function NativeReleasePanel({
  locale,
  onBack,
  onDone,
  release,
  snapshot,
}: {
  readonly locale: FoundationLocale;
  readonly onBack: () => void;
  readonly onDone: () => void;
  readonly release: EmployeeReleaseSession;
  readonly snapshot: EmployeeReleaseSnapshot;
}) {
  const copy = getNativeReleaseCopy(locale);
  const textAlign = locale === "ar" ? "right" : "left";
  const direction = locale === "ar" ? "rtl" : "ltr";
  const backBlocked = nativeReleaseBackBlocked(snapshot.phase);
  const method = snapshot.session?.handoff.verification?.method;
  const methodLabel =
    method === "SUPERVISOR_OVERRIDE"
      ? copy.supervisorOverride
      : method === "DYNAMIC_QR"
        ? copy.dynamicQr
        : copy.pickupCode;

  return (
    <>
      <EmployeeBackHeader
        accessibilityLabel={copy.back}
        direction={direction}
        disabled={backBlocked}
        onBack={onBack}
        textAlign={textAlign}
        title={
          snapshot.phase === "released" ? copy.completedTitle : copy.taskTitle
        }
      />
      <ScrollView contentContainerStyle={[s.body, { direction }]}>
        {snapshot.phase === "loading" || snapshot.phase === "reconciling" ? (
          <EmployeeProgress label={copy.check} textAlign={textAlign} />
        ) : null}
        <NativeHandoffVehicle snapshot={snapshot} textAlign={textAlign} />
        {snapshot.phase === "ready" || snapshot.phase === "releasing" ? (
          <>
            <EmployeeBadge
              label={`${copy.identityVerified} · ${methodLabel}`}
              textAlign={textAlign}
              variant="success"
            />
            <EmployeeStatus textAlign={textAlign}>
              {copy.cannotUndo}
            </EmployeeStatus>
            <EmployeeButton
              busy={snapshot.phase === "releasing"}
              disabled={snapshot.phase === "releasing"}
              label={
                snapshot.phase === "releasing"
                  ? copy.releasing
                  : copy.releaseVehicle
              }
              onPress={() => void release.release()}
            />
          </>
        ) : null}
        {snapshot.phase === "blocked" ? (
          <>
            <EmployeeBadge
              label={
                snapshot.block === "authority"
                  ? copy.authorityTitle
                  : copy.releaseBlocked
              }
              textAlign={textAlign}
              variant="warning"
            />
            <EmployeeStatus textAlign={textAlign}>
              {snapshot.block === "authority"
                ? copy.authorityBody
                : snapshot.block === "financial"
                  ? copy.financialBody
                  : copy.policyBody}
            </EmployeeStatus>
            {snapshot.block !== "authority" ? (
              <EmployeeButton
                label={copy.check}
                onPress={() => void release.checkServerState()}
                variant="secondary"
              />
            ) : null}
          </>
        ) : null}
        {snapshot.phase === "ambiguous" ||
        snapshot.phase === "conflict" ||
        snapshot.phase === "unavailable" ? (
          <>
            <EmployeeErrorNotice
              textAlign={textAlign}
              title={copy.releaseBlocked}
            >
              {snapshot.phase === "ambiguous"
                ? copy.unknownBody
                : snapshot.phase === "conflict"
                  ? copy.conflictBody
                  : copy.unavailableBody}
            </EmployeeErrorNotice>
            <EmployeeButton
              label={copy.check}
              onPress={() => void release.checkServerState()}
            />
          </>
        ) : null}
        {snapshot.phase === "released" ? (
          <>
            <EmployeeBadge
              label={copy.completedTitle}
              textAlign={textAlign}
              variant="success"
            />
            <EmployeeStatus textAlign={textAlign}>
              {copy.completedBody}
            </EmployeeStatus>
            <EmployeeButton label={copy.nextTask} onPress={onDone} />
          </>
        ) : null}
      </ScrollView>
    </>
  );
}
