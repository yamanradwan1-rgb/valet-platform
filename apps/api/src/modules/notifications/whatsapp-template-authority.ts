/** Server-managed evidence registry; absence means no template is approved. */
interface ApprovedTemplate {
  readonly organizationId: string;
  readonly wabaId: string;
  readonly catalogVersion: string;
  readonly locale: "ar" | "en";
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const versionPattern = /^[A-Za-z0-9_.-]{1,128}$/;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** No default, wildcard tenant, or unverified provider-side template inference. */
export function approvedTemplates(env: NodeJS.ProcessEnv): readonly ApprovedTemplate[] {
  const raw = env.OUTBOUND_APPROVED_META_TEMPLATES_JSON;
  if (!raw || raw.length > 16_384) return [];
  let decoded: unknown;
  try { decoded = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(decoded) || decoded.length > 64) return [];
  const entries: ApprovedTemplate[] = [];
  for (const item of decoded) {
    if (!record(item) || Object.keys(item).length !== 4 ||
        typeof item.organizationId !== "string" || !uuid.test(item.organizationId) ||
        typeof item.wabaId !== "string" || !/^[0-9]{5,25}$/.test(item.wabaId) ||
        typeof item.catalogVersion !== "string" ||
        !versionPattern.test(item.catalogVersion) ||
        (item.locale !== "ar" && item.locale !== "en")) return [];
    entries.push(item as unknown as ApprovedTemplate);
  }
  return entries;
}

export function templateApprovedForAccount(
  env: NodeJS.ProcessEnv,
  organizationId: string,
  wabaId: string,
  version: string,
  locale: "ar" | "en",
): boolean {
  return approvedTemplates(env).some((entry) =>
    entry.organizationId === organizationId &&
    entry.wabaId === wabaId &&
    entry.catalogVersion === version &&
    entry.locale === locale);
}

export function availableTenantTemplateVersions(
  env: NodeJS.ProcessEnv,
  organizationId: string,
  verifiedWabaIds: readonly string[],
): readonly string[] {
  return [...new Set(approvedTemplates(env)
    .filter((entry) => entry.organizationId === organizationId &&
      verifiedWabaIds.includes(entry.wabaId))
    .map((entry) => entry.catalogVersion))];
}
