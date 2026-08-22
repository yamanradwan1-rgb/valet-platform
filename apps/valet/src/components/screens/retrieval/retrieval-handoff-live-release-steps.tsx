"use client";

import type { JSX } from "react";

import { BackHeader, Btn } from "../../ui/employee-primitives";
import type { HandoffVerificationSnapshot } from "../../../features/handoff/handoff-types";

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
  const methodLabel =
    verification.method === "SUPERVISOR_OVERRIDE"
      ? "Supervisor override"
      : verification.method === "PICKUP_CODE"
        ? "Pickup code"
        : "Guest QR";
  return (
    <div>
      <BackHeader title="Identity Verified" />
      <div className="p-5 space-y-4">
        <div className="bg-white rounded-2xl border border-vborder p-4">
          <p className="text-muted text-[10px] font-bold uppercase tracking-widest">
            Identity verified · {methodLabel}
          </p>
          <p className="font-heading font-bold text-navy text-lg mt-1">
            {vehicleInfo}
          </p>
        </div>

        {financialBlocked && (
          <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-800 text-xs font-semibold">
            Release blocked: the outstanding payment requirement is not
            satisfied yet. Refresh once payment completes.
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
              <p className="text-navy text-sm font-bold">Release vehicle</p>
              <p className="text-neutral text-xs leading-relaxed">
                This hands the vehicle and key to the guest and closes the task
                permanently. It cannot be undone.
              </p>
            </div>

            <Btn
              disabled={isReleasing}
              label={isReleasing ? "Releasing…" : "Release Vehicle"}
              onClick={onRelease}
            />
          </>
        ) : (
          <div className="bg-white rounded-2xl border border-vborder p-4 space-y-2">
            <p className="text-navy text-sm font-bold">
              Override recorded — awaiting task owner
            </p>
            <p className="text-neutral text-xs leading-relaxed">
              The Retrieval task owner must complete the vehicle release.
            </p>
          </div>
        )}

        {onOpenIncident && (
          <Btn
            label="Report Issue"
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
  return (
    <div>
      <BackHeader title="Handoff Complete" />
      <div className="p-5 space-y-4">
        <div className="bg-white rounded-2xl border border-vborder p-4">
          <p className="text-muted text-[10px] font-bold uppercase tracking-widest">
            Handoff complete
          </p>
          <p className="font-heading font-bold text-navy text-lg mt-1">
            {vehicleInfo}
          </p>
          <p className="text-neutral text-xs mt-1">
            Task completed and custody handed over.
          </p>
        </div>
        <Btn label="Next Task" onClick={onDone} />
      </div>
    </div>
  );
}
