import { useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import {
  DYNAMIC_QR_PATTERN,
  type EmployeeHandoffSession,
  type EmployeeHandoffSnapshot,
  type NativeAuthSession,
} from "@valet/employee-client";

import { EmployeeBackHeader } from "../employee-ui/employee-back-header";
import { EmployeeButton } from "../employee-ui/employee-controls";
import {
  EmployeeBadge,
  EmployeeError,
  EmployeeErrorNotice,
  EmployeeProgress,
  EmployeeStatus,
} from "../employee-ui/employee-feedback";
import type { FoundationLocale } from "../foundation/foundation-locale";
import {
  getNativeHandoffCopy,
  type NativeHandoffCopy,
} from "./native-handoff-copy";
import { NativeHandoffScanner } from "./native-handoff-scanner";
import { useNativeHandoffPrivacy } from "./native-handoff-privacy";
import { NativeHandoffReasonAction as ReasonAction } from "./native-handoff-reason-action";
import { nativeHandoffStyles as s } from "./native-handoff-styles";
import { NativeHandoffVehicle } from "./native-handoff-vehicle";

export function NativeHandoffPanel({
  auth,
  handoff,
  locale,
  onBack,
  snapshot,
}: {
  readonly auth: NativeAuthSession;
  readonly handoff: EmployeeHandoffSession;
  readonly locale: FoundationLocale;
  readonly onBack: () => void;
  readonly snapshot: EmployeeHandoffSnapshot;
}) {
  const copy = getNativeHandoffCopy(locale);
  const [pickupCode, setPickupCode] = useState("");
  const [qrProof, setQrProof] = useState("");
  const [abortReason, setAbortReason] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
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
  const owner =
    snapshot.task?.currentAssigneeMembershipId === snapshot.scope?.membershipId;
  const supervisor = snapshot.scope?.role === "VALET_SUPERVISOR";

  const submitCode = () => {
    const proof = pickupCode;
    setPickupCode("");
    void handoff.verifyPickupCode(proof);
  };
  const submitQr = (candidate = qrProof) => {
    setQrProof("");
    void handoff.verifyDynamicQr(candidate);
  };
  const back = () => {
    setPickupCode("");
    setQrProof("");
    setAbortReason("");
    setOverrideReason("");
    onBack();
  };

  return (
    <>
      <EmployeeBackHeader
        accessibilityLabel={copy.back}
        direction={direction}
        disabled={busy}
        onBack={back}
        textAlign={textAlign}
        title={copy.taskTitle}
      />
      <ScrollView
        contentContainerStyle={[s.body, { direction }]}
        keyboardShouldPersistTaps="handled"
      >
        {snapshot.phase === "loading" || snapshot.phase === "reconciling" ? (
          <EmployeeProgress label={copy.check} textAlign={textAlign} />
        ) : null}
        <NativeHandoffVehicle snapshot={snapshot} textAlign={textAlign} />
        {snapshot.phase === "ready" || snapshot.phase === "initiating" ? (
          <>
            <EmployeeBadge
              label={copy.begin}
              textAlign={textAlign}
              variant="success"
            />
            <EmployeeStatus textAlign={textAlign}>
              {copy.readyBody}
            </EmployeeStatus>
            {snapshot.failure ? (
              <EmployeeError textAlign={textAlign}>
                {copy.failure}
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
          </>
        ) : null}
        {snapshot.phase === "pending" ||
        snapshot.phase === "verifying" ||
        snapshot.phase === "overriding" ||
        snapshot.phase === "aborting" ? (
          <>
            <EmployeeBadge
              label={copy.awaiting}
              textAlign={textAlign}
              variant="warning"
            />
            <EmployeeStatus textAlign={textAlign}>
              {copy.pendingBody}
            </EmployeeStatus>
            {snapshot.failure ? (
              <EmployeeError textAlign={textAlign}>
                {failureText(copy, snapshot)}
              </EmployeeError>
            ) : null}
            {owner ? (
              <>
                <View style={s.section}>
                  <TextInput
                    accessibilityLabel={copy.pickupCode}
                    editable={!busy}
                    keyboardType="number-pad"
                    maxLength={4}
                    onChangeText={(value) =>
                      setPickupCode(value.replace(/\D/g, "").slice(0, 4))
                    }
                    style={[s.input, s.ltr]}
                    value={pickupCode}
                  />
                  {pickupCode !== "" && !/^\d{4}$/.test(pickupCode) ? (
                    <EmployeeError textAlign={textAlign}>
                      {copy.invalidCode}
                    </EmployeeError>
                  ) : null}
                  <EmployeeButton
                    busy={snapshot.phase === "verifying"}
                    disabled={busy || !/^\d{4}$/.test(pickupCode)}
                    label={
                      snapshot.phase === "verifying"
                        ? copy.verifying
                        : copy.verifyCode
                    }
                    onPress={submitCode}
                  />
                </View>
                <NativeHandoffScanner
                  auth={auth}
                  copy={copy}
                  disabled={busy}
                  locale={locale}
                  onCandidate={submitQr}
                  onChange={setQrProof}
                  value={qrProof}
                />
                <EmployeeButton
                  disabled={busy || !DYNAMIC_QR_PATTERN.test(qrProof)}
                  label={copy.verifyQr}
                  onPress={() => submitQr()}
                />
              </>
            ) : null}
            {supervisor ? (
              <ReasonAction
                busy={busy}
                label={
                  snapshot.phase === "overriding"
                    ? copy.overriding
                    : copy.override
                }
                onChange={setOverrideReason}
                onSubmit={() => {
                  const value = overrideReason;
                  setOverrideReason("");
                  void handoff.override(value);
                }}
                placeholder={copy.overrideReason}
                value={overrideReason}
              />
            ) : null}
            <ReasonAction
              busy={busy}
              label={snapshot.phase === "aborting" ? copy.aborting : copy.abort}
              onChange={setAbortReason}
              onSubmit={() => {
                const value = abortReason;
                setAbortReason("");
                void handoff.abort(value);
              }}
              placeholder={copy.abortReason}
              value={abortReason}
            />
          </>
        ) : null}
        {snapshot.phase === "verified" ? (
          <>
            <EmployeeBadge
              label={
                snapshot.session?.handoff.verification?.method ===
                "SUPERVISOR_OVERRIDE"
                  ? copy.overrideVerified
                  : copy.verifiedTitle
              }
              textAlign={textAlign}
              variant="success"
            />
            <EmployeeStatus textAlign={textAlign}>
              {copy.verifiedBody}
            </EmployeeStatus>
            {snapshot.failure ? (
              <EmployeeError textAlign={textAlign}>
                {failureText(copy, snapshot)}
              </EmployeeError>
            ) : null}
            <ReasonAction
              busy={busy}
              label={copy.abort}
              onChange={setAbortReason}
              onSubmit={() => {
                const value = abortReason;
                setAbortReason("");
                void handoff.abort(value);
              }}
              placeholder={copy.abortReason}
              value={abortReason}
            />
          </>
        ) : null}
        {snapshot.phase === "ambiguous" ||
        snapshot.phase === "unavailable" ||
        snapshot.phase === "conflict" ? (
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
              onPress={() => void handoff.checkServerState()}
            />
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

function failureText(
  copy: NativeHandoffCopy,
  snapshot: EmployeeHandoffSnapshot,
) {
  return snapshot.failure?.retryAfter !== undefined
    ? copy.retryAfter(snapshot.failure.retryAfter)
    : copy.failure;
}
