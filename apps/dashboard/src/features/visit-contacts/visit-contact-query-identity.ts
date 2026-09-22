import type { VisitSearchMode } from "./visit-contacts-api";

export interface VisitContactSearchDraft {
  readonly name: string;
  readonly phone: string;
  readonly plate: string;
  readonly plateCountry: string;
}

export function normalizeVisitSearchIdentity(
  mode: VisitSearchMode,
  draft: VisitContactSearchDraft,
): string {
  const normalize = (value: string) => value.trim().normalize("NFKC");
  if (mode === "NAME") return `NAME:${normalize(draft.name)}`;
  if (mode === "PHONE") return `PHONE:${normalize(draft.phone)}`;
  return `PLATE:${normalize(draft.plateCountry).toUpperCase()}:${normalize(draft.plate)}`;
}

export function visitContactSearchRequestKey(input: {
  readonly scopeKey: string;
  readonly queryIdentity: string | null;
  readonly cursor: string | null;
  readonly revision: number;
}): string {
  return [
    input.scopeKey,
    input.queryIdentity ?? "no-query",
    input.cursor ?? "first",
    input.revision,
  ].join(":");
}
