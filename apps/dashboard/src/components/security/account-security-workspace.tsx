"use client";

import { useEffect, useRef } from "react";

import { mfaErrorKey } from "./mfa-ui";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { Button } from "../presentation/button";
import { styles as administrationStyles } from "../../features/administration/administration-ui";
import helpStyles from "../foundation/help-foundation.module.css";
import { useAccountSecurityAccess } from "./account-security-access-provider";
import { AccountContextHelp } from "../../features/help/account-context-help";
import helpSlot from "../../features/help/help-slot.module.css";
import { AccountSecurityPanel } from "./account-security-panel";
import { useAccountSecurityCeremony } from "./use-account-security-ceremony";

const stateKey = {
  ASSURED: "mfaStatusAssured",
  ENROLLMENT_PENDING: "mfaStatusEnrollmentPending",
  ENROLLMENT_REQUIRED: "mfaStatusEnrollmentRequired",
  STEP_UP_REQUIRED: "mfaStatusStepUpRequired",
} as const;

export function AccountSecurityWorkspace({ ready = true }: { readonly ready?: boolean }) {
  const { t } = useDashboardLocale();
  const access = useAccountSecurityAccess();
  const ceremony = useAccountSecurityCeremony();
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);
  const snapshot = ready ? access.snapshot : null;
  const sensitiveDisclosure = Boolean(ceremony.enrollment || ceremony.recoveryCodes);
  const status =
    snapshot?.status === "eligible"
      ? t(stateKey[snapshot.state])
      : snapshot?.status === "checking" || snapshot === null
        ? t("mfaStatusChecking")
        : t("mfaStatusUnavailable");
  const readError =
    snapshot?.status === "ineligible"
      ? t("mfaErrorAuthorization")
      : snapshot?.status === "error"
        ? t(mfaErrorKey(snapshot.error))
        : null;

  return (
    <div className={helpStyles.page}>
      <header className={helpSlot.anchor}>
        <h1 ref={titleRef} tabIndex={-1}>{t("security")}</h1>
        {snapshot?.status === "eligible" && !sensitiveDisclosure ? (
          <span className={helpSlot.corner}><AccountContextHelp helpKey="security.page" /></span>
        ) : null}
        <p>{t("securityIntro")}</p>
      </header>
      <section className={helpStyles.card}>
        <div className="stack">
          <div className={helpSlot.anchor}>
            <h2>{t("mfaStatus")}</h2>
            {snapshot?.status === "eligible" && !sensitiveDisclosure ? (
              <span className={helpSlot.corner}><AccountContextHelp helpKey="security.sessions" /></span>
            ) : null}
            <p className="muted" role="status">
              {t("mfaStatus")}: {status}
            </p>
          </div>
          {readError ? (
            <div className={administrationStyles.error} role="alert">
              {readError}
            </div>
          ) : null}
          {snapshot?.status === "error" ? (
            <Button
              onClick={() => void access.refreshState()}
              type="button"
              variant="secondary"
            >
              {t("retry")}
            </Button>
          ) : null}
        </div>
      </section>
      {snapshot?.status === "eligible" ? (
        <AccountSecurityPanel ceremony={ceremony} mfaState={snapshot.state} />
      ) : null}
    </div>
  );
}
