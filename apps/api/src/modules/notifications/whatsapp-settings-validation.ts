export interface WhatsAppPolicyMutation {
  readonly enabled: boolean | null;
  readonly language: "ar" | "en" | null;
  readonly templateCatalogVersion: string | null;
  readonly providerBindingId: string | null;
  readonly expectedRevision: number;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateWhatsAppPolicy(value: unknown): WhatsAppPolicyMutation {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("WHATSAPP_SETTINGS_INVALID");
  const row = value as Record<string, unknown>;
  const keys = Object.keys(row);
  if (keys.length !== 6 ||
    keys.some((key) => !["enabled", "language", "templateCatalogVersion",
      "providerBindingId", "revision", "expectedRevision"].includes(key)) ||
    !(row.enabled === null || typeof row.enabled === "boolean") ||
    !(row.language === null || row.language === "ar" || row.language === "en") ||
    !(row.templateCatalogVersion === null ||
      (typeof row.templateCatalogVersion === "string" &&
        /^[a-zA-Z0-9_.-]{1,128}$/.test(row.templateCatalogVersion))) ||
    !(row.providerBindingId === null ||
      (typeof row.providerBindingId === "string" && uuid.test(row.providerBindingId))) ||
    !Number.isInteger(row.revision) || !Number.isInteger(row.expectedRevision) ||
    row.revision !== row.expectedRevision || Number(row.expectedRevision) < 0) {
    throw new Error("WHATSAPP_SETTINGS_INVALID");
  }
  return row as unknown as WhatsAppPolicyMutation;
}

/** Values are provisioned by server operators after Meta approval; empty by default. */
export function approvedTemplateVersions(env: NodeJS.ProcessEnv): readonly string[] {
  const raw = env.OUTBOUND_VERIFIED_TEMPLATE_CATALOG_VERSIONS ?? "";
  if (raw.length > 2048) return [];
  return [...new Set(raw.split(",").map((s) => s.trim()).filter(
    (s) => /^[a-zA-Z0-9_.-]{1,128}$/.test(s),
  ))].slice(0, 32);
}
