"use client";

import { useState, type JSX } from "react";

import type { StaffOperationalLocation } from "@valet/contracts";

import type { StartShiftPhase } from "../../features/shift";
import { useOnlineStatus } from "../../lib/connectivity/use-online-status";
import { useEmployeeI18n } from "./employee-i18n";

const panelButtonClass =
  "w-full h-12 bg-vblue text-white font-bold text-sm rounded-2xl flex items-center justify-center active:scale-[0.98] transition-all cursor-pointer shadow-lg shadow-vblue/30 disabled:opacity-60";
const panelSecondaryButtonClass =
  "w-full h-11 text-muted text-sm font-semibold cursor-pointer hover:text-white transition-colors";
const locationOptionClass = (selected: boolean): string =>
  `w-full text-start rounded-2xl border px-4 py-3 transition-colors cursor-pointer ${
    selected ? "border-vblue bg-vblue/20" : "border-white/10 bg-white/[0.04]"
  }`;

export interface StartShiftGatePanelProps {
  /** Authoritative startable Locations (server-derived eligibleLocations). */
  readonly locations: readonly StaffOperationalLocation[];
  readonly onDismissIntent?: (() => void) | undefined;
  readonly onRetryStart?: (() => void) | undefined;
  readonly onStartShift?: ((targetLocationId: string) => void) | undefined;
  readonly phase?: StartShiftPhase | null | undefined;
}

/**
 * VUI-011D Start Shift surface for the NO_ACTIVE_SHIFT operational gate.
 * Locations come exclusively from the authoritative server projection; a
 * single Location is preselected while the explicit Start press remains the
 * confirmation. Ambiguous outcomes never claim success and offer only an
 * explicit same-command retry plus dismiss.
 */
export function StartShiftGatePanel({
  locations,
  onDismissIntent,
  onRetryStart,
  onStartShift,
  phase = null,
}: StartShiftGatePanelProps): JSX.Element {
  const { t } = useEmployeeI18n();
  const isOnline = useOnlineStatus();
  const [chosenLocationId, setChosenLocationId] = useState<string | null>(
    null,
  );
  // A single authoritative Location is preselected; multiple require choice.
  const effectiveChosen =
    chosenLocationId ?? (locations.length === 1 ? locations[0]!.locationId : null);
  const submitting = phase?.kind === "submitting";
  const uncertain = phase?.kind === "uncertain";

  if (uncertain) {
    return (
      <div className="w-full bg-white/[0.06] border border-white/10 rounded-3xl p-6 backdrop-blur-sm space-y-3">
        <p className="font-heading font-bold text-white text-lg">
          {t.startShiftUncertainTitle}
        </p>
        <p className="text-muted text-sm leading-relaxed">
          {t.startShiftUncertain}
        </p>
        {!isOnline && (
          <p className="text-red-200/90 text-xs font-semibold">
            {t.noNetworkMessage}
          </p>
        )}
        <button
          type="button"
          onClick={onRetryStart}
          disabled={!isOnline}
          className={panelButtonClass}
        >
          {t.retryStartShift}
        </button>
        {onDismissIntent && (
          <button
            type="button"
            onClick={onDismissIntent}
            className={panelSecondaryButtonClass}
          >
            {t.dismissAction}
          </button>
        )}
      </div>
    );
  }

  if (locations.length === 0) {
    return (
      <p className="text-muted text-xs leading-relaxed">
        {t.noStartableLocationDetail}
      </p>
    );
  }

  return (
    <div className="w-full bg-white/[0.06] border border-white/10 rounded-3xl p-6 backdrop-blur-sm space-y-3">
      <p className="text-muted text-xs uppercase tracking-wider">
        {t.chooseLocationLabel}
      </p>
      {locations.map((location) => {
        const selected = effectiveChosen === location.locationId;
        return (
          <button
            key={location.locationId}
            type="button"
            onClick={() => setChosenLocationId(location.locationId)}
            className={locationOptionClass(selected)}
          >
            <span className="block text-white font-semibold text-sm">
              {location.name}
            </span>
            <span className="block text-muted text-xs mt-0.5">
              <bdi dir="ltr">{location.code}</bdi>
            </span>
          </button>
        );
      })}
      {phase?.kind === "error" && (
        <p
          className={`text-xs font-semibold ${
            phase.locationConflict ? "text-red-200" : "text-red-200/90"
          }`}
        >
          {phase.locationConflict ? t.startShiftConflict : t.operationFailed}
        </p>
      )}
      {!isOnline && (
        <p className="text-red-200/90 text-xs font-semibold">
          {t.noNetworkMessage}
        </p>
      )}
      {onStartShift && (
        <button
          type="button"
          onClick={() => {
            if (effectiveChosen !== null) {
              onStartShift(effectiveChosen);
            }
          }}
          disabled={!isOnline || submitting || effectiveChosen === null}
          className={panelButtonClass}
        >
          {submitting ? t.startingShift : t.startShiftAction}
        </button>
      )}
    </div>
  );
}
