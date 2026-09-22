export type VisitHistorySubject =
  | { readonly kind: "CUSTOMER"; readonly id: string }
  | { readonly kind: "VEHICLE"; readonly id: string };

export function visitHistoryRequestKey(input: {
  readonly scopeKey: string;
  readonly subject: VisitHistorySubject;
  readonly cursor: string | null;
  readonly revision: number;
}): string {
  return [
    input.scopeKey,
    input.subject.kind,
    input.subject.id,
    input.cursor ?? "first",
    input.revision,
  ].join(":");
}
