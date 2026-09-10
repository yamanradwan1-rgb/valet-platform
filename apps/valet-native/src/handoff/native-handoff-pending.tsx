import { Text, TextInput, View } from "react-native";
import {
  DYNAMIC_QR_PATTERN,
  type EmployeeHandoffSession,
  type EmployeeHandoffSnapshot,
  type NativeAuthSession,
} from "@valet/employee-client";

import { EmployeeButton } from "../employee-ui/employee-controls";
import { EmployeeError } from "../employee-ui/employee-feedback";
import { employeeTextStyle } from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
import {
  presentHandoffFailure,
  type NativeHandoffCopy,
} from "./native-handoff-copy";
import { NativeHandoffReasonAction } from "./native-handoff-reason-action";
import { NativeHandoffScanner } from "./native-handoff-scanner";
import { nativeHandoffStyles as s } from "./native-handoff-styles";

export function NativeHandoffPending({
  auth,
  busy,
  copy,
  handoff,
  locale,
  onReportIssue,
  snapshot,
  state,
  supervisor,
}: {
  readonly auth: NativeAuthSession;
  readonly busy: boolean;
  readonly copy: NativeHandoffCopy;
  readonly handoff: EmployeeHandoffSession;
  readonly locale: FoundationLocale;
  readonly onReportIssue?: (() => void) | undefined;
  readonly snapshot: EmployeeHandoffSnapshot;
  readonly state: {
    abortReason: string;
    lastAction: "abort" | "proof" | null;
    overrideReason: string;
    pickupCode: string;
    qrProof: string;
    setAbortReason: (value: string) => void;
    setLastAction: (value: "abort" | "proof" | null) => void;
    setOverrideReason: (value: string) => void;
    setPickupCode: (value: string) => void;
    setQrProof: (value: string) => void;
  };
  readonly supervisor: boolean;
}) {
  const submitCode = () => {
    state.setLastAction("proof");
    submitHandoffProof(state.pickupCode, state.setPickupCode, (proof) =>
      handoff.verifyPickupCode(proof),
    );
  };
  const submitQr = () => {
    state.setLastAction("proof");
    submitHandoffProof(state.qrProof, state.setQrProof, (proof) =>
      handoff.verifyDynamicQr(proof),
    );
  };
  const textAlign = locale === "ar" ? "right" : "left";
  return (
    <>
      {snapshot.failure && state.lastAction !== "abort" ? (
        <EmployeeError textAlign={textAlign}>
          {presentHandoffFailure(copy, snapshot.failure)}
        </EmployeeError>
      ) : null}
      <View style={s.card}>
        <Text style={[s.fieldLabel, employeeTextStyle("human", textAlign)]}>
          {copy.pickupCode}
        </Text>
        <TextInput
          accessibilityLabel={copy.pickupCode}
          editable={!busy}
          keyboardType="number-pad"
          maxLength={4}
          onChangeText={(value) =>
            state.setPickupCode(value.replace(/\D/g, "").slice(0, 4))
          }
          placeholder={copy.pickupPlaceholder}
          style={[s.input, s.pickupInput]}
          value={state.pickupCode}
        />
        <EmployeeButton
          busy={snapshot.phase === "verifying"}
          disabled={busy || !/^\d{4}$/.test(state.pickupCode)}
          label={copy.verifyCode}
          onPress={submitCode}
        />
      </View>
      <View style={s.card}>
        <Text style={[s.fieldLabel, employeeTextStyle("human", textAlign)]}>
          {copy.dynamicQr}
        </Text>
        <NativeHandoffScanner
          auth={auth}
          copy={copy}
          disabled={busy}
          locale={locale}
          onCandidate={state.setQrProof}
          onChange={state.setQrProof}
          value={state.qrProof}
        />
        <EmployeeButton
          busy={snapshot.phase === "verifying"}
          disabled={busy || !DYNAMIC_QR_PATTERN.test(state.qrProof)}
          label={copy.verifyQr}
          onPress={submitQr}
        />
      </View>
      {supervisor ? (
        <NativeHandoffReasonAction
          busy={busy}
          label={copy.override}
          onChange={state.setOverrideReason}
          onSubmit={() => {
            state.setLastAction("proof");
            const value = state.overrideReason;
            state.setOverrideReason("");
            void handoff.override(value);
          }}
          placeholder={copy.reasonRequired}
          textAlign={locale === "ar" ? "right" : "left"}
          title={copy.supervisorTitle}
          value={state.overrideReason}
        />
      ) : null}
      {onReportIssue ? (
        <EmployeeButton
          label={copy.reportIssue}
          onPress={onReportIssue}
          size="standard"
          variant="muted"
        />
      ) : null}
      <NativeHandoffReasonAction
        busy={busy}
        compact
        error={
          state.lastAction === "abort" && snapshot.failure
            ? presentHandoffFailure(copy, snapshot.failure)
            : null
        }
        label={copy.abort}
        onChange={state.setAbortReason}
        onSubmit={() => {
          state.setLastAction("abort");
          const value = state.abortReason;
          state.setAbortReason("");
          void handoff.abort(value);
        }}
        placeholder={copy.reasonRequired}
        textAlign={locale === "ar" ? "right" : "left"}
        title={copy.abortTitle}
        value={state.abortReason}
      />
    </>
  );
}

export function submitHandoffProof(
  proof: string,
  clear: (value: string) => void,
  verify: (proof: string) => unknown,
) {
  clear("");
  return verify(proof);
}
