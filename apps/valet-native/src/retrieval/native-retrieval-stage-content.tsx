import type {
  EmployeeRetrievalSession,
  EmployeeRetrievalSnapshot,
  NativeAuthSession,
} from "@valet/employee-client";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { EmployeeButton } from "../employee-ui/employee-controls";
import {
  EmployeeBadge,
  EmployeeError,
  EmployeeErrorNotice,
} from "../employee-ui/employee-feedback";
import { employeeTextStyle } from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { NativeParkingQrInput } from "../parking/native-parking-qr-input";
import type { NativeRetrievalCopy } from "./native-retrieval-copy";
import { NativeRetrievalDetails } from "./native-retrieval-details";
import { nativeRetrievalStyles as s } from "./native-retrieval-styles";

interface StageProps {
  readonly copy: NativeRetrievalCopy;
  readonly snapshot: EmployeeRetrievalSnapshot;
  readonly textAlign: "left" | "right";
}

export function NativeRetrievalKeyCheckout({
  auth,
  copy,
  locale,
  retrieval,
  snapshot,
  textAlign,
}: StageProps & {
  readonly auth: NativeAuthSession;
  readonly locale: FoundationLocale;
  readonly retrieval: EmployeeRetrievalSession;
}) {
  const submitting = snapshot.phase === "submitting-start";
  const expectedKey = snapshot.session?.keySlot?.code ?? null;
  return (
    <>
      {snapshot.failure ? (
        <EmployeeError textAlign={textAlign}>
          {snapshot.failure.message}
        </EmployeeError>
      ) : null}
      <View style={s.expectedKeyHero}>
        <Text
          style={[
            s.expectedKeyLabel,
            employeeTextStyle("human", textAlign, "center"),
          ]}
        >
          {copy.expectedKeySlot}
        </Text>
        <Text style={s.expectedKey}>{expectedKey ?? "N/A"}</Text>
      </View>
      <NativeRetrievalDetails
        copy={copy}
        snapshot={snapshot}
        textAlign={textAlign}
      />
      {!snapshot.keyConfirmed ? (
        <>
          <NativeParkingQrInput
            auth={auth}
            disabled={submitting}
            closeLabel={copy.closeScanner}
            kind="key-slot"
            inputStyle={s.keyInput}
            hideIdleStatus
            label={copy.enterKeySlotCode}
            labelStyle={s.fieldLabel}
            locale={locale}
            manualHint={copy.manualHint}
            onChange={(value) => retrieval.enterKeySlot(value)}
            placeholder={copy.enterKeySlotCode}
            openLabel={copy.scanQr}
            openVariant="primary"
            scannerFirst
            value={snapshot.keySlotCandidate}
          />
          <EmployeeButton
            disabled={submitting || snapshot.keySlotCandidate.trim() === ""}
            label={copy.keyVerifyLabel}
            onPress={() => void retrieval.confirmKeySlot()}
          />
        </>
      ) : (
        <>
          <View style={s.successPanel}>
            <View style={s.successDot} />
            <Text
              style={[s.successText, employeeTextStyle("human", textAlign)]}
            >
              {copy.keySlotVerified} (
              <Text style={employeeTextStyle("identifier", textAlign)}>
                {expectedKey}
              </Text>
              )
            </Text>
          </View>
          <EmployeeButton
            busy={submitting}
            disabled={submitting}
            label={submitting ? copy.startingRetrieval : copy.startRetrieval}
            onPress={() => void retrieval.startRetrieval()}
          />
        </>
      )}
    </>
  );
}

export function NativeRetrievalRetrieving({
  copy,
  retrieval,
  snapshot,
  textAlign,
  onReportIssue,
}: StageProps & {
  readonly retrieval: EmployeeRetrievalSession;
  readonly onReportIssue?: (() => void) | undefined;
}) {
  const submitting = snapshot.phase === "submitting-ready";
  return (
    <>
      {snapshot.failure ? (
        <EmployeeError textAlign={textAlign}>
          {snapshot.failure.message}
        </EmployeeError>
      ) : null}
      {snapshot.retrievalStartedAt ? (
        <View style={s.elapsedCard}>
          <Text style={[s.elapsedLabel, employeeTextStyle("human", textAlign)]}>
            {copy.elapsed}
          </Text>
          <ElapsedValue startTimeIso={snapshot.retrievalStartedAt} />
        </View>
      ) : null}
      <NativeRetrievalDetails
        copy={copy}
        includeKey
        snapshot={snapshot}
        textAlign={textAlign}
      />
      <EmployeeButton
        busy={submitting}
        disabled={submitting}
        label={submitting ? copy.markingReady : copy.vehicleReady}
        onPress={() => void retrieval.markReady()}
      />
      {onReportIssue ? (
        <EmployeeButton
          label={copy.reportIssue}
          onPress={onReportIssue}
          variant="secondary"
        />
      ) : null}
    </>
  );
}

export function NativeRetrievalReady({
  copy,
  onBack,
  snapshot,
  textAlign,
}: StageProps & { readonly onBack: () => void }) {
  return (
    <>
      <EmployeeBadge
        label={copy.readyTitle}
        textAlign={textAlign}
        variant="success"
      />
      <NativeRetrievalDetails
        copy={copy}
        includeKey
        snapshot={snapshot}
        textAlign={textAlign}
      />
      <EmployeeButton label={copy.backToTasks} onPress={onBack} />
    </>
  );
}

function ElapsedValue({ startTimeIso }: { readonly startTimeIso: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(
    0,
    Math.floor((now - Date.parse(startTimeIso)) / 1_000),
  );
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return (
    <Text
      style={s.elapsedValue}
    >{`${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`}</Text>
  );
}

export function NativeRetrievalRecover({
  body,
  copy,
  onBack,
  onCheck,
  textAlign,
  title,
}: {
  readonly body: string;
  readonly copy: NativeRetrievalCopy;
  readonly onBack?: (() => void) | undefined;
  readonly onCheck: () => void;
  readonly textAlign: "left" | "right";
  readonly title: string;
}) {
  return (
    <>
      <EmployeeErrorNotice textAlign={textAlign} title={title}>
        {body}
      </EmployeeErrorNotice>
      <EmployeeButton label={copy.checkState} onPress={onCheck} />
      {onBack ? (
        <EmployeeButton
          label={copy.backToTasks}
          onPress={onBack}
          variant="secondary"
        />
      ) : null}
    </>
  );
}
