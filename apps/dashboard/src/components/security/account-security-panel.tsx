"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  StaffMfaEnrollmentBeginResponse,
  StaffMfaStateValue,
} from "@valet/contracts";

import type { DashboardMfaClient } from "../../lib/mfa/dashboard-mfa-client";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import type { TranslationKey } from "../../lib/i18n/dictionaries";
import { Button } from "../presentation/button";
import { Panel } from "../presentation/panel";
import {
  EnrollmentCeremony,
  RecoveryCodesDisclosure,
  RecoveryForm,
  TotpForm,
} from "./mfa-ceremonies";
import {
  isUncertainMfaMutation,
  mfaErrorKey,
  shouldReconcileMfaMutation,
} from "./mfa-ui";

const stateLabel: Record<StaffMfaStateValue, TranslationKey> = {
  ASSURED: "mfaStatusAssured",
  ENROLLMENT_PENDING: "mfaStatusEnrollmentPending",
  ENROLLMENT_REQUIRED: "mfaStatusEnrollmentRequired",
  STEP_UP_REQUIRED: "mfaStatusStepUpRequired",
};

interface AccountSecurityPanelProps {
  readonly client: DashboardMfaClient;
  readonly onStateChange?: (state: StaffMfaStateValue) => void;
}

export function AccountSecurityPanel({ client, onStateChange }: AccountSecurityPanelProps) {
  const { t } = useDashboardLocale();
  const [mfaState, setMfaState] = useState<StaffMfaStateValue | null>(null);
  const [enrollment, setEnrollment] = useState<StaffMfaEnrollmentBeginResponse | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<readonly string[] | null>(null);
  const [reissueOpen, setReissueOpen] = useState(false);
  const [busy, setBusy] = useState(true);
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);
  const mounted = useRef(false);
  const request = useRef<AbortController | null>(null);

  const publishState = useCallback(
    (state: StaffMfaStateValue) => {
      setMfaState(state);
      onStateChange?.(state);
    },
    [onStateChange],
  );

  const clearSensitive = useCallback(() => {
    setEnrollment(null);
    setRecoveryCodes(null);
  }, []);

  const readState = useCallback(
    async (signal?: AbortSignal) => {
      const response = await client.state(signal);
      if (!mounted.current) return;
      publishState(response.state);
    },
    [client, publishState],
  );

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    request.current = controller;
    void Promise.resolve()
      .then(() => {
        if (!mounted.current) return;
        setBusy(true);
        setErrorKey(null);
        return readState(controller.signal);
      })
      .catch((error: unknown) => {
        if (mounted.current) setErrorKey(mfaErrorKey(error));
      })
      .finally(() => {
        if (mounted.current) setBusy(false);
      });
    return () => {
      mounted.current = false;
      request.current?.abort();
      request.current = null;
    };
  }, [readState]);

  const runMutation = useCallback(
    async (operation: (signal: AbortSignal) => Promise<void>) => {
      const controller = new AbortController();
      request.current = controller;
      setBusy(true);
      setErrorKey(null);
      try {
        await operation(controller.signal);
      } catch (error: unknown) {
        if (!mounted.current) return;
        if (shouldReconcileMfaMutation(error)) {
          const uncertain = isUncertainMfaMutation(error);
          clearSensitive();
          setReissueOpen(false);
          try {
            await readState(controller.signal);
            if (mounted.current) setErrorKey(uncertain ? "mfaErrorUncertain" : mfaErrorKey(error));
          } catch {
            if (mounted.current) setErrorKey("mfaErrorStateRead");
          }
        } else {
          setErrorKey(mfaErrorKey(error));
        }
      } finally {
        if (request.current === controller) request.current = null;
        if (mounted.current) setBusy(false);
      }
    },
    [clearSensitive, readState],
  );

  const beginEnrollment = () =>
    runMutation(async (signal) => {
      const result = await client.beginEnrollment(signal);
      if (!mounted.current) return;
      setEnrollment(result);
      setRecoveryCodes(null);
      setReissueOpen(false);
      publishState("ENROLLMENT_PENDING");
    });

  const confirmEnrollment = (code: string) =>
    runMutation(async (signal) => {
      if (!enrollment) return;
      const result = await client.confirmEnrollment({ factorId: enrollment.factorId, code }, signal);
      if (!mounted.current) return;
      setEnrollment(null);
      setRecoveryCodes(result.recoveryCodes);
      publishState("ASSURED");
    });

  const stepUp = (code: string) =>
    runMutation(async (signal) => {
      const result = await client.stepUp({ code }, signal);
      if (mounted.current) publishState(result.state);
    });

  const beginRecovery = (recoveryCode: string) =>
    runMutation(async (signal) => {
      const result = await client.beginRecovery({ recoveryCode }, signal);
      if (!mounted.current) return;
      setEnrollment(result);
      setRecoveryCodes(null);
      publishState("ENROLLMENT_PENDING");
    });

  const reissueRecoveryCodes = (code: string) =>
    runMutation(async (signal) => {
      const result = await client.reissueRecoveryCodes({ code }, signal);
      if (!mounted.current) return;
      setRecoveryCodes(result.recoveryCodes);
      setReissueOpen(false);
      publishState("ASSURED");
    });

  const closeEnrollment = () => {
    clearSensitive();
    setErrorKey(null);
    void runMutation(async (signal) => readState(signal));
  };

  const status = busy && mfaState === null ? t("mfaStatusChecking") : mfaState ? t(stateLabel[mfaState]) : "";

  return (
    <Panel>
      <div className="stack">
        <div>
          <p className="eyebrow">{t("accountSecurity")}</p>
          <h1>{t("mfa")}</h1>
          <p className="muted">{t("mfaIntro")}</p>
        </div>
        <p aria-live="polite" role="status">
          <strong>{t("mfaStatus")}:</strong> {status}
        </p>
        {errorKey ? <p className="error-text" role="alert">{t(errorKey)}</p> : null}
        {recoveryCodes ? (
          <RecoveryCodesDisclosure codes={recoveryCodes} onDone={() => setRecoveryCodes(null)} />
        ) : enrollment ? (
          <EnrollmentCeremony
            busy={busy}
            enrollment={enrollment}
            onCancel={closeEnrollment}
            onConfirm={confirmEnrollment}
          />
        ) : mfaState === "ENROLLMENT_REQUIRED" || mfaState === "ENROLLMENT_PENDING" ? (
          <div className="stack">
            <p className="muted">
              {t(mfaState === "ENROLLMENT_REQUIRED" ? "mfaEnrollmentRequiredBody" : "mfaEnrollmentPendingBody")}
            </p>
            <Button disabled={busy} onClick={() => void beginEnrollment()} type="button">
              {t(mfaState === "ENROLLMENT_REQUIRED" ? "mfaBeginEnrollment" : "mfaContinueEnrollment")}
            </Button>
          </div>
        ) : mfaState === "STEP_UP_REQUIRED" ? (
          <div className="stack">
            <p className="muted">{t("mfaStepUpBody")}</p>
            <TotpForm busy={busy} onSubmit={stepUp} submitLabel="mfaVerify" />
            <div>
              <h2>{t("mfaRecoveryTitle")}</h2>
              <p className="muted">{t("mfaRecoveryBody")}</p>
            </div>
            <RecoveryForm busy={busy} onSubmit={beginRecovery} />
          </div>
        ) : mfaState === "ASSURED" ? (
          <div className="stack">
            <p className="muted">{t("mfaAssuredBody")}</p>
            {reissueOpen ? (
              <div className="stack">
                <p className="muted">{t("mfaReissueBody")}</p>
                <TotpForm busy={busy} onSubmit={reissueRecoveryCodes} submitLabel="mfaReissueRecoveryCodes" />
                <Button disabled={busy} onClick={() => setReissueOpen(false)} type="button" variant="quiet">
                  {t("mfaCancelCeremony")}
                </Button>
              </div>
            ) : (
              <Button disabled={busy} onClick={() => setReissueOpen(true)} type="button" variant="secondary">
                {t("mfaReissueRecoveryCodes")}
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
