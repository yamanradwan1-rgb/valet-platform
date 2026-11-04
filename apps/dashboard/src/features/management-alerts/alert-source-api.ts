import type { DashboardApiClient, RuntimeSchema } from "../../lib/api/dashboard-api-client";
import { previewSchemaForLocation, type ManagementAlertItem } from "./alert-model";
import type { AlertSourceIntent } from "./alert-source-intent";

export interface AlertSourceDetail {
  readonly item: ManagementAlertItem;
  readonly valetSessionId: string | null;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function alertSourceSchema(
  locationId: string,
  intent: AlertSourceIntent,
): RuntimeSchema<AlertSourceDetail> {
  return {
    safeParse(input) {
      if (typeof input !== "object" || input === null) return { success: false };
      const response = input as Record<string, unknown>;
      const candidate = previewSchemaForLocation(locationId).safeParse({
        items: [response.item],
        count: 1,
        hasMore: false,
      });
      if (!candidate.success) return { success: false };
      const item = candidate.data.items[0];
      if (
        item === undefined ||
        item.category !== intent.category ||
        item.sourceId !== intent.sourceId ||
        item.episodeId !== intent.episodeId ||
        (response.valetSessionId !== null &&
          (typeof response.valetSessionId !== "string" ||
            !uuid.test(response.valetSessionId)))
      ) return { success: false };
      return {
        success: true,
        data: { item, valetSessionId: response.valetSessionId as string | null },
      };
    },
  };
}

/** Exact source and current episode; server reauthorizes before any projection. */
export function readAlertSourceDetail(
  api: DashboardApiClient,
  locationId: string,
  intent: AlertSourceIntent,
  signal?: AbortSignal,
) {
  return api.request(
    `/v1/staff/dashboard/locations/${encodeURIComponent(locationId)}/alerts/sources/${encodeURIComponent(intent.category)}/${encodeURIComponent(intent.sourceId)}`,
    alertSourceSchema(locationId, intent),
    { signal, query: { episodeId: intent.episodeId } },
  );
}
