"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { Button } from "../presentation/button";
import { AccountSecurityPanel } from "./account-security-panel";
import { useAccountSecurityAccess } from "./account-security-access-provider";
import { mfaErrorKey } from "./mfa-ui";
import { useAccountSecurityCeremony } from "./use-account-security-ceremony";

const stateKey = {
  ASSURED: "mfaStatusAssured",
  ENROLLMENT_PENDING: "mfaStatusEnrollmentPending",
  ENROLLMENT_REQUIRED: "mfaStatusEnrollmentRequired",
  STEP_UP_REQUIRED: "mfaStatusStepUpRequired",
} as const;

export function AccountSecurityStandalone({
  generationKey,
  onAssured,
}: {
  readonly generationKey: string;
  readonly onAssured: () => void;
}) {
  const { t } = useDashboardLocale();
  const { refreshState, snapshot } = useAccountSecurityAccess();
  const ceremony = useAccountSecurityCeremony();
  const assuranceWasRequired = useRef(false);
  const freshCycleComplete = useRef(false);
  const onAssuredRef = useRef(onAssured);
  const recoveryCodesPending = useRef(false);

  useEffect(() => { onAssuredRef.current = onAssured; }, [onAssured]);
  useLayoutEffect(() => {
    recoveryCodesPending.current = ceremony.recoveryCodes !== null;
  }, [ceremony.recoveryCodes]);

  useEffect(() => {
    let active = true;
    assuranceWasRequired.current = false;
    freshCycleComplete.current = false;
    void refreshState().then((result) => {
      if (!active) return;
      freshCycleComplete.current = true;
      if (result.status === "eligible" && result.state === "ASSURED" &&
          !recoveryCodesPending.current) {
        onAssuredRef.current();
      } else {
        assuranceWasRequired.current = true;
      }
    });
    return () => { active = false; };
  }, [generationKey, refreshState]);

  useEffect(() => {
    if (!freshCycleComplete.current) return;
    if (snapshot.status !== "eligible") return;
    if (snapshot.state !== "ASSURED") {
      assuranceWasRequired.current = true;
      return;
    }
    // Enrollment/recovery returns one-time codes which are only held in
    // component memory. Never unmount this panel on ASSURED until the Staff
    // member explicitly acknowledges saving those codes.
    if (ceremony.recoveryCodes !== null) return;
    if (assuranceWasRequired.current) {
      assuranceWasRequired.current = false;
      onAssuredRef.current();
    }
  }, [snapshot, ceremony.recoveryCodes]);

  if (snapshot.status === "checking") {
    return <p role="status">{t("mfaStatusChecking")}</p>;
  }
  if (snapshot.status === "ineligible" || snapshot.status === "error") {
    const message =
      snapshot.status === "ineligible"
        ? t("mfaErrorAuthorization")
        : t(mfaErrorKey(snapshot.error));
    return (
      <div className="stack">
        <p className="error-text" role="alert">{message}</p>
        {snapshot.status === "error" ? (
          <Button onClick={() => void refreshState()} type="button" variant="secondary">
            {t("retry")}
          </Button>
        ) : null}
      </div>
    );
  }
  return (
    <div className="stack">
      <p role="status">
        {t("mfaStatus")}: {t(stateKey[snapshot.state])}
      </p>
      <AccountSecurityPanel ceremony={ceremony} mfaState={snapshot.state} />
    </div>
  );
}
