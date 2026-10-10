import type { ContextHelpCopy } from "./context-help-types";
import type { HelpRoute } from "./help-route-manifest";

// Inspect raw source catalogs before object spreads can silently overwrite IDs.
export function inspectRawHelpKeys(
  sources: readonly Readonly<Record<string, ContextHelpCopy>>[],
): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const source of sources) {
    for (const key of Object.keys(source)) {
      if (seen.has(key)) duplicates.push("Duplicate raw help key: " + key);
      seen.add(key);
    }
  }
  return duplicates;
}

// Pure checks make negative omission/duplication tests meaningful independently
// of TypeScript object-literal constraints.
export function inspectHelpCatalog(
  entries: readonly (readonly [string, ContextHelpCopy])[],
  declaredKeys: readonly string[],
): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const declarations = new Set<string>();
  for (const key of declaredKeys) {
    if (declarations.has(key)) problems.push("Duplicate declared key: " + key);
    declarations.add(key);
  }
  for (const [key, copy] of entries) {
    if (seen.has(key)) problems.push("Duplicate registry key: " + key);
    seen.add(key);
    if (!declarations.has(key)) problems.push("Orphan registry key: " + key);
    if (!copy.en || !copy.ar) {
      problems.push("Missing locale: " + key);
      continue;
    }
    for (const locale of ["en", "ar"] as const) {
      const title = copy[locale].title.trim();
      const body = copy[locale].body.trim();
      if (title.length < 3 || body.length < 60) {
        problems.push("Insufficient " + locale + " copy: " + key);
      }
      if (/^(this section manages information|this section manages data|manage information|هذا القسم يدير المعلومات)/i.test(body)) {
        problems.push("Generic placeholder: " + key);
      }
    }
  }
  for (const key of declarations) {
    if (!seen.has(key)) problems.push("Missing registry key: " + key);
  }
  return problems;
}

export function inspectRouteInventory(
  actualRoutes: readonly string[],
  manifest: Readonly<Record<string, HelpRoute>>,
): string[] {
  const problems: string[] = [];
  const actual = new Set(actualRoutes);
  for (const route of actualRoutes) {
    if (!(route in manifest)) problems.push("Unclassified route: " + route);
  }
  for (const [route, record] of Object.entries(manifest)) {
    if (!actual.has(route)) problems.push("Obsolete route: " + route);
    if (record.classification === "CONTENT" && !record.helpKey) {
      problems.push("Content route missing help: " + route);
    }
    if (record.classification !== "CONTENT" && "helpKey" in record) {
      problems.push("Excluded route exposes help: " + route);
    }
  }
  if (actual.size !== actualRoutes.length) problems.push("Duplicate route inventory");
  return problems;
}

export function inspectSettingInventory(
  sourceFields: readonly string[],
  settingHelp: Readonly<Record<string, string>>,
  prefix: string,
): string[] {
  const problems: string[] = [];
  const source = new Set(sourceFields);
  if (sourceFields.length !== source.size) problems.push("Duplicate source setting");
  for (const field of source) {
    if (!(field in settingHelp)) problems.push("Missing setting help: " + field);
    else if (settingHelp[field] !== prefix + field) {
      problems.push("Incorrect setting help: " + field);
    }
  }
  for (const field of Object.keys(settingHelp)) {
    if (!source.has(field)) problems.push("Obsolete setting help: " + field);
  }
  if (new Set(Object.values(settingHelp)).size !== Object.values(settingHelp).length) {
    problems.push("Duplicate setting help values");
  }
  return problems;
}
