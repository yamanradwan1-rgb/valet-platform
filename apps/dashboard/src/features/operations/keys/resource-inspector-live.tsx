"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import {
  Issue304ActionDialogs,
  type Issue304ActionIntent,
} from "../../administration/physical-resources/issue304-action-dialogs";
import { useAuthoritativeRead } from "../../administration/use-authoritative-read";
import { selectedOperationsLocation } from "../operations-location";
import { operationsCopy } from "../operations-copy";
import { styles } from "../operations-ui";
import { useOperationsContext } from "../use-operations-context";
import { ResourceInspector } from "./option3-resource-inspector";
import { inspectorCopy } from "./resource-inspector-copy";
import { ResourceInspectorKeyCreate } from "./resource-inspector-key-create";
import {
  readResourceInspectorOverview,
  type InspectorFamily,
  type InspectorFilter,
  type InspectorOverview,
} from "./resource-inspector-contract";

export function ResourceInspectorLive() {
  const { dashboard, scope, scopeKey, exactLocation } = useOperationsContext();
  const { locale } = useDashboardLocale();
  const t = operationsCopy(locale);
  const copy = inspectorCopy(locale);
  const location = selectedOperationsLocation(dashboard.selectedScope);
  const enabled = Boolean(location && scope.locationId === location.locationId &&
    (scope.authority === "COMPANY_ADMIN" ||
      (scope.authority === "LOCATION_MANAGER" && exactLocation)));

  const [filters, setFilters] = useState<Record<InspectorFamily, InspectorFilter>>({ keys: "all", spots: "all" });
  const filterKey = `${filters.keys}:${filters.spots}`;
  const [pages, setPages] = useState<{
    filterKey: string;
    keys: InspectorOverview["keySlots"][];
    spots: InspectorOverview["parkingSpots"][];
  }>({ filterKey: "all:all", keys: [], spots: [] });
  const pending = useRef({ keys: false, spots: false });
  const requestEpoch = useRef(0);
  const controllers = useRef<AbortController[]>([]);
  const [action, setAction] = useState<Issue304ActionIntent | null>(null);
  const [keyCreateOpen, setKeyCreateOpen] = useState(false);
  const actionScopeKey = `${scopeKey}:304:actions:${location?.locationId ?? "none"}`;
  const actionIdentity = { scopeKey: actionScopeKey, identityGeneration: dashboard.identityGeneration };
  const load = useCallback(
    (signal: AbortSignal) => readResourceInspectorOverview(
      dashboard.api,
      location?.locationId ?? "",
      null,
      null,
      filters.keys,
      filters.spots,
      signal,
    ),
    [dashboard.api, location?.locationId, filters.keys, filters.spots],
  );
  const read = useAuthoritativeRead(
    `${scopeKey}:304:inspector:${filterKey}:first`,
    load,
    enabled,
  );
  useEffect(() => () => {
    requestEpoch.current += 1;
    controllers.current.forEach((controller) => controller.abort());
  }, []);

  // Never mix a previous filter's appended pages into a newly scoped read.
  const activePages = pages.filterKey === filterKey ? pages : { keys: [], spots: [] };
  const nextKey = activePages.keys.length
    ? activePages.keys[activePages.keys.length - 1]?.nextCursor ?? null : read.data?.keySlots.nextCursor ?? null;
  const nextSpot = activePages.spots.length
    ? activePages.spots[activePages.spots.length - 1]?.nextCursor ?? null : read.data?.parkingSpots.nextCursor ?? null;
  const overview: InspectorOverview | null = read.data ? {
    counts: read.data.counts,
    keySlots: {
      items: [...read.data.keySlots.items, ...activePages.keys.flatMap((page) => page.items)],
      nextCursor: nextKey,
    },
    parkingSpots: {
      items: [...read.data.parkingSpots.items, ...activePages.spots.flatMap((page) => page.items)],
      nextCursor: nextSpot,
    },
  } : null;

  function invalidatePages() {
    requestEpoch.current += 1;
    controllers.current.forEach((controller) => controller.abort());
    controllers.current = [];
    pending.current = { keys: false, spots: false };
  }

  function refresh() {
    invalidatePages();
    setPages({ filterKey, keys: [], spots: [] });
    read.refresh();
  }

  function changeFilter(family: InspectorFamily, filter: InspectorFilter) {
    if (filters[family] === filter) return;
    const nextFilters = { ...filters, [family]: filter };
    invalidatePages();
    setPages({ filterKey: `${nextFilters.keys}:${nextFilters.spots}`, keys: [], spots: [] });
    setFilters(nextFilters);
    // useAuthoritativeRead starts a fresh abortable GET from the first cursor
    // through its filter-scoped request key. No mutation or implicit retry.
  }

  async function loadMore(family: InspectorFamily) {
    const cursor = family === "keys" ? nextKey : nextSpot;
    if (!cursor || !enabled || !location || pending.current[family] || read.loading) return;
    const epoch = requestEpoch.current;
    const controller = new AbortController();
    controllers.current.push(controller);
    pending.current[family] = true;
    try {
      const result = await readResourceInspectorOverview(
        dashboard.api, location.locationId,
        family === "keys" ? cursor : null,
        family === "spots" ? cursor : null,
        filters.keys,
        filters.spots,
        controller.signal,
      );
      if (controller.signal.aborted || requestEpoch.current !== epoch) return;
      if (family === "keys") {
        setPages((current) => current.filterKey === filterKey
          ? { ...current, keys: [...current.keys, result.keySlots] } : current);
      } else {
        setPages((current) => current.filterKey === filterKey
          ? { ...current, spots: [...current.spots, result.parkingSpots] } : current);
      }
    } catch {
      // Keep the current server-confirmed rows. The next scroll retries the page.
    } finally {
      controllers.current = controllers.current.filter((value) => value !== controller);
      pending.current[family] = false;
    }
  }

  if (!enabled || !location) {
    return <div className={`${styles.card} ${styles.state}`}>{t.exactLocation}</div>;
  }

  return (
    <>
    <ResourceInspector
      api={dashboard.api}
      actions={{
        onCreate: (family) => {
          if (family === "keys") setKeyCreateOpen(true);
          else setAction({ type: "create", kind: "parking-spot", ...actionIdentity });
        },
        onCreateZone: () => setAction({ type: "create-zone", ...actionIdentity }),
        onQr: (family, resourceId) => setAction({
          type: "label", kind: family === "keys" ? "key-slot" : "parking-spot",
          resourceId, ...actionIdentity,
        }),
      }}
      error={read.error}
      loading={read.loading}
      locationActive={location.status === "ACTIVE"}
      locationCode={location.code}
      locationId={location.locationId}
      locationName={location.name}
      next={{
        keys: Boolean(nextKey),
        spots: Boolean(nextSpot),
      }}
      filters={filters}
      onFilter={changeFilter}
      onLoadMore={(family) => { void loadMore(family); }}
      onRetry={refresh}
      overview={overview}
      scopeKey={scopeKey}
    />
    {keyCreateOpen && location.status === "ACTIVE" ? (
      <ResourceInspectorKeyCreate
        api={dashboard.api}
        identityGeneration={dashboard.identityGeneration}
        locationId={location.locationId}
        scopeKey={actionScopeKey}
        onClose={() => setKeyCreateOpen(false)}
        onReconcile={refresh}
        onCreated={(resourceId) => {
          setKeyCreateOpen(false);
          refresh();
          setAction({ type: "label", kind: "key-slot", resourceId, ...actionIdentity });
        }}
        t={copy}
      />
    ) : null}
    <Issue304ActionDialogs
      action={action}
      api={dashboard.api}
      identityGeneration={dashboard.identityGeneration}
      key={actionScopeKey}
      locationId={location.locationId}
      locationStatus={location.status}
      managementAuthorized={enabled}
      scopeKey={actionScopeKey}
      onClose={() => setAction(null)}
      onChanged={refresh}
      onReconcile={refresh}
    />
    </>
  );
}
