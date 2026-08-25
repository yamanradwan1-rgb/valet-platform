"use client";

import { useState, type JSX } from "react";
import {
  BackHeader,
  Badge,
  Btn,
  ElapsedTimer,
  InfoRow,
  SuccessCircle,
} from "../../ui/employee-primitives";
import { useEmployeeI18n } from "../../shell/employee-i18n";
import {
  resourceQrScanLabels,
  ResourceQrScanSection,
} from "../../scanner/resource-qr-scan-section";

export function LiveRetrievalKeyCheckoutStep({
  expectedKey,
  isKeyConfirmed,
  isSubmitting,
  error,
  vehicleInfo,
  parkingLocation,
  onConfirmKey,
  onStartRetrieval,
  onBack,
}: {
  readonly error: string | null;
  readonly expectedKey: string | null;
  readonly isKeyConfirmed: boolean;
  readonly isSubmitting: boolean;
  readonly onBack: () => void;
  readonly onConfirmKey: (input: string) => boolean;
  readonly onStartRetrieval: () => Promise<void>;
  readonly parkingLocation: string | null;
  readonly vehicleInfo: string;
}): JSX.Element {
  const { t } = useEmployeeI18n();
  const [inputKey, setInputKey] = useState(expectedKey ?? "");

  const handleVerify = () => {
    onConfirmKey(inputKey);
  };

  return (
    <div>
      <BackHeader title={t.keyCheckout} onBack={onBack} />
      <div className="p-5 space-y-5">
        {error && (
          <div className="p-3 bg-red-50 border border-vdanger/20 rounded-xl text-vdanger text-xs">
            {error}
          </div>
        )}

        <div className="bg-ice rounded-2xl p-6 text-center">
          <p className="text-neutral text-xs uppercase tracking-wider mb-2">
            {t.expectedKeySlot}
          </p>
          <p className="font-heading font-bold text-[48px] text-navy">
            <bdi dir="ltr">{expectedKey ?? "N/A"}</bdi>
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-vborder divide-y divide-vborder">
          <InfoRow label={t.vehicle} value={<bdi dir="ltr">{vehicleInfo}</bdi>} />
          {parkingLocation && (
            <InfoRow label={t.location} value={<bdi dir="ltr">{parkingLocation}</bdi>} />
          )}
        </div>

        {!isKeyConfirmed ? (
          <div className="space-y-3">
            {/* DEC-067: camera capture fills the existing key-slot input;
                Verify Key Slot remains the only mutation trigger. */}
            <ResourceQrScanSection
              expectedKind="key-slot"
              labels={resourceQrScanLabels(t, "key-slot")}
              onDecoded={setInputKey}
            />
            <div>
              <label className="text-neutral text-xs font-semibold uppercase tracking-wider block mb-1">
                {t.enterKeySlotCode}
              </label>
              <input
                value={inputKey}
                dir="ltr"
                onChange={(e) => setInputKey(e.target.value)}
                placeholder={t.enterKeySlotCode}
                className="w-full text-center font-heading font-semibold text-xl text-navy bg-white border border-vborder rounded-xl h-12 focus:outline-none focus:border-vblue"
              />
            </div>
            <Btn
              label={t.verifyKeySlot}
              onClick={handleVerify}
              disabled={inputKey.trim() === ""}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-[#EEFBF5] border border-vsuccess/20 rounded-xl p-4 flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-vsuccess" />
              <span className="text-vsuccess font-semibold text-sm">
                {t.keySlotVerified} (<bdi dir="ltr">{expectedKey}</bdi>)
              </span>
            </div>
            <Btn
              label={isSubmitting ? t.startingRetrieval : t.startRetrievalAction}
              onClick={() => void onStartRetrieval()}
              disabled={isSubmitting}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function LiveRetrievalInProgressStep({
  vehicleHeading,
  vehicleInfo,
  keyInfo,
  parkingLocation,
  retrievalStartedAt,
  isSubmitting,
  error,
  onMarkReady,

  onReportIssue,
}: {
  readonly error: string | null;
  readonly isSubmitting: boolean;
  readonly keyInfo: string;
  readonly onMarkReady: () => Promise<void>;

  readonly onReportIssue?: (() => void) | undefined;
  readonly parkingLocation: string | null;
  readonly retrievalStartedAt: string | null;
  readonly vehicleHeading: string;
  readonly vehicleInfo: string;
}): JSX.Element {
  const { t } = useEmployeeI18n();
  return (
    <div>
      <div className="bg-white border-b border-vborder px-5 py-4 flex items-center justify-between">
        <div>
          <Badge variant="retrieval" />
          <p className="font-heading font-bold text-xl text-navy mt-2">
            {t.retrievingLabel} {vehicleHeading}
          </p>
        </div>
      </div>
      <div className="p-5 space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-vdanger/20 rounded-xl text-vdanger text-xs">
            {error}
          </div>
        )}
        {retrievalStartedAt && (
          <div className="bg-white rounded-2xl border border-vborder p-5 flex flex-col items-center gap-1">
            <p className="text-muted text-xs uppercase tracking-wider">
              {t.elapsed}
            </p>
            <ElapsedTimer startTimeIso={retrievalStartedAt} />
          </div>
        )}
        <div className="bg-white rounded-2xl border border-vborder divide-y divide-vborder">
          <InfoRow label={t.vehicle} value={<bdi dir="ltr">{vehicleInfo}</bdi>} />
          <InfoRow label={t.key} value={<bdi dir="ltr">{keyInfo}</bdi>} />
          {parkingLocation && (
            <InfoRow label={t.location} value={<bdi dir="ltr">{parkingLocation}</bdi>} />
          )}
        </div>
        <Btn
          label={isSubmitting ? t.markingReady : t.vehicleReadyTitle}
          onClick={() => void onMarkReady()}
          disabled={isSubmitting}
        />
        {onReportIssue && (
          <Btn label={t.reportIssue} variant="secondary" onClick={onReportIssue} />
        )}
      </div>
    </div>
  );
}

export function LiveRetrievalVehicleReadyStep({
  vehicleInfo,
  keyInfo,
  parkingLocation,
  onDone,
}: {
  readonly keyInfo: string;
  readonly onDone: () => void;
  readonly parkingLocation: string | null;
  readonly vehicleInfo: string;
}): JSX.Element {
  const { t } = useEmployeeI18n();
  return (
    <div className="flex flex-col items-center justify-center min-h-[500px] p-6 space-y-6">
      <SuccessCircle />
      <div className="text-center">
        <p className="font-heading font-bold text-2xl text-navy">
          {t.vehicleReadyTitle}
        </p>
        <p className="text-vsuccess text-sm font-semibold mt-1">
          {t.readyForGuest}
        </p>
      </div>
      <div className="w-full bg-white rounded-2xl border border-vborder divide-y divide-vborder">
        <InfoRow label={t.vehicle} value={<bdi dir="ltr">{vehicleInfo}</bdi>} />
        <InfoRow label={t.key} value={<bdi dir="ltr">{keyInfo}</bdi>} />
        {parkingLocation && (
          <InfoRow label={t.location} value={<bdi dir="ltr">{parkingLocation}</bdi>} />
        )}
      </div>
      <div className="w-full">
        <Btn label={t.done} onClick={onDone} />
      </div>
    </div>
  );
}
