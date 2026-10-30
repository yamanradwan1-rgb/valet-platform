import { useEmployeeStyles } from "../appearance/employee-appearance-context";
import { ScrollView, Text, View } from "react-native";
import type {
  EmployeeReleaseSession,
  EmployeeReleaseSnapshot,
} from "@valet/employee-client";

import { EmployeeBackHeader } from "../employee-ui/employee-back-header";
import { EmployeeButton } from "../employee-ui/employee-controls";
import {
  EmployeeError,
  EmployeeErrorNotice,
  EmployeeProgress,
} from "../employee-ui/employee-feedback";
import { employeeTextStyle } from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { getNativeReleaseCopy } from "./native-release-copy";
import { nativeReleaseBackBlocked } from "./native-release-protection";
import { nativeHandoffStylesTheme as sTheme } from "./native-handoff-styles";
import { NativeHandoffVehicle } from "./native-handoff-vehicle";

export function NativeReleasePanel({
  locale,
  onBack,
  onDone,
  onReportIssue,
  release,
  snapshot,
}: {
  readonly locale: FoundationLocale;
  readonly onBack: () => void;
  readonly onDone: () => void;
  readonly onReportIssue?: ((sessionId: string) => void) | undefined;
  readonly release: EmployeeReleaseSession;
  readonly snapshot: EmployeeReleaseSnapshot;
}) {
  const s = useEmployeeStyles(sTheme);

  const copy = getNativeReleaseCopy(locale);
  const textAlign = locale === "ar" ? "right" : "left";
  const direction = locale === "ar" ? "rtl" : "ltr";
  const verification = snapshot.session?.handoff.verification;
  const canShowVerification =
    (snapshot.phase === "ready" || snapshot.phase === "releasing") &&
    snapshot.block === null &&
    snapshot.session?.state === "HANDOFF_PENDING" &&
    snapshot.session.handoff.pendingAt !== null &&
    verification?.status === "VERIFIED" &&
    verification.verifiedAt !== null;
  const method = canShowVerification ? verification.method : null;
  const methodLabel =
    method === "SUPERVISOR_OVERRIDE"
      ? copy.supervisorOverride
      : method === "DYNAMIC_QR"
        ? copy.dynamicQr
        : method === "PICKUP_CODE"
          ? copy.pickupCode
          : null;
  const verifiedEyebrow = methodLabel
    ? `${copy.identityVerified} · ${methodLabel}`
    : null;
  const releaseBlocked =
    snapshot.phase === "blocked" ||
    ((snapshot.phase === "ready" || snapshot.phase === "releasing") &&
      !verifiedEyebrow);
  const reportIssue =
    onReportIssue && snapshot.session
      ? () => onReportIssue(snapshot.session!.sessionId)
      : undefined;

  return (
    <>
      <EmployeeBackHeader
        accessibilityLabel={copy.back}
        direction={direction}
        disabled={nativeReleaseBackBlocked(snapshot.phase)}
        onBack={onBack}
        textAlign={textAlign}
        title={
          snapshot.phase === "released"
            ? copy.completedTitle
            : releaseBlocked
              ? copy.releaseBlocked
              : verifiedEyebrow
                ? copy.identityVerified
                : copy.taskTitle
        }
      />
      <ScrollView contentContainerStyle={[s.body, { direction }]}>
        {snapshot.phase === "loading" || snapshot.phase === "reconciling" ? (
          <EmployeeProgress label={copy.check} textAlign={textAlign} />
        ) : null}
        {snapshot.phase !== "loading" && snapshot.phase !== "reconciling" ? (
          <NativeHandoffVehicle
            eyebrow={
              snapshot.phase === "released"
                ? copy.completedTitle
                : releaseBlocked
                  ? copy.releaseBlocked
                  : (verifiedEyebrow ?? copy.taskTitle)
            }
            snapshot={snapshot}
            supporting={
              snapshot.phase === "released" ? copy.completedBody : undefined
            }
            textAlign={textAlign}
          />
        ) : null}
        {(snapshot.phase === "ready" || snapshot.phase === "releasing") &&
        verifiedEyebrow ? (
          <>
            {snapshot.failure ? (
              <EmployeeError textAlign={textAlign}>
                {snapshot.failure.message}
              </EmployeeError>
            ) : null}
            <View style={s.card}>
              <Text
                style={[s.fieldLabel, employeeTextStyle("human", textAlign)]}
              >
                {copy.releaseVehicle}
              </Text>
              <Text style={[s.cardBody, employeeTextStyle("human", textAlign)]}>
                {copy.cannotUndo}
              </Text>
            </View>
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
        {snapshot.phase === "blocked" && snapshot.block === "financial" ? (
          <Text
            accessibilityRole="alert"
            style={[s.warning, employeeTextStyle("human", textAlign)]}
          >
            {copy.releaseBlocked}
          </Text>
        ) : null}
        {snapshot.phase === "blocked" && snapshot.block === "authority" ? (
          <View style={s.card}>
            <Text style={[s.fieldLabel, employeeTextStyle("human", textAlign)]}>
              {copy.awaitingTaskOwner}
            </Text>
            <Text style={[s.cardBody, employeeTextStyle("human", textAlign)]}>
              {copy.authorityBody}
            </Text>
          </View>
        ) : null}
        {snapshot.phase === "blocked" && snapshot.block === "verification" ? (
          <EmployeeError textAlign={textAlign}>
            {snapshot.failure?.message ?? copy.policyBody}
          </EmployeeError>
        ) : null}
        {snapshot.phase === "ambiguous" ||
        snapshot.phase === "conflict" ||
        snapshot.phase === "unavailable" ? (
          <>
            <EmployeeErrorNotice textAlign={textAlign} title={copy.taskTitle}>
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
          <EmployeeButton label={copy.nextTask} onPress={onDone} />
        ) : null}
        {reportIssue && snapshot.phase !== "released" ? (
          <EmployeeButton
            label={copy.reportIssue}
            onPress={reportIssue}
            size="large"
            variant="secondary"
          />
        ) : null}
      </ScrollView>
    </>
  );
}
