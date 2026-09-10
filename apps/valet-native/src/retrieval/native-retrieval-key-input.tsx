import { useEffect, useState } from "react";
import type {
  EmployeeRetrievalSession,
  EmployeeRetrievalSnapshot,
  NativeAuthSession,
} from "@valet/employee-client";

import { EmployeeButton } from "../employee-ui/employee-controls";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { NativeParkingQrInput } from "../parking/native-parking-qr-input";
import type { NativeRetrievalCopy } from "./native-retrieval-copy";
import {
  initialKeyCandidate,
  updateKeyCandidate,
} from "./native-retrieval-presentation";
import { nativeRetrievalStyles as s } from "./native-retrieval-styles";

export function NativeRetrievalKeyInput({
  auth,
  copy,
  expectedKey,
  locale,
  retrieval,
  snapshot,
  submitting,
}: {
  readonly auth: NativeAuthSession;
  readonly copy: NativeRetrievalCopy;
  readonly expectedKey: string | null;
  readonly locale: FoundationLocale;
  readonly retrieval: EmployeeRetrievalSession;
  readonly snapshot: EmployeeRetrievalSnapshot;
  readonly submitting: boolean;
}) {
  const [candidate, setCandidate] = useState(() =>
    initialKeyCandidate(expectedKey),
  );
  useEffect(() => {
    if (candidate !== snapshot.keySlotCandidate)
      retrieval.enterKeySlot(candidate);
  }, [candidate, retrieval, snapshot.keySlotCandidate]);
  const updateCandidate = (value: string) => {
    const next = updateKeyCandidate(value);
    setCandidate(next);
    retrieval.enterKeySlot(next);
  };

  return (
    <>
      <NativeParkingQrInput
        auth={auth}
        closeLabel={copy.closeScanner}
        disabled={submitting}
        hideIdleStatus
        inputStyle={s.keyInput}
        kind="key-slot"
        label={copy.enterKeySlotCode}
        labelStyle={s.fieldLabel}
        locale={locale}
        manualHint={copy.manualHint}
        onChange={updateCandidate}
        openHeight={48}
        openLabel={copy.scanQr}
        openRadius={12}
        openVariant="navy"
        placeholder={copy.enterKeySlotCode}
        scannerContentStyle={s.scannerSection}
        scannerFirst
        value={candidate}
      />
      <EmployeeButton
        disabled={submitting || candidate.trim() === ""}
        label={copy.keyVerifyLabel}
        onPress={() => void retrieval.confirmKeySlot()}
      />
    </>
  );
}
