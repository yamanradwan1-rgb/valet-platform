"use client";

import type { JSX } from "react";

import { BackHeader, Btn } from "../../ui/employee-primitives";
import type { HandoffVerificationSnapshot } from "../../../features/handoff/handoff-types";
import { useEmployeeI18n } from "../../shell/employee-i18n";

export interface LiveHandoffVerifiedProps {
  readonly canRelease: boolean;
  readonly error: string | null;
  readonly financialBlocked: boolean;
  readonly isReleasing: boolean;

  readonly onOpenIncident?: (() => void) | undefined;
  readonly onRelease: () => void;
  readonly verification: HandoffVerificationSnapshot;
  readonly vehicleInfo: string;
}

export function LiveHandoffVerifiedStep({
  canRelease,
  error,
  financialBlocked,
  isReleasing,
  onRelease,

  onOpenIncident,
  verification,
  vehicleInfo,
}: LiveHandoffVerifiedProps): JSX.Element {
  const { t } = useEmployeeI18n();
  const methodLabel =
    verification.method === "SUPERVISOR_OVERRIDE"
      ? t.supervisorOverrideLabel
      : verification.method === "PICKUP_CODE"
        ? t.pickupCodeLabel
        : t.guestQr;
  return (
    <div>
      <BackHeader title={t.identityVerified} />
      <div className="p-5 space-y-4">
        <div className="bg-white rounded-2xl border border-vborder p-4">
          <p className="text-muted text-[10px] font-bold uppercase tracking-widest">
            {t.identityVerified} · {methodLabel}
          </p>
          <p className="font-heading font-bold text-navy text-lg mt-1">
            <bdi dir="ltr">{vehicleInfo}</bdi>
          </p>
        </div>

        {financialBlocked && (
          <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-800 text-xs font-semibold">
            {t.releaseBlocked}
          </div>
        )}

        {error !== null && !financialBlocked && (
          <div className="p-3 bg-red-50 border border-vdanger/20 rounded-xl text-vdanger text-xs">
            {error}
          </div>
        )}

        {canRelease ? (
          <>
            <div className="bg-white rounded-2xl border border-vborder p-4 space-y-2">
              <p className="text-navy text-sm font-bold">{t.releaseVehicle}</p>
              <p className="text-neutral text-xs leading-relaxed">
                {t.cannotUndo}
              </p>
            </div>

            <Btn
              disabled={isReleasing}
              label={isReleasing ? t.releasing : t.releaseVehicle}
              onClick={onRelease}
            />
          </>
        ) : (
          <div className="bg-white rounded-2xl border border-vborder p-4 space-y-2">
            <p className="text-navy text-sm font-bold">
              {t.awaitingTaskOwner}
            </p>
            <p className="text-neutral text-xs leading-relaxed">
              {t.releaseOwnerRequired}
            </p>
          </div>
        )}

        {onOpenIncident && (
          <Btn
            label={t.reportIssue}
            variant="secondary"
            onClick={onOpenIncident}
          />
        )}
      </div>
    </div>
  );
}

export interface LiveHandoffCompletedProps {
  readonly onDone: () => void;
  readonly vehicleInfo: string;
}

export function LiveHandoffCompletedStep({
  onDone,
  vehicleInfo,
}: LiveHandoffCompletedProps): JSX.Element {
  const { t } = useEmployeeI18n();
  return (
    <div>
      <BackHeader title={t.handoffComplete} />
      <div className="p-5 space-y-4">
        <div className="bg-white rounded-2xl border border-vborder p-4">
          <p className="text-muted text-[10px] font-bold uppercase tracking-widest">
            {t.handoffComplete}
          </p>
          <p className="font-heading font-bold text-navy text-lg mt-1">
            <bdi dir="ltr">{vehicleInfo}</bdi>
          </p>
          <p className="text-neutral text-xs mt-1">
            {t.completedCustody}
          </p>
        </div>
        <Btn label={t.nextTask} onClick={onDone} />
      </div>
    </div>
  );
}
