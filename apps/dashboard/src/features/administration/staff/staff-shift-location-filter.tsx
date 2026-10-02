"use client";
import type { ManagementLocation } from "@valet/contracts";
import { useCallback, useState } from "react";
import { useProtectedDashboard } from "../../../components/foundation/protected-dashboard-context";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import {
  listCompanyAdminLocations,
  listLocationManagerLocations,
} from "../../../lib/scope/dashboard-scope";
import { administrationCopy } from "../administration-copy";
import { administrationScope } from "../administration-scope";
import { useAuthoritativeRead } from "../use-authoritative-read";
import { staffShiftHistoryCopy } from "./staff-shift-history-copy";
import css from "./staff-reference.module.css";

export function StaffShiftLocationFilter(props: {
  readonly organizationId: string;
  readonly scopeKey: string;
  readonly value: ManagementLocation | null;
  readonly displayAuthorized: boolean;
  readonly onChange: (value: ManagementLocation | null) => void;
}) {
  const dashboard = useProtectedDashboard();
  const authority = administrationScope(dashboard.selectedScope).authority;
  const { locale } = useDashboardLocale();
  const t = administrationCopy(locale),
    h = staffShiftHistoryCopy(locale);
  const [enabled, setEnabled] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [history, setHistory] = useState<(string | null)[]>([]);
  const load = useCallback(
    (signal: AbortSignal) =>
      (authority === "LOCATION_MANAGER"
        ? listLocationManagerLocations
        : listCompanyAdminLocations)(
        dashboard.api,
        props.organizationId,
        cursor ? { cursor } : {},
        signal,
      ),
    [dashboard.api, authority, props.organizationId, cursor],
  );
  const page = useAuthoritativeRead(
    `${props.scopeKey}:shift-locations:${cursor ?? "first"}`,
    load,
    enabled,
  );
  const options = page.data?.items ?? [];
  const selected =
    !enabled &&
    !page.error &&
    !page.loading &&
    props.displayAuthorized &&
    props.value &&
    !options.some((item) => item.locationId === props.value?.locationId)
      ? props.value
      : null;
  return (
    <select
      aria-label={t.location}
      className={`${css.select} ${css.roleSelect}`}
      onFocus={() => setEnabled(true)}
      value={props.value?.locationId ?? "ALL"}
      onChange={(event) => {
        const value = event.target.value;
        if (value === "NEXT") {
          setHistory((previous) => [...previous, cursor]);
          setCursor(page.data?.nextCursor ?? null);
        } else if (value === "PREVIOUS") {
          setCursor(history.at(-1) ?? null);
          setHistory(history.slice(0, -1));
        } else if (value === "RETRY") page.refresh();
        else if (value === "ALL") props.onChange(null);
        else {
          const item =
            options.find((item) => item.locationId === value) ?? selected;
          if (item) props.onChange(item);
        }
      }}
    >
      <option value="ALL">{h.allLocations}</option>
      {props.value &&
      !selected &&
      !options.some((item) => item.locationId === props.value?.locationId) ? (
        <option value={props.value.locationId}>{h.selectedLocation}</option>
      ) : null}
      {selected ? (
        <option value={selected.locationId}>{label(selected)}</option>
      ) : null}
      {options.map((item) => (
        <option key={item.locationId} value={item.locationId}>
          {label(item)}
        </option>
      ))}
      {page.loading ? <option disabled>{t.loading}</option> : null}
      {page.error ? <option value="RETRY">{t.retry}</option> : null}
      {history.length > 0 && !page.loading && !page.error ? (
        <option value="PREVIOUS">{t.previous}</option>
      ) : null}
      {page.data?.nextCursor && !page.loading ? (
        <option value="NEXT">{t.next}</option>
      ) : null}
    </select>
  );
}
function label(location: ManagementLocation) {
  return `\u2068${location.name}\u2069 · \u2066${location.code}\u2069`;
}
