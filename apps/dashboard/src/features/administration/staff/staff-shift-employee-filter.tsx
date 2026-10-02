"use client";
import {
  STAFF_SEARCH_MAX_LENGTH,
  staffManagementDisplayName,
  type StaffShiftEmployee,
} from "@valet/contracts";
import { Search } from "lucide-react";
import { useCallback, useState } from "react";
import { useProtectedDashboard } from "../../../components/foundation/protected-dashboard-context";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { administrationCopy } from "../administration-copy";
import { useAuthoritativeRead } from "../use-authoritative-read";
import { readShiftEmployees } from "./staff-shift-history-api";
import { staffShiftHistoryCopy } from "./staff-shift-history-copy";
import css from "./staff-reference.module.css";
import filterCss from "./staff-shift-filters.module.css";

export function StaffShiftEmployeeFilter(props: {
  readonly organizationId: string;
  readonly scopeKey: string;
  readonly locationId: string | undefined;
  readonly membershipId: string | undefined;
  readonly value: StaffShiftEmployee | null;
  readonly onChange: (value: StaffShiftEmployee | null) => void;
}) {
  const { api } = useProtectedDashboard();
  const { locale } = useDashboardLocale();
  const t = administrationCopy(locale),
    h = staffShiftHistoryCopy(locale);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState<{
    search?: string | undefined;
    cursor?: string | undefined;
    history: (string | undefined)[];
    enabled: boolean;
    generation: number;
  }>({ history: [], enabled: false, generation: 0 });
  const load = useCallback(
    (signal: AbortSignal) =>
      readShiftEmployees(
        api,
        props.organizationId,
        {
          search: query.search,
          cursor: query.cursor,
          locationId: props.locationId,
          limit: 50,
        },
        signal,
      ),
    [api, props.organizationId, props.locationId, query.search, query.cursor],
  );
  const page = useAuthoritativeRead(
    `${props.scopeKey}:shift-employees:${JSON.stringify([query.search, query.cursor, query.generation])}`,
    load,
    query.enabled,
  );
  const options = page.data?.items ?? [];
  const selected =
    !query.enabled &&
    !page.error &&
    !page.loading &&
    props.value &&
    !options.some((item) => item.membershipId === props.value?.membershipId)
      ? props.value
      : null;
  return (
    <>
      <form
        className={`${css.controls} ${filterCss.searchForm}`}
        onSubmit={(event) => {
          event.preventDefault();
          setQuery((current) => ({
            search: draft.trim() || undefined,
            history: [],
            enabled: true,
            generation: current.generation + 1,
          }));
        }}
      >
        <label className={css.search}>
          <Search aria-hidden="true" />
          <input
            aria-label={h.search}
            placeholder={h.search}
            type="search"
            maxLength={STAFF_SEARCH_MAX_LENGTH * 2}
            value={draft}
            onChange={(event) =>
              setDraft(
                Array.from(event.target.value)
                  .slice(0, STAFF_SEARCH_MAX_LENGTH)
                  .join(""),
              )
            }
          />
        </label>
        <button
          className={css.detailAction}
          type="submit"
          aria-label={h.searchAction}
        >
          <Search aria-hidden="true" size={18} />
        </button>
      </form>
      <select
        aria-label={h.employee}
        className={`${css.select} ${css.roleSelect}`}
        onFocus={() => setQuery((current) => ({ ...current, enabled: true }))}
        value={props.membershipId ?? "ALL"}
        onChange={(event) => {
          const value = event.target.value;
          if (value === "NEXT")
            setQuery((current) => ({
              ...current,
              cursor: page.data?.nextCursor ?? undefined,
              history: [...current.history, current.cursor],
              generation: current.generation + 1,
            }));
          else if (value === "PREVIOUS")
            setQuery((current) => ({
              ...current,
              cursor: current.history.at(-1),
              history: current.history.slice(0, -1),
              generation: current.generation + 1,
            }));
          else if (value === "RETRY") page.refresh();
          else if (value === "ALL") props.onChange(null);
          else {
            const item =
              options.find((item) => item.membershipId === value) ?? selected;
            if (item) props.onChange(item);
          }
        }}
      >
        <option value="ALL">{h.allEmployees}</option>
        {props.membershipId &&
        !selected &&
        !options.some((item) => item.membershipId === props.membershipId) ? (
          <option value={props.membershipId}>{h.selectedEmployee}</option>
        ) : null}
        {selected ? (
          <option value={selected.membershipId}>{label(selected)}</option>
        ) : null}
        {options.map((item) => (
          <option key={item.membershipId} value={item.membershipId}>
            {label(item)}
          </option>
        ))}
        {page.loading ? <option disabled>{t.loading}</option> : null}
        {page.error ? <option value="RETRY">{t.retry}</option> : null}
        {query.history.length > 0 && !page.loading && !page.error ? (
          <option value="PREVIOUS">{t.previous}</option>
        ) : null}
        {page.data?.nextCursor && !page.loading ? (
          <option value="NEXT">{t.next}</option>
        ) : null}
      </select>
    </>
  );
}
function label(item: StaffShiftEmployee) {
  return `\u2068${staffManagementDisplayName(item.identity)}\u2069 · \u2066${item.identity.email}\u2069`;
}
