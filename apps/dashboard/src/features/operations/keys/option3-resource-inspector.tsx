"use client";

import { useRef, useState } from "react";

import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { ScopedContextHelp } from "../../help/scoped-context-help";
import type {
  InspectorFamily,
  InspectorFilter,
  InspectorOverview,
  InspectorResource,
} from "./resource-inspector-contract";
import { inspectorRows } from "./resource-inspector-contract";
import { inspectorCopy } from "./resource-inspector-copy";
import { ResourceInspectorDetail } from "./resource-inspector-detail";
import { ResourceInspectorKpis } from "./resource-inspector-kpis";
import { ResourceInspectorMaster } from "./resource-inspector-master";
import { resourceMatches, resourceIsBusy } from "./resource-inspector-presentation";
import "./option3-resource-inspector.css";

export interface ResourceInspectorActions {
  readonly onCreate?: (family: InspectorFamily) => void;
  readonly onCreateZone?: () => void;
  readonly onQr?: (family: InspectorFamily, resourceId: string) => void;
}

export function ResourceInspector(props: {
  readonly overview: InspectorOverview | null;
  readonly loading: boolean;
  readonly error: Error | null;
  readonly onRetry: () => void;
  readonly locationName: string;
  readonly locationCode: string;
  readonly locationActive: boolean;
  readonly locationId: string;
  readonly scopeKey: string;
  readonly api: DashboardApiClient;
  readonly next: Readonly<Record<InspectorFamily, boolean>>;
  readonly filters: Readonly<Record<InspectorFamily, InspectorFilter>>;
  readonly onFilter: (family: InspectorFamily, filter: InspectorFilter) => void;
  readonly onLoadMore: (family: InspectorFamily) => void;
  readonly actions: ResourceInspectorActions;
}) {
  const { locale } = useDashboardLocale();
  const t = inspectorCopy(locale);
  const [family, setFamily] = useState<InspectorFamily>("keys");
  const [selected, setSelected] = useState<{ keys: string | null; spots: string | null }>({ keys: null, spots: null });
  const [mobileDetails, setMobileDetails] = useState(false);
  const rowReturn = useRef<HTMLButtonElement | null>(null);
  const familyRows = props.overview ? inspectorRows(props.overview, family) : [];
  // W3 paginates matching rows authoritatively. This client predicate is only
  // a defensive check and must never be the source of filtered pagination.
  const filtered = familyRows.filter((item) => resourceMatches(item, props.filters[family]));
  const selectedRow = filtered.find((item) => item.id === selected[family]) ??
    filtered.find((item) => item.status === "ACTIVE" && resourceIsBusy(item)) ??
    filtered[0] ?? null;

  function selectResource(item: InspectorResource, button: HTMLButtonElement) {
    rowReturn.current = button;
    setSelected((current) => ({ ...current, [family]: item.id }));
    if (window.matchMedia("(max-width: 820px)").matches) {
      setMobileDetails(true);
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-issue304-resource-detail]")?.focus());
    }
  }

  function backToList() {
    setMobileDetails(false);
    requestAnimationFrame(() => {
      if (rowReturn.current?.isConnected) rowReturn.current.focus();
      else document.querySelector<HTMLButtonElement>("[data-issue304-resource-list] .c-resource")?.focus();
    });
  }

  function selectFamily(nextFamily: InspectorFamily) {
    setFamily(nextFamily);
    setMobileDetails(false);
  }

  return (
    <div className="inspector" data-issue304-inspector data-mobile-details={mobileDetails}>
      <div className="c-head">
        <div className="c-heading">
          <span className="c-kicker">
            <span className="c-kicker-mark" aria-hidden="true" />
            {t.workspace}
          </span>
          <h1 id="c-page-title">{t.title}</h1>
          <p>{t.intro}</p>
        </div>
        <ScopedContextHelp helpKey="keys.page" />
      </div>
      <ResourceInspectorKpis counts={props.overview?.counts ?? null} t={t} />
      <div className="c-command-row">
        <div className="c-family-switch" role="group" aria-label={t.familyLabel}>
          {(["keys", "spots"] as const).map((kind) => (
            <button
              key={kind}
              className={`c-family-button ${family === kind ? "is-active" : ""}`}
              data-c-family={kind}
              aria-pressed={family === kind}
              type="button"
              onClick={() => selectFamily(kind)}
            >
              {kind === "keys" ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="8" cy="9" r="4"/><path d="M11 12l9 9m-4-4 3-3m-5 1 3-3"/></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M9 17V7h4.25a3.25 3.25 0 0 1 0 6.5H9"/></svg>
              )}
              <span>{t[kind]}</span>
              <span className="c-family-count">
                {props.overview
                  ? String(kind === "keys" ? props.overview.counts.keySlots.configured : props.overview.counts.parkingSpots.configured).padStart(2, "0")
                  : "—"}
              </span>
            </button>
          ))}
        </div>
        <div className="c-add-actions">
          {family === "spots" ? (
            <button className="c-add-zone" type="button" disabled={!props.locationActive || !props.actions.onCreateZone} onClick={props.actions.onCreateZone}>
              {t.addZone}
            </button>
          ) : null}
          <button
            className="c-add"
            type="button"
            disabled={!props.locationActive || !props.actions.onCreate}
            onClick={() => props.actions.onCreate?.(family)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
            <span>{family === "keys" ? t.addKey : t.addSpot}</span>
          </button>
        </div>
      </div>
      <div className="c-workspace">
        <ResourceInspectorMaster
          canNext={props.next[family]}
          error={props.error}
          family={family}
          filter={props.filters[family]}
          loading={props.loading}
          onFilter={(nextFilter) => props.onFilter(family, nextFilter)}
          onLoadMore={() => props.onLoadMore(family)}
          onRetry={props.onRetry}
          onSelect={(id, button) => {
            const item = filtered.find((candidate) => candidate.id === id);
            if (item) selectResource(item, button);
          }}
          rows={filtered}
          selectedId={selectedRow?.id ?? null}
          t={t}
          totalOnPage={familyRows.length}
        />
        <ResourceInspectorDetail
          api={props.api}
          canLabel={props.locationActive && selectedRow?.status === "ACTIVE"}
          item={props.error || props.loading ? null : selectedRow}
          locationCode={props.locationCode}
          locationId={props.locationId}
          locationName={props.locationName}
          onBack={backToList}
          onQr={props.actions.onQr ? (id) => props.actions.onQr?.(family, id) : undefined}
          scopeKey={props.scopeKey}
          position={selectedRow ? familyRows.findIndex((item) => item.id === selectedRow.id) + 1 : 0}
          t={t}
          total={familyRows.length}
        />
      </div>
      <p className="c-announcement c-sr-only" aria-live="polite" role="status">
        {props.error ? t.error : props.loading ? t.loading : ""}
      </p>
    </div>
  );
}
