"use client";

import type { StaffMfaStateValue } from "@valet/contracts";
import { useEffect, useRef } from "react";

import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { Button } from "../presentation/button";
import { styles as administrationStyles } from "../../features/administration/administration-ui";
import helpStyles from "../foundation/help-foundation.module.css";
import {
  EnrollmentCeremony,
  RecoveryCodesDisclosure,
  RecoveryForm,
  TotpForm,
} from "./mfa-ceremonies";
import type { AccountSecurityCeremonyState } from "./use-account-security-ceremony";

export function AccountSecurityPanel({
  ceremony,
  mfaState,
}: {
  readonly ceremony: AccountSecurityCeremonyState;
  readonly mfaState: StaffMfaStateValue;
}) {
  const { t } = useDashboardLocale();
  const errorId = ceremony.errorKey ? "account-security-ceremony-error" : undefined;
  const restoreReissueFocusRef = useRef(false);

  useEffect(() => {
    if (ceremony.recoveryCodes || !restoreReissueFocusRef.current) return;
    restoreReissueFocusRef.current = false;
    document.getElementById("account-security-reissue")?.focus();
  }, [ceremony.recoveryCodes]);

  return (
    <section className={helpStyles.card}>
      <div className="stack">
        <div>
          <h2>{t("mfa")}</h2>
          <p className="muted">{t("mfaIntro")}</p>
        </div>
        {ceremony.errorKey ? (
          <div className={administrationStyles.error} id={errorId} role="alert">
            {t(ceremony.errorKey)}
          </div>
        ) : null}
        {ceremony.recoveryCodes ? (
          <RecoveryCodesDisclosure
            codes={ceremony.recoveryCodes}
            onDone={() => {
              restoreReissueFocusRef.current = true;
              ceremony.finishRecoveryCodes();
            }}
          />
        ) : ceremony.enrollment ? (
          <EnrollmentCeremony
            busy={ceremony.busy}
            enrollment={ceremony.enrollment}
            errorId={errorId}
            onCancel={() => void ceremony.closeEnrollment()}
            onConfirm={ceremony.confirmEnrollment}
          />
        ) : mfaState === "ENROLLMENT_REQUIRED" ||
          mfaState === "ENROLLMENT_PENDING" ? (
          <div className="stack">
            <p className="muted">
              {t(
                mfaState === "ENROLLMENT_REQUIRED"
                  ? "mfaEnrollmentRequiredBody"
                  : "mfaEnrollmentPendingBody",
              )}
            </p>
            <Button
              disabled={ceremony.busy}
              onClick={() => void ceremony.beginEnrollment()}
              type="button"
            >
              {t(
                mfaState === "ENROLLMENT_REQUIRED"
                  ? "mfaBeginEnrollment"
                  : "mfaContinueEnrollment",
              )}
            </Button>
          </div>
        ) : mfaState === "STEP_UP_REQUIRED" ? (
          <div className="stack">
            <p className="muted">{t("mfaStepUpBody")}</p>
            <TotpForm
              busy={ceremony.busy}
              errorId={errorId}
              onSubmit={ceremony.stepUp}
              submitLabel="mfaVerify"
            />
            <div>
              <h2>{t("mfaRecoveryTitle")}</h2>
              <p className="muted">{t("mfaRecoveryBody")}</p>
            </div>
            <RecoveryForm
              busy={ceremony.busy}
              errorId={errorId}
              onSubmit={ceremony.beginRecovery}
            />
          </div>
        ) : (
          <div className="stack">
            <p className="muted">{t("mfaAssuredBody")}</p>
            {ceremony.reissueOpen ? (
              <div className="stack">
                <p className="muted">{t("mfaReissueBody")}</p>
                <TotpForm
                  busy={ceremony.busy}
                  errorId={errorId}
                  focusOnMount
                  onSubmit={ceremony.reissueRecoveryCodes}
                  submitLabel="mfaReissueRecoveryCodes"
                />
                <Button
                  disabled={ceremony.busy}
                  onClick={() => ceremony.setReissueOpen(false)}
                  type="button"
                  variant="quiet"
                >
                  {t("mfaCancelCeremony")}
                </Button>
              </div>
            ) : (
              <Button
                disabled={ceremony.busy}
                id="account-security-reissue"
                onClick={() => ceremony.setReissueOpen(true)}
                type="button"
                variant="secondary"
              >
                {t("mfaReissueRecoveryCodes")}
              </Button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
