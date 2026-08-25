"use client";

import { useState } from "react";
import type { KeySlotOverviewEntry } from "@valet/contracts";

import { EmptyState, ErrorState } from "../../components/ui/empty-state";
import { PageHeader } from "../../components/ui/page-header";
import { Skeleton } from "../../components/ui/skeleton";
import { StatusBadge } from "../../components/ui/status-badge";
import { useAuth } from "../auth/use-auth";
import { useDashboardLocation } from "../location/location-context";
import { useTranslation } from "../../i18n/locale-provider";

import { DetailField, DetailSheet } from "./detail-sheet";
import { overviewErrorMessageKey } from "./error-message";
import { shortIdentifier } from "./format-identifier";
import { KpiStat } from "./kpi-stat";
import { LoadMoreSection } from "./load-more-section";
import { fetchKeySlotsPage } from "./overview-endpoints";
import { useOverviewCursorList } from "./use-overview-cursor-list";

/**
 * Key Custody Board — read-only.
 *
 * Renders exactly the contract fields: `keySlotId`, `code`, `slotStatus`
 * (ACTIVE | INACTIVE) and `holdingSessionId` (uuid | null). A null holding
 * session is shown as "No holding session"; holder identity, timestamps and
 * custody history are not invented. The board exposes no key mutations —
 * those belong to the employee app, not this dashboard surface.
 */
export function KeysCustodyView() {
  const { t } = useTranslation();
  const { client } = useAuth();
  const location = useDashboardLocation();
  const locationId = location?.locationId ?? null;
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);

  const list = useOverviewCursorList<KeySlotOverviewEntry>({
    enabled: locationId !== null,
    fetchPage: (cursor) => {
      if (locationId === null) {
        return Promise.reject(new Error("overview location unconfigured"));
      }
      return fetchKeySlotsPage(client, locationId, cursor);
    },
  });

  const {
    status,
    items,
    nextCursor,
    error,
    paginationError,
    load,
    loadMore,
  } = list;
  const activeCount = items.filter((slot) => slot.slotStatus === "ACTIVE")
    .length;
  const holdingCount = items.filter(
    (slot) => slot.holdingSessionId !== null,
  ).length;
  const selected = items.find((slot) => slot.keySlotId === selectedSlotId);

  if (locationId === null) {
    return (
      <>
        <PageHeader
          title={t("page.keys.title")}
          description={t("page.keys.description")}
        />
        <p className="scope-note">{t("placeholder.locationMissingNote")}</p>
      </>
    );
  }

  const showInitialSkeleton =
    status === "idle" || (status === "loading" && items.length === 0);
  const showInitialError = status === "error" && items.length === 0;
  const showEmpty =
    !showInitialSkeleton && !showInitialError && items.length === 0;

  return (
    <>
      <PageHeader
        title={t("page.keys.title")}
        description={t("page.keys.description")}
      />
      <div className="overview-kpi-grid is-sm-three">
        <KpiStat label={t("page.keys.kpiSlots")} value={items.length} />
        <KpiStat
          label={t("page.keys.kpiActiveSlots")}
          value={activeCount}
          accentColor="var(--success)"
        />
        <KpiStat
          label={t("page.keys.kpiHoldingSession")}
          value={holdingCount}
        />
      </div>
      <p className="scope-note">{t("page.keys.scopeNote")}</p>

      {showInitialSkeleton && <Skeleton lines={6} label={t("states.loading")} />}
      {showInitialError && (
        <ErrorState
          message={t(overviewErrorMessageKey(error))}
          onRetry={load}
          retryLabel={t("actions.retry")}
        />
      )}
      {showEmpty && <EmptyState message={t("page.keys.empty")} />}

      {items.length > 0 && (
        <>
          <div className="key-board-grid">
            {items.map((slot) => (
              <button
                key={slot.keySlotId}
                type="button"
                className="key-card"
                onClick={() => setSelectedSlotId(slot.keySlotId)}
              >
                <span className="key-card-head">
                  <span>
                    <p className="key-card-code">{slot.code}</p>
                    <p className="key-card-id">
                      {shortIdentifier(slot.keySlotId)}
                    </p>
                  </span>
                  <StatusBadge variant="key" value={slot.slotStatus} />
                </span>
                <span>
                  <p className="key-card-holding-label">
                    {t("page.keys.holdingSessionIdLabel")}
                  </p>
                  {slot.holdingSessionId === null ? (
                    <p className="key-card-holding-value is-text">
                      {t("page.keys.noHoldingSession")}
                    </p>
                  ) : (
                    <p className="key-card-holding-value">
                      {shortIdentifier(slot.holdingSessionId)}
                    </p>
                  )}
                </span>
              </button>
            ))}
          </div>
          <LoadMoreSection
            nextCursor={nextCursor}
            isLoadingMore={status === "loadingMore"}
            paginationError={paginationError}
            onLoadMore={loadMore}
          />
        </>
      )}

      {selected !== undefined && (
        <DetailSheet
          title={t("page.keys.detailTitle")}
          closeLabel={t("shell.closeNavigation")}
          onClose={() => setSelectedSlotId(null)}
        >
          <DetailField
            label={t("page.keys.field.keySlotId")}
            mono
          >
            {selected.keySlotId}
          </DetailField>
          <DetailField label={t("page.keys.field.code")}>
            {selected.code}
          </DetailField>
          <DetailField label={t("page.keys.field.status")}>
            <StatusBadge variant="key" value={selected.slotStatus} size="md" />
          </DetailField>
          <DetailField
            label={t("page.keys.holdingSessionIdLabel")}
            mono
          >
            {selected.holdingSessionId ?? t("page.keys.noHoldingSession")}
          </DetailField>
        </DetailSheet>
      )}
    </>
  );
}
