"use client";

import type { ManagementLocation } from "@valet/contracts";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { administrationErrorMessage } from "../administration-error";
import { AdministrationTabs } from "../administration-tabs";
import { ReadState, styles } from "../administration-ui";
import { useAuthoritativeRead } from "../use-authoritative-read";
import { PhysicalResourceCreateDialog } from "./physical-resource-create-dialog";
import { clearOtherIdentityPhysicalResourceOperations } from "./physical-resource-operation-id";
import { PhysicalResourceTable } from "./physical-resource-table";
import { readKeySlots, readParkingSpots } from "./physical-resources-api";
import { physicalResourcesCopy } from "./physical-resources-copy";
import presentation from "./physical-resources.module.css";
import { ResourceLabelDialog } from "./resource-label-dialog";

import { ParkingZoneCreateDialog } from "./parking-zone-create-dialog";
import { useParkingZonePage } from "./use-parking-zone-page";

type Family = "key-slot" | "parking-spot";

export function PhysicalResourcesPanel(props: {
  readonly api: DashboardApiClient;
  readonly identityGeneration: number;
  readonly location: ManagementLocation;
  readonly scopeKey: string;
}) {
  const { locale } = useDashboardLocale();
  const t = physicalResourcesCopy(locale);
  const [family, setFamily] = useState<Family>("key-slot");
  const [keyCursor, setKeyCursor] = useState<string | null>(null);
  const [keyHistory, setKeyHistory] = useState<(string | null)[]>([]);
  const [spotCursor, setSpotCursor] = useState<string | null>(null);
  const [spotHistory, setSpotHistory] = useState<(string | null)[]>([]);
  const [zoneOpen, setZoneOpen] = useState(false);
  const [zoneReconcile, setZoneReconcile] = useState(false);
  const standaloneZones = useParkingZonePage(
    props.api,
    props.location.locationId,
    props.scopeKey,
    zoneOpen && zoneReconcile,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [labelTarget, setLabelTarget] = useState<{
    kind: Family;
    id: string;
  } | null>(null);
  useEffect(() => {
    clearOtherIdentityPhysicalResourceOperations(props.identityGeneration);
  }, [props.identityGeneration]);
  const loadKeys = useCallback(
    (signal: AbortSignal) =>
      readKeySlots(props.api, props.location.locationId, keyCursor, signal),
    [props.api, props.location.locationId, keyCursor],
  );
  const loadSpots = useCallback(
    (signal: AbortSignal) =>
      readParkingSpots(
        props.api,
        props.location.locationId,
        spotCursor,
        signal,
      ),
    [props.api, props.location.locationId, spotCursor],
  );
  const keys = useAuthoritativeRead(
    `${props.scopeKey}:physical:key:${keyCursor ?? "first"}`,
    loadKeys,
    family === "key-slot",
  );
  const spots = useAuthoritativeRead(
    `${props.scopeKey}:physical:spot:${spotCursor ?? "first"}`,
    loadSpots,
    family === "parking-spot",
  );
  const current = family === "key-slot" ? keys : spots;
  const active = props.location.status === "ACTIVE";
  const history = family === "key-slot" ? keyHistory : spotHistory;
  const cursor = family === "key-slot" ? keyCursor : spotCursor;
  const setHistory = family === "key-slot" ? setKeyHistory : setSpotHistory;
  const setCursor = family === "key-slot" ? setKeyCursor : setSpotCursor;
  const createButton = (
    <button
      className={styles.primary}
      disabled={zoneOpen}
      onClick={() => setCreateOpen(true)}
      type="button"
    >
      <Plus aria-hidden="true" size={15} />{" "}
      {family === "key-slot" ? t.addKeySlot : t.addParkingSpot}
    </button>
  );

  return (
    <section
      className={presentation.section}
      aria-labelledby={`physical-resources-${props.location.locationId}`}
      data-testid="physical-resources-panel"
    >
      <div className={presentation.headingRow}>
        <div>
          <h3 id={`physical-resources-${props.location.locationId}`}>
            {t.physicalResources}
          </h3>
          <p>{t.subtitle}</p>
        </div>
        {active ? (
          family === "parking-spot" ? (
            <div className={presentation.headingRow}>
              <button
                className={styles.secondary}
                disabled={createOpen}
                onClick={() => setZoneOpen(true)}
                type="button"
              >
                {t.addParkingZone}
              </button>
              {createButton}
            </div>
          ) : (
            createButton
          )
        ) : null}
      </div>
      <div
        className={presentation.panel}
        data-testid="physical-resources-surface"
      >
        <div className={presentation.panelHeader}>
          <AdministrationTabs
            active={family}
            id={`physical-${props.location.locationId}`}
            label={t.physicalResources}
            items={[
              { value: "key-slot", label: t.keySlots },
              { value: "parking-spot", label: t.parkingSpots },
            ]}
            onSelect={setFamily}
          />
        </div>
        <ReadState
          error={
            current.error
              ? new Error(administrationErrorMessage(current.error))
              : null
          }
          loading={current.loading && !current.data}
          onRetry={current.refresh}
        >
          <PhysicalResourceTable
            items={current.data?.items ?? []}
            kind={family}
            labelAllowed={active}
            operational={active}
            locale={locale}
            onLabel={(id) => setLabelTarget({ id, kind: family })}
          />
          {history.length > 0 || current.data?.nextCursor ? (
            <div className={presentation.pagination}>
              <button
                className={styles.secondary}
                disabled={current.loading || history.length === 0}
                onClick={() => {
                  const next = [...history];
                  setCursor(next.pop() ?? null);
                  setHistory(next);
                }}
                type="button"
              >
                {t.previous}
              </button>
              <button
                className={styles.secondary}
                disabled={current.loading || !current.data?.nextCursor}
                onClick={() => {
                  setHistory((items) => [...items, cursor]);
                  setCursor(current.data?.nextCursor ?? null);
                }}
                type="button"
              >
                {t.next}
              </button>
            </div>
          ) : null}
        </ReadState>
      </div>
      {zoneOpen ? (
        <ParkingZoneCreateDialog
          api={props.api}
          identityGeneration={props.identityGeneration}
          key={props.scopeKey}
          locationId={props.location.locationId}
          scopeKey={props.scopeKey}
          onClose={() => {
            setZoneOpen(false);
            setZoneReconcile(false);
          }}
          onCreated={() => {
            setZoneOpen(false);
            setZoneReconcile(false);
          }}
          onReconcile={() => {
            if (zoneReconcile) standaloneZones.refresh();
            else setZoneReconcile(true);
          }}
        />
      ) : null}
      {createOpen ? (
        <PhysicalResourceCreateDialog
          api={props.api}
          identityGeneration={props.identityGeneration}
          key={`${props.scopeKey}:create:${family}`}
          kind={family}
          locationId={props.location.locationId}
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false);
            current.refresh();
            setLabelTarget({ id, kind: family });
          }}
          onReconcile={current.refresh}
          scopeKey={`${props.scopeKey}:${family}`}
        />
      ) : null}
      {labelTarget ? (
        <ResourceLabelDialog
          api={props.api}
          key={`${props.scopeKey}:label:${labelTarget.kind}:${labelTarget.id}`}
          kind={labelTarget.kind}
          locationId={props.location.locationId}
          onClose={() => setLabelTarget(null)}
          resourceId={labelTarget.id}
          scopeKey={`${props.scopeKey}:label:${labelTarget.kind}:${labelTarget.id}`}
        />
      ) : null}
    </section>
  );
}
