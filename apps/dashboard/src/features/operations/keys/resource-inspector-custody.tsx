"use client";

import { useCallback } from "react";

import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { useAuthoritativeRead } from "../../administration/use-authoritative-read";
import { readResourceInspectorCustody } from "./resource-inspector-contract";
import type { inspectorCopy } from "./resource-inspector-copy";

type Copy = ReturnType<typeof inspectorCopy>;

export function ResourceInspectorCustody(props: {
  readonly api: DashboardApiClient;
  readonly locationId: string;
  readonly keySlotId: string;
  readonly scopeKey: string;
  readonly t: Copy;
}) {
  const { api, locationId, keySlotId, scopeKey, t } = props;
  const load = useCallback(
    (signal: AbortSignal) => readResourceInspectorCustody(api, locationId, keySlotId, signal),
    [api, locationId, keySlotId],
  );
  const read = useAuthoritativeRead(
    `${scopeKey}:304:key-custody:${keySlotId}`,
    load,
    Boolean(locationId && keySlotId),
  );

  if (read.loading) return <p className="c-empty-events" role="status">{t.loading}</p>;
  if (read.error) {
    return (
      <div className="c-empty-events" role="alert">
        <p>{t.custodyError}</p>
        <button className="c-quiet-action" onClick={read.refresh} type="button">{t.retry}</button>
      </div>
    );
  }
  if (!read.data?.items.length) return <p className="c-empty-events">{t.noCustody}</p>;

  const events = read.data.items;
  const eventNames = {
    SLOT_ASSIGNED: t.slotAssigned,
    CHECKED_OUT: t.checkout,
    RETURNED_TO_SLOT: t.returned,
    SLOT_CLEARED: t.slotCleared,
    RELEASED: t.released,
  } as const;
  return (
    <>
      <ol className="c-timeline" aria-label={t.custody}>
        {events.map((event) => (
          <li key={event.eventId} data-event={event.eventType}>
            <div className="c-timeline-title">
              <span>{eventNames[event.eventType]}</span>
              <time className="c-timeline-time" dateTime={event.occurredAt} dir="ltr">
                {event.occurredAt}
              </time>
            </div>
            <div className="c-timeline-actor">{event.actorName || t.unknownActor}</div>
          </li>
        ))}
      </ol>
      {read.data.hasMore ? <p className="c-empty-events">{t.moreCustody}</p> : null}
    </>
  );
}
