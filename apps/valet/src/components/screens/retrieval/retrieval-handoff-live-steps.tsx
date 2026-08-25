"use client";

import { useState, type JSX } from "react";

import { BackHeader, Btn } from "../../ui/employee-primitives";
import {
  DYNAMIC_QR_PATTERN,
  PICKUP_CODE_PATTERN,
} from "../../../features/handoff/handoff-types";
import { useEmployeeI18n } from "../../shell/employee-i18n";
import { HandoffQrScanSection } from "../../scanner/handoff-qr-scan-section";

export interface LiveReadyHandoffLaunchProps {
  readonly error: string | null;
  readonly isInitiating: boolean;
  readonly keyInfo: string;
  readonly onBeginHandoff: () => void;
  readonly onOpenIncident?: (() => void) | undefined;
  readonly vehicleInfo: string;
}

export function LiveReadyHandoffLaunchStep({
  error,
  isInitiating,
  keyInfo,
  onBeginHandoff,
  onOpenIncident,
  vehicleInfo,
}: LiveReadyHandoffLaunchProps): JSX.Element {
  const { t } = useEmployeeI18n();
  return (
    <div>
      <BackHeader title={t.vehicleReadyTitle} />
      <div className="p-5 space-y-4">
        <div className="bg-white rounded-2xl border border-vborder p-4">
          <p className="text-muted text-[10px] font-bold uppercase tracking-widest">
            {t.readyForPickup}
          </p>
          <p className="font-heading font-bold text-navy text-lg mt-1">
            <bdi dir="ltr">{vehicleInfo}</bdi>
          </p>
          <p className="text-neutral text-xs mt-1">{t.key} · <bdi dir="ltr">{keyInfo}</bdi></p>
        </div>

        {error !== null && (
          <div className="p-3 bg-red-50 border border-vdanger/20 rounded-xl text-vdanger text-xs">
            {error}
          </div>
        )}

        <Btn
          disabled={isInitiating}
          label={isInitiating ? t.startingHandoff : t.beginGuestHandoff}
          onClick={onBeginHandoff}
        />
        {onOpenIncident && (
          <button
            type="button"
            className="w-full h-11 text-muted text-sm font-semibold cursor-pointer hover:text-white transition-colors"
            onClick={onOpenIncident}
          >
            {t.reportIssue}
          </button>
        )}
      </div>
    </div>
  );
}

export interface LiveHandoffPendingProps {
  readonly abortError: string | null;
  readonly error: string | null;
  readonly isMutating: boolean;
  readonly isSupervisor: boolean;
  readonly onAbort: (reason: string) => void;
  readonly onOpenIncident?: (() => void) | undefined;

  readonly onOverride: (reason: string) => void;
  readonly onVerifyPickupCode: (pickupCode: string) => void;
  readonly onVerifyQrPayload: (qrPayload: string) => void;
  readonly retryAfterSeconds: number | null;
  readonly vehicleInfo: string;
}

export function LiveHandoffPendingStep({
  abortError,
  error,
  isMutating,
  isSupervisor,
  onAbort,
  onOverride,

  onOpenIncident,
  onVerifyPickupCode,
  onVerifyQrPayload,
  retryAfterSeconds,
  vehicleInfo,
}: LiveHandoffPendingProps): JSX.Element {
  const { t } = useEmployeeI18n();
  const [code, setCode] = useState("");
  const [qrPayload, setQrPayload] = useState("");
  const [reason, setReason] = useState("");
  const codeValid = PICKUP_CODE_PATTERN.test(code);
  const qrValid = DYNAMIC_QR_PATTERN.test(qrPayload);

  return (
    <div>
      <BackHeader title={t.guestHandoffTitle} />
      <div className="p-5 space-y-4">
        <div className="bg-white rounded-2xl border border-vborder p-4">
          <p className="text-muted text-[10px] font-bold uppercase tracking-widest">
            {t.awaitingGuestProof}
          </p>
          <p className="font-heading font-bold text-navy text-lg mt-1">
            <bdi dir="ltr">{vehicleInfo}</bdi>
          </p>
        </div>

        {error !== null && (
          <div className="p-3 bg-red-50 border border-vdanger/20 rounded-xl text-vdanger text-xs">
            {error}
            {retryAfterSeconds !== null && retryAfterSeconds > 0
              ? ` ${t.retryIn} ${String(retryAfterSeconds)}s.`
              : ""}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-vborder p-4 space-y-3">
          <label className="block text-navy text-sm font-bold">
            {t.pickupCodeLabel}
          </label>
          <input
            autoComplete="one-time-code"
            className="w-full h-12 rounded-xl bg-warm border border-vborder px-4 text-navy text-lg tracking-[0.3em] outline-none focus:border-vblue"
            inputMode="numeric"
            dir="ltr"
            maxLength={4}
            onChange={(e) =>
              setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))
            }
            placeholder="0000"
            value={code}
          />
          <Btn
            disabled={!codeValid || isMutating}
            label={t.verifyCode}
            onClick={() => {
              // Raw proof is ephemeral: cleared after every submission,
              // success or failure alike.
              const submitted = code;
              setCode("");
              onVerifyPickupCode(submitted);
            }}
          />
        </div>

        <div className="bg-white rounded-2xl border border-vborder p-4 space-y-3">
          <label className="block text-navy text-sm font-bold">
            {t.guestQrCode}
          </label>
          {/* DEC-067: camera capture fills the existing raw vhq1.* proof
              input; the existing Verify QR action below stays the only
              verification trigger and keeps clearing the proof after every
              submission. Scanning never marks the handoff verified. */}
          <HandoffQrScanSection onCaptured={setQrPayload} t={t} />
          <input
            className="w-full h-12 rounded-xl bg-warm border border-vborder px-4 text-navy text-xs outline-none focus:border-vblue"
            dir="ltr"
            onChange={(e) => setQrPayload(e.target.value.trim())}
            placeholder="vhq1.…"
            value={qrPayload}
          />
          <Btn
            disabled={!qrValid || isMutating}
            label={t.verifyQr}
            onClick={() => {
              const submitted = qrPayload;
              setQrPayload("");
              onVerifyQrPayload(submitted);
            }}
          />
        </div>

        {isSupervisor && (
          <div className="bg-white rounded-2xl border border-vborder p-4 space-y-3">
            <label className="block text-navy text-sm font-bold">
              {t.supervisorOverrideLabel}
            </label>
            <textarea
              className="w-full h-20 rounded-xl bg-warm border border-vborder p-3 text-navy text-sm outline-none focus:border-vblue"
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t.reasonRequired}
              value={reason}
            />
            <Btn
              disabled={reason.trim().length === 0 || isMutating}
              label={t.overrideVerification}
              onClick={() => onOverride(reason.trim())}
            />
          </div>
        )}

        {onOpenIncident && (


          <button type="button" onClick={onOpenIncident} className="w-full h-11 text-muted text-sm font-semibold cursor-pointer hover:text-white transition-colors">


            {t.reportIssue}


          </button>


        )}



        <div className="bg-white rounded-2xl border border-vborder p-4 space-y-3">
          <label className="block text-navy text-sm font-bold">{t.abort}</label>
          <textarea
            className="w-full h-16 rounded-xl bg-warm border border-vborder p-3 text-navy text-sm outline-none focus:border-vblue"
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t.reasonRequired}
            value={reason}
          />
          {abortError !== null && (
            <p className="text-vdanger text-xs">{abortError}</p>
          )}
          <Btn
            disabled={reason.trim().length === 0 || isMutating}
            label={t.abortHandoff}
            onClick={() => onAbort(reason.trim())}
          />
        </div>
      </div>
    </div>
  );
}
