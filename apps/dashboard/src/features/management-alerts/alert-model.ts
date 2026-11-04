import type { RuntimeSchema } from "../../lib/api/dashboard-api-client";

export const phaseOneCategories = [
  "ALT-01", "ALT-02", "ALT-03", "ALT-08", "ALT-12",
] as const;
export type PhaseOneCategory = (typeof phaseOneCategories)[number];
export type AlertSeverity = "CRITICAL" | "IMPORTANT";

export interface ManagementAlertItem {
  readonly id: string;
  readonly category: PhaseOneCategory;
  readonly severity: AlertSeverity;
  readonly sourceKind: "RETRIEVAL" | "TASK" | "INCIDENT" | "PRESENCE";
  readonly sourceId: string;
  readonly episodeId: string;
  readonly locationId: string;
  readonly occurredAt: string;
  readonly title: string;
}

export interface ManagementAlertPreview {
  readonly items: readonly ManagementAlertItem[];
  readonly count: number;
  readonly hasMore: boolean;
}

const sources: Record<PhaseOneCategory, ManagementAlertItem["sourceKind"]> = {
  "ALT-01": "RETRIEVAL",
  "ALT-02": "TASK",
  "ALT-03": "TASK",
  "ALT-08": "INCIDENT",
  "ALT-12": "PRESENCE",
};

const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 256;

export function previewSchemaForLocation(
  locationId: string,
): RuntimeSchema<ManagementAlertPreview> {
  return {
    safeParse(value) {
      if (typeof value !== "object" || value === null) return { success: false };
      const data = value as Record<string, unknown>;
      if (
        !Array.isArray(data.items) || data.items.length > 20 ||
        !Number.isInteger(data.count) || (data.count as number) < 0 ||
        (data.count as number) > 20 || typeof data.hasMore !== "boolean"
      ) return { success: false };
      const items: ManagementAlertItem[] = [];
      for (const entry of data.items) {
        if (typeof entry !== "object" || entry === null) return { success: false };
        const item = entry as Record<string, unknown>;
        const category = item.category as PhaseOneCategory;
        if (
          !phaseOneCategories.includes(category) ||
          item.sourceKind !== sources[category] ||
          (item.severity !== "CRITICAL" && item.severity !== "IMPORTANT") ||
          !nonempty(item.id) || !nonempty(item.sourceId) ||
          !nonempty(item.episodeId) || item.locationId !== locationId ||
          !nonempty(item.occurredAt) || !Number.isFinite(Date.parse(item.occurredAt)) ||
          typeof item.title !== "string" || item.title.length > 160
        ) return { success: false };
        items.push(item as unknown as ManagementAlertItem);
      }
      if ((data.count as number) < items.length) return { success: false };
      return {
        success: true,
        data: {
          items: items.sort((a, b) =>
            a.severity === b.severity ? 0 : a.severity === "CRITICAL" ? -1 : 1),
          count: data.count as number,
          hasMore: data.hasMore,
        },
      };
    },
  };
}

export function alertBadge(preview: ManagementAlertPreview): string {
  return preview.hasMore || preview.count >= 20 ? "20+" : String(preview.count);
}
