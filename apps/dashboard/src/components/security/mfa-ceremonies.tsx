"use client";

import { useState, type FormEvent } from "react";
import type { StaffMfaEnrollmentBeginResponse } from "@valet/contracts";

import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { BidiText } from "../presentation/panel";
import { Button } from "../presentation/button";

interface TotpFormProps {
  readonly busy: boolean;
  readonly onSubmit: (code: string) => Promise<void>;
  readonly submitLabel: "mfaConfirmEnrollment" | "mfaVerify" | "mfaReissueRecoveryCodes";
}

export function TotpForm({ busy, onSubmit, submitLabel }: TotpFormProps) {
  const { t } = useDashboardLocale();
  const [code, setCode] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = code;
    setCode("");
    await onSubmit(value);
  };

  return (
    <form className="stack" onSubmit={(event) => void submit(event)}>
      <div className="field">
        <label htmlFor={`mfa-totp-${submitLabel}`}>{t("mfaTotpCode")}</label>
        <input
          autoComplete="one-time-code"
          disabled={busy}
          id={`mfa-totp-${submitLabel}`}
          inputMode="numeric"
          maxLength={6}
          minLength={6}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          pattern="[0-9]{6}"
          required
          type="text"
          value={code}
        />
      </div>
      <Button disabled={busy || code.length !== 6} type="submit">
        {t(submitLabel)}
      </Button>
    </form>
  );
}

export function RecoveryForm({
  busy,
  onSubmit,
}: {
  readonly busy: boolean;
  readonly onSubmit: (recoveryCode: string) => Promise<void>;
}) {
  const { t } = useDashboardLocale();
  const [recoveryCode, setRecoveryCode] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = recoveryCode.trim();
    setRecoveryCode("");
    await onSubmit(value);
  };

  return (
    <form className="stack" onSubmit={(event) => void submit(event)}>
      <div className="field">
        <label htmlFor="mfa-recovery-code">{t("mfaRecoveryCode")}</label>
        <input
          autoComplete="off"
          disabled={busy}
          id="mfa-recovery-code"
          onChange={(event) => setRecoveryCode(event.target.value)}
          required
          spellCheck={false}
          type="text"
          value={recoveryCode}
        />
      </div>
      <Button disabled={busy || recoveryCode.trim().length === 0} type="submit" variant="secondary">
        {t("mfaBeginRecovery")}
      </Button>
    </form>
  );
}

export function EnrollmentCeremony({
  busy,
  enrollment,
  onCancel,
  onConfirm,
}: {
  readonly busy: boolean;
  readonly enrollment: StaffMfaEnrollmentBeginResponse;
  readonly onCancel: () => void;
  readonly onConfirm: (code: string) => Promise<void>;
}) {
  const { t } = useDashboardLocale();
  return (
    <div className="stack">
      <div>
        <h2>{t("mfaSetupTitle")}</h2>
        <p className="muted">{t("mfaSetupInstructions")}</p>
      </div>
      <div className="field">
        <span>{t("mfaSetupSecret")}</span>
        <BidiText>{enrollment.provisioning.secretBase32}</BidiText>
        <p className="muted">{t("mfaSetupDetails")}</p>
      </div>
      <TotpForm busy={busy} onSubmit={onConfirm} submitLabel="mfaConfirmEnrollment" />
      <Button disabled={busy} onClick={onCancel} type="button" variant="quiet">
        {t("mfaCancelCeremony")}
      </Button>
    </div>
  );
}

export function RecoveryCodesDisclosure({
  codes,
  onDone,
}: {
  readonly codes: readonly string[];
  readonly onDone: () => void;
}) {
  const { t } = useDashboardLocale();
  return (
    <div className="stack">
      <div>
        <h2>{t("mfaRecoveryCodesTitle")}</h2>
        <p className="muted">{t("mfaRecoveryCodesBody")}</p>
        <p className="muted">{t("mfaRecoveryCodesWarning")}</p>
      </div>
      <ol>
        {codes.map((code) => (
          <li key={code}>
            <BidiText>{code}</BidiText>
          </li>
        ))}
      </ol>
      <Button onClick={onDone} type="button">
        {t("mfaRecoveryCodesDone")}
      </Button>
    </div>
  );
}
