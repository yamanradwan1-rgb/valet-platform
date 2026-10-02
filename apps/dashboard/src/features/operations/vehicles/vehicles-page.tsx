"use client";

import type {
  DashboardSessionState,
  SessionOverviewEntry,
} from "@valet/contracts";
import { Search } from "lucide-react";
import { useCallback, useState } from "react";
import { SessionDrawer as VehicleDrawer } from "../live-operations/session-drawer";

import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { readSessions } from "../operations-api";
import { selectedOperationsLocation } from "../operations-location";
import { operationsCopy } from "../operations-copy";
import {
  formatOperationsTime,
  operationsSessionStateLabel,
  operationsVehicleLabel,
  r04PresentationCopy,
} from "../operations-presentation";
import { sessionTone } from "../operations-labels";
import {
  DetailAction,
  OperationsPage,
  StatusBadge,
  styles,
} from "../operations-ui";
import { ReferenceCursorControls } from "../reference-cursor-controls";
import listStyles from "../reference-list.module.css";
import { useCursorPage } from "../use-cursor-page";
import { useOperationsContext } from "../use-operations-context";
import { useOperationsRead } from "../use-operations-read";

type StateFilter = DashboardSessionState | "ALL";

export function VehiclesPage() {
  const { scopeKey } = useOperationsContext();
  return <VehiclesContent key={scopeKey} />;
}

function VehiclesContent() {
  const { dashboard, exactLocation, scope, scopeKey } = useOperationsContext();
  const { locale } = useDashboardLocale();
  const t = operationsCopy(locale);
  const r04 = r04PresentationCopy(locale);
  const page = useCursorPage();
  const [query, setQuery] = useState("");
  const [state, setState] = useState<StateFilter>("ALL");
  const [selected, setSelected] = useState<SessionOverviewEntry | null>(null);
  const location = selectedOperationsLocation(dashboard.selectedScope);
  const locationId = location?.locationId ?? "";
  const enabled =
    exactLocation &&
    location !== null &&
    (scope.authority === "COMPANY_ADMIN" ||
      scope.authority === "LOCATION_MANAGER");
  const load = useCallback(
    (signal: AbortSignal) =>
      readSessions(dashboard.api, locationId, page.cursor, signal),
    [dashboard.api, locationId, page.cursor],
  );
  const read = useOperationsRead(
    `${scopeKey}:vehicles:${page.cursor ?? "first"}`,
    load,
    enabled,
  );
  const items = read.data?.items ?? [];
  const states = [...new Set(items.map((item) => item.state))];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const rows = items.filter((item) => {
    const identity = operationsVehicleLabel(item)?.toLocaleLowerCase() ?? "";
    return (
      (state === "ALL" || item.state === state) &&
      (normalizedQuery === "" || identity.includes(normalizedQuery))
    );
  });
  const resetPageLocalState = () => {
    setQuery("");
    setState("ALL");
    setSelected(null);
  };
  const nextPage = () => {
    const nextCursor = read.data?.nextCursor ?? null;
    if (nextCursor === null) return;
    resetPageLocalState();
    page.next(nextCursor);
  };
  const previousPage = () => {
    resetPageLocalState();
    page.previous();
  };

  if (!enabled || location === null) {
    return (
      <OperationsPage subtitle={t.vehiclesSubtitle} title={t.vehiclesTitle}>
        <div className={`${styles.card} ${styles.state}`}>
          {t.exactLocation}
        </div>
      </OperationsPage>
    );
  }

  return (
    <OperationsPage
      action={
        <span aria-hidden="true" className={listStyles.headerActionSpace} />
      }
      subtitle={t.vehiclesSubtitle}
      title={t.vehiclesTitle}
    >
      <label className={listStyles.search}>
        <Search aria-hidden="true" />
        <input
          aria-label={r04.searchVehicle}
          aria-describedby="vehicles-loaded-page-note"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={r04.searchVehicle}
          type="search"
          value={query}
        />
      </label>
      <div className={listStyles.toolbar}>
        <div className={listStyles.filters}>
          <span className={listStyles.locationControl}>{location.name}</span>
          <select
            aria-label={t.state}
            className={listStyles.select}
            onChange={(event) => setState(event.target.value as StateFilter)}
            value={state}
          >
            <option value="ALL">{r04.allStatuses}</option>
            {states.map((value) => (
              <option key={value} value={value}>
                {operationsSessionStateLabel(value, locale)}
              </option>
            ))}
          </select>
        </div>
        <span className={listStyles.scopeNote} id="vehicles-loaded-page-note">
          {r04.loadedPageOnly}
        </span>
      </div>
      <div className={listStyles.tableCard}>
        <div className={listStyles.tableWrap}>
          <table className={`${listStyles.table} ${listStyles.vehiclesTable}`}>
            <thead>
              <tr>
                <th>{t.vehicle}</th>
                <th>{t.state}</th>
                <th>{t.location}</th>
                <th>{t.updated}</th>
                <th className={styles.actionHeader}>{t.action}</th>
              </tr>
            </thead>
            <tbody>
              <VehicleTableBody
                error={read.error}
                items={rows}
                loading={read.loading}
                locale={locale}
                location={location}
                onRetry={read.refresh}
                onSelect={setSelected}
                sourceEmpty={items.length === 0}
              />
            </tbody>
          </table>
        </div>
        <ReferenceCursorControls
          canNext={Boolean(read.data?.nextCursor)}
          canPrevious={page.canPrevious}
          label={t.loadedCursorPage}
          loading={read.loading}
          locale={locale}
          onNext={nextPage}
          onPrevious={previousPage}
        />
      </div>
      {selected ? (
        <VehicleDrawer
          item={selected}
          locale={locale}
          location={location}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </OperationsPage>
  );
}

function VehicleTableBody(props: {
  readonly error: Error | null;
  readonly items: readonly SessionOverviewEntry[];
  readonly loading: boolean;
  readonly locale: "en" | "ar";
  readonly location: ReturnType<typeof selectedOperationsLocation> & {};
  readonly onRetry: () => void;
  readonly onSelect: (item: SessionOverviewEntry) => void;
  readonly sourceEmpty: boolean;
}) {
  const t = operationsCopy(props.locale);
  if (props.loading) return <StateRow text={t.loading} />;
  if (props.error)
    return (
      <tr>
        <td className={listStyles.stateCell} colSpan={5}>
          <div className={listStyles.inlineError} role="alert">
            <span>{props.error.message}</span>
            <button
              className={styles.secondary}
              onClick={props.onRetry}
              type="button"
            >
              {t.retry}
            </button>
          </div>
        </td>
      </tr>
    );
  if (props.items.length === 0)
    return (
      <StateRow text={props.sourceEmpty ? t.noData : t.noMatchingLoadedPage} />
    );
  return (
    <>
      {props.items.map((item) => {
        const vehicle = operationsVehicleLabel(item) ?? t.plateUnavailable;
        return (
          <tr className={styles.row} key={item.sessionId}>
            <td>
              <div className={listStyles.primary}>
                <bdi dir="ltr">{vehicle}</bdi>
              </div>
              {item.vehicle.plateCountry ? (
                <div className={listStyles.secondary}>
                  <bdi dir="ltr">{item.vehicle.plateCountry}</bdi>
                </div>
              ) : null}
            </td>
            <td>
              <StatusBadge tone={sessionTone(item.state)}>
                {operationsSessionStateLabel(item.state, props.locale)}
              </StatusBadge>
            </td>
            <td>
              <div className={listStyles.primary}>{props.location.name}</div>
              <div className={listStyles.secondary}>
                <bdi dir="ltr">{props.location.code}</bdi>
              </div>
            </td>
            <td>
              <bdi dir={props.locale === "ar" ? "rtl" : "ltr"}>
                {formatOperationsTime(
                  item.updatedAt,
                  props.location.timezone,
                  props.locale,
                )}
              </bdi>
            </td>
            <td className={styles.actionCell}>
              <DetailAction
                label={`${t.details}: ${vehicle}`}
                onClick={() => props.onSelect(item)}
              />
            </td>
          </tr>
        );
      })}
    </>
  );
}

function StateRow({ text }: { readonly text: string }) {
  return (
    <tr>
      <td className={listStyles.stateCell} colSpan={5}>
        {text}
      </td>
    </tr>
  );
}
