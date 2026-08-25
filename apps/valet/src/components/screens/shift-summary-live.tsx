"use client";

import { useEffect, useState, type JSX } from "react";

import type { ResolvedOperationalScope } from "../../features/staff-operational-context";
import type { EndShiftPhase } from "../../features/shift";
import {
  formatEmployeeDateTime,
  formatShiftDuration,
  presentLiveError,
} from "../../lib/i18n/live-presentation";
import type { ShiftDurationUnitLabels } from "../../lib/i18n/live-presentation";
import { useOnlineStatus } from "../../lib/connectivity/use-online-status";
import { useEmployeeI18n } from "../shell/employee-i18n";
import { isCashEntryValid, normalizeCashEntry } from "./cash-entry";
import {
  Badge,
  Btn,
  InfoRow,
} from "../ui/employee-primitives";

export interface ShiftSummaryLiveProps {
  /** App-owned End Shift mutation (DEC-066 §4 ambiguous-outcome survival). */
  readonly endShift: (shiftId: string, cashReported: string) => void;
  readonly endShiftPhase: EndShiftPhase;
  readonly retryUncertainEndShift: () => void;
  readonly scope: ResolvedOperationalScope;
}

function ShiftElapsed({
  locale,
  startedIso,
  unitLabels,
}: {
  readonly locale: "ar" | "en";
  readonly startedIso: string;
  readonly unitLabels: ShiftDurationUnitLabels;
}): JSX.Element {
  const [elapsedSeconds, setElapsedSeconds] = useState(() =>
    computeElapsedSeconds(startedIso),
  );
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds(computeElapsedSeconds(startedIso));
    }, 1000);
    return () => clearInterval(timer);
  }, [startedIso]);
  return (
    <span className="font-heading font-bold text-navy text-sm">
      {formatShiftDuration(elapsedSeconds, locale, unitLabels)}
    </span>
  );
}

function computeElapsedSeconds(startedIso: string): number {
  const started = new Date(startedIso).getTime();
  if (Number.isNaN(started)) return 0;
  return Math.max(0, Math.floor((Date.now() - started) / 1000));
}

/**
 * Truthful Live Shift surface per DEC-066 §3/§4: authoritative operational
 * context only; no raw Shift UUID, no employee identity, no counters.
 */
export function ShiftSummaryLive({
  endShift,
  endShiftPhase,
  retryUncertainEndShift,
  scope,
}: ShiftSummaryLiveProps): JSX.Element {
  const { locale, t } = useEmployeeI18n();
  const isOnline = useOnlineStatus();

  const [cashInput, setCashInput] = useState("");
  const [confirming, setConfirming] = useState(false);

  const phase = endShiftPhase;

  const cashValid = isCashEntryValid(cashInput);

  const roleLabel =
    scope.role === "VALET_SUPERVISOR" ? t.roleValetSupervisor : t.roleValetEmployee;

  const mutationsLocked = !isOnline || phase.kind === "submitting";

  const openConfirm = (): void => setConfirming(true);
  const cancelConfirm = (): void => setConfirming(false);
  const submitEndShift = (): void => {
    if (!cashValid || mutationsLocked) return;
    endShift(scope.shiftId, normalizeCashEntry(cashInput));
    setConfirming(false);
  };

  const openWorkBlocked = phase.kind === "error" && phase.openWorkBlocked;
  const liveError =
    phase.kind === "error"
      ? phase.openWorkBlocked
        ? t.openWorkBlocksEndShift
        : presentLiveError(new Error(phase.message), locale, t)
      : null;

  return (
    <div className="p-5 space-y-5">
      <div>
        <h1 className="font-bold text-xl text-navy">{t.shiftNav}</h1>
        <p className="text-neutral text-sm mt-1">
          {t.organizationLabel} · {scope.organizationName}
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-vborder p-5 space-y-4">
        <div className="flex items-center justify-between">
          <Badge variant="active" />
          <span className="text-vsuccess text-xs font-semibold">
            {t.activeShiftLabel}
          </span>
        </div>
        <InfoRow label={t.organizationLabel} value={scope.organizationName} />
        <div className="flex items-start justify-between py-3 border-b border-vborder">
          <span className="text-neutral text-sm">{t.location}</span>
          <span className="text-right font-semibold text-sm text-navy max-w-[60%]">
            <span className="block">{scope.locationName}</span>
            <span className="block text-xs text-muted">
              <bdi dir="ltr">{scope.locationCode}</bdi>
            </span>
          </span>
        </div>
        <InfoRow label={t.roleLabel} value={roleLabel} />
        <InfoRow
          label={t.startedAtLabel}
          value={formatEmployeeDateTime(scope.shiftStartedAt, locale)}
        />
        <div className="pt-3 border-t border-vborder flex items-center justify-between">
          <span className="text-muted text-xs uppercase tracking-wider">
            {t.elapsed}
          </span>
          <ShiftElapsed
            locale={locale}
            startedIso={scope.shiftStartedAt}
            unitLabels={{
              day: t.durationDayShort,
              hour: t.durationHourShort,
              minute: t.durationMinuteShort,
            }}
          />
        </div>
      </div>

      {phase.kind === "ended" ? (
        <div className="bg-[#EEFBF5] border border-vsuccess/20 rounded-2xl p-5 space-y-2">
          <p className="font-heading font-bold text-navy text-lg">
            {t.shiftEndedTitle}
          </p>
          <InfoRow
            label={t.cashExpectedLabel}
            value={
              <bdi dir="ltr">
                {phase.result.cashReconciliation.cashExpected}
              </bdi>
            }
          />
          <InfoRow
            label={t.cashReportedLabel}
            value={
              <bdi dir="ltr">
                {phase.result.cashReconciliation.cashReported}
              </bdi>
            }
          />
          <InfoRow
            label={t.cashVarianceLabel}
            value={
              <bdi dir="ltr">
                {phase.result.cashReconciliation.cashVariance}{" "}
                {phase.result.cashReconciliation.currency}
              </bdi>
            }
          />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-vborder p-5 space-y-4">
          <label className="text-neutral text-xs font-semibold uppercase tracking-wider block">
            {t.cashReportedLabel}{" "}
            <bdi dir="ltr">{scope.currency}</bdi>
          </label>
          <p className="text-muted text-xs leading-relaxed">
            {t.cashReportedHelper}
          </p>
          <input
            value={cashInput}
            dir="ltr"
            inputMode="decimal"
            onChange={(e) => setCashInput(e.target.value)}
            placeholder={t.cashAmountPlaceholder}
            className="w-full text-center font-heading font-semibold text-xl text-navy bg-warm border border-vborder rounded-xl h-12 focus:outline-none focus:border-vblue"
          />
          {!isOnline && (
            <p className="text-vdanger text-xs font-semibold">
              {t.noNetworkMessage}
            </p>
          )}
          {phase.kind === "uncertain" && (
            <div className="bg-ice border border-vborder rounded-xl p-3 space-y-2">
              <p className="text-navy text-xs font-semibold leading-relaxed">
                {t.endShiftUncertain}
              </p>
              <Btn
                label={t.retryEndShift}
                onClick={() => retryUncertainEndShift()}
                variant="secondary"
                size="md"
                disabled={!isOnline}
              />
            </div>
          )}
          {liveError !== null && (
            <p
              className={`text-xs font-semibold ${
                openWorkBlocked ? "text-navy" : "text-vdanger"
              }`}
            >
              {liveError}
            </p>
          )}
          {!confirming ? (
            <Btn
              label={phase.kind === "submitting" ? t.endingShift : t.endShiftAction}
              onClick={openConfirm}
              variant="danger"
              disabled={mutationsLocked || !cashValid || phase.kind === "uncertain"}
            />
          ) : (
            <div className="space-y-3">
              <p className="text-navy text-sm font-semibold leading-relaxed">
                {t.endShiftConfirmMessage}
              </p>
              <Btn
                label={
                  phase.kind === "submitting" ? t.endingShift : t.confirmEndShift
                }
                onClick={submitEndShift}
                variant="danger"
                disabled={mutationsLocked || !cashValid}
              />
              <Btn
                label={t.cancelAction}
                onClick={cancelConfirm}
                variant="secondary"
                size="md"
                disabled={mutationsLocked}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
