"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ManagementAlertUnifiedItem } from "@valet/contracts";
import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { markManagementAlertOccurrenceSeen } from "./alert-seen-api";
import { readWithAlertTransportLease } from "./alert-read-lease";
import { readUnifiedManagementAlertDetail } from "./alert-unified-source-api";

interface Scope {
  readonly api: DashboardApiClient;
  readonly locationId: string | null;
  readonly isCurrentAuthority: () => boolean;
  readonly scopeKey: string;
  readonly panelOpen: boolean;
  readonly onServerConfirmedSeen: () => void;
}

/** No background requests. Mutations only start on the explicit Seen click. */
export function useUnifiedAlertActions(options: Scope) {
  const [seenPending, setSeenPending] = useState<{
    scope: string;
    id: string;
  } | null>(null);
  const [seenFailed, setSeenFailed] = useState<{
    scope: string;
    id: string;
  } | null>(null);
  const [detailPending, setDetailPending] = useState<{
    scope: string;
    id: string;
  } | null>(null);
  const [detailFailed, setDetailFailed] = useState<{
    scope: string;
    id: string;
  } | null>(null);
  const [detailState, setDetail] = useState<{
    scope: string;
    item: ManagementAlertUnifiedItem;
  } | null>(null);
  const seenAbort = useRef<AbortController | null>(null);
  const detailAbort = useRef<AbortController | null>(null);
  const detailInFlightId = useRef<string | null>(null);

  const cancelPending = useCallback(() => {
    detailAbort.current?.abort();
    detailAbort.current = null;
    detailInFlightId.current = null;
    seenAbort.current?.abort();
    seenAbort.current = null;
  }, []);

  useEffect(() => {
    return () => cancelPending();
  }, [options.scopeKey, options.panelOpen, cancelPending]);

  const onSeen = useCallback(
    (item: ManagementAlertUnifiedItem) => {
      const locationId = options.locationId;
      if (
        seenAbort.current !== null ||
        !options.panelOpen ||
        locationId === null ||
        item.caseKind !== "OCCURRENCE" ||
        !options.isCurrentAuthority()
      )
        return;
      const controller = new AbortController();
      seenAbort.current = controller;
      setSeenPending({ scope: options.scopeKey, id: item.id });
      setSeenFailed(null);
      void markManagementAlertOccurrenceSeen(
        options.api,
        locationId,
        item,
        () => !controller.signal.aborted && options.isCurrentAuthority(),
        controller.signal,
      )
        .then(
          () => {
            if (
              controller.signal.aborted ||
              seenAbort.current !== controller ||
              !options.isCurrentAuthority()
            )
              return;
            options.onServerConfirmedSeen();
          },
          () => {
            if (!controller.signal.aborted && options.isCurrentAuthority())
              setSeenFailed({ scope: options.scopeKey, id: item.id });
          },
        )
        .finally(() => {
          if (seenAbort.current === controller) {
            seenAbort.current = null;
            if (options.isCurrentAuthority()) setSeenPending(null);
          }
        });
    },
    [options],
  );

  const onDetails = useCallback(
    (item: ManagementAlertUnifiedItem) => {
      if (
        detailAbort.current !== null &&
        !detailAbort.current.signal.aborted &&
        detailInFlightId.current === item.id
      )
        return;
      detailAbort.current?.abort();
      detailAbort.current = null;
      detailInFlightId.current = null;
      if (
        !options.panelOpen ||
        options.locationId === null ||
        !options.isCurrentAuthority()
      )
        return;
      const locationId = options.locationId;
      const controller = new AbortController();
      detailAbort.current = controller;
      detailInFlightId.current = item.id;
      setDetail(null);
      setDetailFailed(null);
      setDetailPending({ scope: options.scopeKey, id: item.id });
      void readWithAlertTransportLease(
        controller.signal,
        () => !controller.signal.aborted && options.isCurrentAuthority(),
        (signal) =>
          readUnifiedManagementAlertDetail(
            options.api,
            locationId,
            item,
            signal,
            () => !controller.signal.aborted && options.isCurrentAuthority(),
          ),
      )
        .then(
          (response) => {
            if (controller.signal.aborted || !options.isCurrentAuthority())
              return;
            setDetail({ scope: options.scopeKey, item: response.item });
          },
          () => {
            if (controller.signal.aborted || !options.isCurrentAuthority())
              return;
            setDetailFailed({ scope: options.scopeKey, id: item.id });
          },
        )
        .finally(() => {
          if (detailAbort.current === controller) {
            detailAbort.current = null;
            detailInFlightId.current = null;
            if (options.isCurrentAuthority()) setDetailPending(null);
          }
        });
    },
    [options],
  );

  return {
    detail:
      detailState?.scope === options.scopeKey && options.panelOpen
        ? detailState.item
        : null,
    detailPendingId:
      detailPending?.scope === options.scopeKey && options.panelOpen
        ? detailPending.id
        : null,
    detailFailedId:
      detailFailed?.scope === options.scopeKey && options.panelOpen
        ? detailFailed.id
        : null,
    seenPendingId:
      seenPending?.scope === options.scopeKey ? seenPending.id : null,
    seenFailedId:
      seenFailed?.scope === options.scopeKey && options.panelOpen
        ? seenFailed.id
        : null,
    onDetails,
    onSeen,
    cancelPending,
  };
}
