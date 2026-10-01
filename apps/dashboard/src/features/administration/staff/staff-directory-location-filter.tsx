"use client";

import type { ManagementLocation } from "@valet/contracts";
import { useCallback, useState } from "react";
import { useProtectedDashboard } from "../../../components/foundation/protected-dashboard-context";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { listCompanyAdminLocations } from "../../../lib/scope/dashboard-scope";
import { administrationCopy } from "../administration-copy";
import { useAuthoritativeRead } from "../use-authoritative-read";
import referenceStyles from "./staff-reference.module.css";
import filterStyles from "./staff-directory-filter.module.css";

export function StaffDirectoryLocationFilter(props: {
  readonly organizationId: string;
  readonly scopeKey: string;
  readonly value: string | undefined;
  readonly onChange: (value: string | undefined) => void;
}) {
  const { api } = useProtectedDashboard();
  const { locale } = useDashboardLocale();
  const t = administrationCopy(locale);
  const [enabled, setEnabled] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [history, setHistory] = useState<(string | null)[]>([]);
  const [selected, setSelected] = useState<ManagementLocation | null>(null);
  const load = useCallback(
    (signal: AbortSignal) =>
      listCompanyAdminLocations(
        api,
        props.organizationId,
        cursor === null ? {} : { cursor },
        signal,
      ),
    [api, props.organizationId, cursor],
  );
  const page = useAuthoritativeRead(
    `${props.scopeKey}:staff-location-selector:${cursor ?? "first"}`,
    load,
    enabled,
  );
  const options = page.data?.items ?? [];
  const selectedOutsidePage =
    selected &&
    !options.some((item) => item.locationId === selected.locationId);

  return (
    <select
      aria-label={t.location}
      className={`${referenceStyles.select} ${referenceStyles.roleSelect} ${filterStyles.locationSelect}`}
      onFocus={() => setEnabled(true)}
      value={props.value ?? "ALL"}
      onChange={(event) => {
        const value = event.target.value;
        if (value === "NEXT") {
          setHistory((current) => [...current, cursor]);
          setCursor(page.data?.nextCursor ?? null);
        } else if (value === "PREVIOUS") {
          setCursor(history.at(-1) ?? null);
          setHistory(history.slice(0, -1));
        } else if (value === "RETRY") {
          page.refresh();
        } else {
          setSelected(
            options.find((item) => item.locationId === value) ?? null,
          );
          props.onChange(value === "ALL" ? undefined : value);
        }
      }}
    >
      <option value="ALL">{t.allEmployeeLocations}</option>
      {selectedOutsidePage ? (
        <option value={selected.locationId}>
          {selected.name} · {selected.code}
        </option>
      ) : null}
      {options.map((item) => (
        <option key={item.locationId} value={item.locationId}>
          {item.name} · {item.code}
        </option>
      ))}
      {page.loading ? <option disabled>{t.loading}</option> : null}
      {page.error ? <option value="RETRY">{t.retry}</option> : null}
      {history.length > 0 && !page.loading ? (
        <option value="PREVIOUS">{t.previous}</option>
      ) : null}
      {page.data?.nextCursor && !page.loading ? (
        <option value="NEXT">{t.next}</option>
      ) : null}
    </select>
  );
}
