"use client";

import { useState, type JSX } from "react";

import type { ResolvedOperationalScope } from "../../features/staff-operational-context";
import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { useVehicleDirectory } from "../../features/vehicles-directory";
import { useEmployeeI18n } from "../shell/employee-i18n";
import { Btn } from "../ui/employee-primitives";
import { VehicleDirectoryRowCard } from "./vehicle-directory-row-card";

export interface VehiclesListLiveProps {
  readonly activeScope: ResolvedOperationalScope;
  /** Test/diagnostic injection point; production builds the authed client. */
  readonly client?: EmployeeApiClient | undefined;
  readonly onAuthorizationLoss?: (() => void) | undefined;
}

/**
 * Truthful Live Vehicles surface (VUI-011C, DEC-066 §6–§12): the narrow
 * authoritative directory read for the active Location. Operational data
 * only, no search/filtering over a capped page (§9), no row mutations (§10),
 * no prototype vehicles.
 */
export function VehiclesListLive({
  activeScope,
  client,
  onAuthorizationLoss,
}: VehiclesListLiveProps): JSX.Element {
  const { t } = useEmployeeI18n();
  const { error, isLoading, isRefreshing, retry, rows, truncated } =
    useVehicleDirectory({
      client,
      locationId: activeScope.locationId,
      onAuthorizationLoss,
    });
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(
    null,
  );

  const toggle = (sessionId: string): void => {
    // DEC-066 §10: a row tap only expands the read-only detail already held
    // in the row — it never fetches or mutates anything.
    setExpandedSessionId((current) => (current === sessionId ? null : sessionId));
  };

  return (
    <div className="p-5 space-y-4">
      <div>
        <h1 className="font-bold text-xl text-navy">{t.vehiclesNav}</h1>
        <p className="text-neutral text-sm mt-1">
          {t.location} · {activeScope.locationName}
        </p>
      </div>

      {truncated && (
        <div className="bg-[#FFF4E0] border border-vwarning/20 rounded-xl px-4 py-3">
          <p className="text-vwarning text-xs font-semibold leading-relaxed">
            {t.vehiclesTruncatedNotice}
          </p>
        </div>
      )}

      {isRefreshing && (
        <p className="text-muted text-xs">{t.vehiclesRefreshing}</p>
      )}

      {isLoading ? (
        <div className="space-y-3" aria-busy="true">
          <p className="text-neutral text-sm">{t.vehiclesLoading}</p>
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="bg-white rounded-xl border border-vborder p-4 animate-pulse"
            >
              <div className="h-4 w-2/3 bg-gray-200 rounded mb-2" />
              <div className="h-3 w-1/3 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : error !== null ? (
        <div className="bg-white rounded-2xl border border-vborder p-5 space-y-3">
          <p className="font-heading font-bold text-navy text-lg">
            {t.vehiclesLoadFailed}
          </p>
          <p className="text-neutral text-xs leading-relaxed">
            {t.operationFailed}
          </p>
          <Btn label={t.retry} onClick={retry} variant="secondary" size="md" />
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-vborder p-5 space-y-2">
          <p className="font-heading font-bold text-navy text-lg">
            {t.vehiclesEmptyTitle}
          </p>
          <p className="text-neutral text-xs leading-relaxed">
            {t.vehiclesEmptyDetail}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <VehicleDirectoryRowCard
              key={row.sessionId}
              expanded={expandedSessionId === row.sessionId}
              onToggle={() => toggle(row.sessionId)}
              row={row}
            />
          ))}
        </div>
      )}
    </div>
  );
}
