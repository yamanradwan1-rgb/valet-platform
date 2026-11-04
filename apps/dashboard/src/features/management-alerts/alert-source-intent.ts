import {
  phaseOneCategories,
  type ManagementAlertItem,
  type PhaseOneCategory,
} from "./alert-model";

export interface AlertSourceIntent {
  readonly category: PhaseOneCategory;
  readonly sourceId: string;
  readonly episodeId: string;
}

export type AlertSourceKind = ManagementAlertItem["sourceKind"];

export const alertSourceKind: Record<PhaseOneCategory, AlertSourceKind> = {
  "ALT-01": "RETRIEVAL",
  "ALT-02": "TASK",
  "ALT-03": "TASK",
  "ALT-08": "INCIDENT",
  "ALT-12": "PRESENCE",
};

const queryFields = [
  "alertCategory",
  "alertSourceId",
  "alertEpisodeId",
] as const;

function safeSelector(value: string | null): value is string {
  return value !== null && value.length >= 1 && value.length <= 256 &&
    !Array.from(value).some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    );
}

export function parseAlertSourceIntent(
  params: Pick<URLSearchParams, "get" | "getAll">,
  kind: AlertSourceKind,
): AlertSourceIntent | null {
  if (queryFields.some((field) => params.getAll(field).length !== 1)) return null;
  const category = params.get("alertCategory");
  const sourceId = params.get("alertSourceId");
  const episodeId = params.get("alertEpisodeId");
  if (
    !safeSelector(category) || !phaseOneCategories.includes(category as PhaseOneCategory) ||
    alertSourceKind[category as PhaseOneCategory] !== kind ||
    !safeSelector(sourceId) || !safeSelector(episodeId)
  ) return null;
  return { category: category as PhaseOneCategory, sourceId, episodeId };
}

export function alertSourceHref(item: ManagementAlertItem): string {
  const path = item.sourceKind === "RETRIEVAL"
    ? "/live-operations" : item.sourceKind === "TASK"
      ? "/tasks" : item.sourceKind === "INCIDENT"
        ? "/incidents" : "/policies";
  const params = new URLSearchParams();
  if (item.sourceKind === "PRESENCE") params.set("section", "presence");
  params.set("alertCategory", item.category);
  params.set("alertSourceId", item.sourceId);
  params.set("alertEpisodeId", item.episodeId);
  return `${path}?${params.toString()}`;
}

export function clearAlertIntentFromUrl(): void {
  const url = new URL(window.location.href);
  for (const field of queryFields) url.searchParams.delete(field);
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}
