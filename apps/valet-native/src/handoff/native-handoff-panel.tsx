import { useState } from "react";
import { ScrollView } from "react-native";
import type {
  EmployeeHandoffSession,
  EmployeeHandoffSnapshot,
  NativeAuthSession,
} from "@valet/employee-client";

import { EmployeeBackHeader } from "../employee-ui/employee-back-header";
import { EmployeeButton } from "../employee-ui/employee-controls";
import {
  EmployeeError,
  EmployeeErrorNotice,
  EmployeeProgress,
} from "../employee-ui/employee-feedback";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { getNativeHandoffCopy } from "./native-handoff-copy";
import { NativeHandoffPending } from "./native-handoff-pending";
import { useNativeHandoffPrivacy } from "./native-handoff-privacy";
import { nativeHandoffStyles as s } from "./native-handoff-styles";
import { NativeHandoffVehicle } from "./native-handoff-vehicle";

export function NativeHandoffPanel({
  auth,
  handoff,
  locale,
  onBack,
  onReportIssue,
  snapshot,
}: {
  readonly auth: NativeAuthSession;
  readonly handoff: EmployeeHandoffSession;
  readonly locale: FoundationLocale;
  readonly onBack: () => void;
  readonly onReportIssue?: ((sessionId: string) => void) | undefined;
  readonly snapshot: EmployeeHandoffSnapshot;
}) {
  const copy = getNativeHandoffCopy(locale);
  const [pickupCode, setPickupCode] = useState("");
  const [qrProof, setQrProof] = useState("");
  const [abortReason, setAbortReason] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [lastAction, setLastAction] = useState<"abort" | "proof" | null>(null);
  useNativeHandoffPrivacy(
    snapshot,
    setPickupCode,
    setQrProof,
    setAbortReason,
    setOverrideReason,
  );
  const busy = [
    "aborting",
    "initiating",
    "overriding",
    "reconciling",
    "verifying",
  ].includes(snapshot.phase);
  const textAlign = locale === "ar" ? "right" : "left";
  const direction = locale === "ar" ? "rtl" : "ltr";
  const pending = ["pending", "verifying", "overriding", "aborting"].includes(
    snapshot.phase,
  );
  const method = snapshot.session?.handoff.verification?.method;
  const methodLabel =
    method === "SUPERVISOR_OVERRIDE"
      ? copy.supervisorTitle
      : method === "DYNAMIC_QR"
        ? copy.dynamicQr
        : copy.pickupCode;
  const reportIssue =
    onReportIssue && snapshot.session
      ? () => onReportIssue(snapshot.session!.sessionId)
      : undefined;
  const back = () => {
    setPickupCode("");
    setQrProof("");
    setAbortReason("");
    setOverrideReason("");
    setLastAction(null);
    onBack();
  };
  const state = {
    abortReason,
    lastAction,
    overrideReason,
    pickupCode,
    qrProof,
    setAbortReason,
    setLastAction,
    setOverrideReason,
    setPickupCode,
    setQrProof,
  };

  return (
    <>
      <EmployeeBackHeader
        accessibilityLabel={copy.back}
        direction={direction}
        disabled={busy}
        onBack={back}
        textAlign={textAlign}
        title={
          snapshot.phase === "verified"
            ? copy.verifiedTitle
            : pending
              ? copy.guestHandoff
              : copy.taskTitle
        }
      />
      <ScrollView
        contentContainerStyle={[s.body, { direction }]}
        keyboardShouldPersistTaps="handled"
      >
        {snapshot.phase === "loading" || snapshot.phase === "reconciling" ? (
          <EmployeeProgress label={copy.check} textAlign={textAlign} />
        ) : null}
        {snapshot.phase === "ready" || snapshot.phase === "initiating" ? (
          <>
            <NativeHandoffVehicle
              eyebrow={copy.readyForPickup}
              keyLabel={copy.key}
              snapshot={snapshot}
              textAlign={textAlign}
            />
            {snapshot.failure ? (
              <EmployeeError textAlign={textAlign}>
                {snapshot.failure.message}
              </EmployeeError>
            ) : null}
            <EmployeeButton
              busy={snapshot.phase === "initiating"}
              disabled={busy}
              label={
                snapshot.phase === "initiating" ? copy.beginning : copy.begin
              }
              onPress={() => void handoff.initiate()}
            />
            {reportIssue ? (
              <EmployeeButton
                label={copy.reportIssue}
                onPress={reportIssue}
                size="standard"
                variant="muted"
              />
            ) : null}
          </>
        ) : null}
        {pending ? (
          <>
            <NativeHandoffVehicle
              eyebrow={copy.awaiting}
              snapshot={snapshot}
              textAlign={textAlign}
            />
            <NativeHandoffPending
              auth={auth}
              busy={busy}
              copy={copy}
              handoff={handoff}
              locale={locale}
              onReportIssue={reportIssue}
              snapshot={snapshot}
              state={state}
              supervisor={snapshot.scope?.role === "VALET_SUPERVISOR"}
            />
          </>
        ) : null}
        {snapshot.phase === "verified" ? (
          <>
            <NativeHandoffVehicle
              eyebrow={`${copy.verifiedTitle} · ${methodLabel}`}
              snapshot={snapshot}
              textAlign={textAlign}
            />
            {reportIssue ? (
              <EmployeeButton
                label={copy.reportIssue}
                onPress={reportIssue}
                size="large"
                variant="secondary"
              />
            ) : null}
          </>
        ) : null}
        {snapshot.phase === "ambiguous" ||
        snapshot.phase === "unavailable" ||
        snapshot.phase === "conflict" ? (
          <>
            <EmployeeErrorNotice
              textAlign={textAlign}
              title={copy.guestHandoff}
            >
              {snapshot.phase === "ambiguous"
                ? copy.unknownBody
                : snapshot.phase === "conflict"
                  ? copy.conflictBody
                  : copy.unavailableBody}
            </EmployeeErrorNotice>
            <EmployeeButton
              label={copy.check}
              onPress={() => void handoff.checkServerState()}
            />
          </>
        ) : null}
      </ScrollView>
    </>
  );
}
