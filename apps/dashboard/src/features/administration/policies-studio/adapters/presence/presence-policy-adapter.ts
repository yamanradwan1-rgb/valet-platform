import {
  shiftPresenceCompanySetRequestSchema,
  shiftPresenceLocationClearRequestSchema,
  shiftPresenceLocationSetRequestSchema,
} from "@valet/contracts";
import type {
  PresenceApi,
  PresenceCompany,
  PresenceLocation,
} from "../../../settings/shift-presence-api";
import type { PresenceMutation } from "../../../settings/use-shift-presence-mutation";
import { presenceId } from "../../../settings/shift-presence-id";
import {
  presenceFields,
  presencePolicyContext,
  presencePolicyIntent,
  requiresStrictPresenceConfirmation,
  type Field,
  type PresencePolicyDraftState,
} from "../../../settings/shift-presence-policy-fields";

export type PresenceWriteOutcome =
  | "SAVED"
  | "NO_CHANGE"
  | "INVALID"
  | "CONFLICT"
  | "STRICT_CONFIRMATION_REQUIRED"
  | "BLOCKED"
  | "UNRESOLVED";

export interface PresencePolicyWriteDeps {
  readonly api: Pick<PresenceApi, "setPolicy" | "clearPolicy">;
  readonly mutation: Pick<PresenceMutation, "run" | "blocked">;
  readonly current: () => boolean;
}

/** Reuses the existing per-field CAS, strict-confirmation and exact-result path. */
export async function saveStudioPresencePolicy(
  data: PresenceCompany | PresenceLocation,
  fieldName: Field["field"],
  draft: PresencePolicyDraftState,
  strictConfirmed: boolean,
  deps: PresencePolicyWriteDeps,
): Promise<PresenceWriteOutcome> {
  if (!deps.current() || deps.mutation.blocked || !data.capabilities.canEdit)
    return "BLOCKED";
  const field = presenceFields.find((candidate) => candidate.field === fieldName);
  if (!field) return "INVALID";
  const intent = presencePolicyIntent(data, field, draft);
  if (intent.kind === "NONE") return "NO_CHANGE";
  if (intent.kind === "INVALID") return "INVALID";
  if (intent.kind === "CONFLICT") return "CONFLICT";
  const location = "overrides" in data;
  if (intent.kind === "CLEAR" && !location) return "INVALID";
  const clear = intent.kind === "CLEAR";
  const proposed = intent.kind === "SET"
    ? intent.value
    : location ? data.company[field.key] : null;
  if (proposed === null) return "INVALID";
  if (
    !strictConfirmed &&
    requiresStrictPresenceConfirmation(intent.savedValue, proposed, clear)
  )
    return "STRICT_CONFIRMATION_REQUIRED";
  const mutationId = presenceId();
  const context = presencePolicyContext(data);
  const body = clear
    ? shiftPresenceLocationClearRequestSchema.parse({
        ...context, mutationId, field: fieldName,
      })
    : (location
        ? shiftPresenceLocationSetRequestSchema
        : shiftPresenceCompanySetRequestSchema
      ).parse({ ...context, mutationId, field: fieldName, value: proposed });
  if (!deps.current() || deps.mutation.blocked) return "BLOCKED";
  const result = await deps.mutation.run(
    { mutationId, query: { kind: "POLICY" } },
    async () => ({
      kind: "POLICY" as const,
      value: clear
        ? await deps.api.clearPolicy(body)
        : await deps.api.setPolicy(body),
    }),
  );
  if (!deps.current()) return "BLOCKED";
  return result?.kind === "POLICY" ? "SAVED" : "UNRESOLVED";
}
