import { describe, expect, it } from "vitest";
import { dashboardLocales } from "../../lib/i18n/locale";
import { contextHelpFor, contextHelpRegistry, isContextHelpKey } from "./context-help-registry";
import { inspectHelpCatalog, inspectRawHelpKeys } from "./context-help-coverage-contract";
import type { ContextHelpCopy } from "./context-help-types";
import { helppages } from "./help-pages";
import { helpoperations } from "./help-operations";
import { helpintelligence } from "./help-intelligence";
import { helpadministration } from "./help-administration";
import { helpsettings } from "./help-settings";
import { helppresence } from "./help-presence";
import { helpaccount } from "./help-account";

const entries = Object.entries(contextHelpRegistry);
const keys = entries.map(([key]) => key);
const rawCatalogs = [
  helppages, helpoperations, helpintelligence, helpadministration,
  helpsettings, helppresence, helpaccount,
] as const;

describe("contextual help bilingual static catalog", () => {
  it("rejects duplicate keys across raw source modules before object spreading", () => {
    expect(inspectRawHelpKeys(rawCatalogs)).toEqual([]);
    const rawKeys = rawCatalogs.flatMap((catalog) => Object.keys(catalog));
    expect(rawKeys).toHaveLength(111);
    expect(rawKeys.slice().sort()).toEqual(keys.slice().sort());
    const collision = { "live.page": helpoperations["live.kpis"] };
    expect(inspectRawHelpKeys([helppages, collision]))
      .toEqual(["Duplicate raw help key: live.page"]);
  });
  it("provides exactly one substantial English and Arabic explanation for all 111 semantic IDs", () => {
    expect(keys).toHaveLength(111);
    expect(new Set(keys).size).toBe(keys.length);
    expect(dashboardLocales).toEqual(["en", "ar"]);
    expect(inspectHelpCatalog(entries, keys)).toEqual([]);
    for (const [key, copy] of entries) {
      expect(Object.keys(copy).sort(), key).toEqual(["ar", "en"]);
      expect(contextHelpFor(key as keyof typeof contextHelpRegistry, "en")).toEqual(copy.en);
      expect(contextHelpFor(key as keyof typeof contextHelpRegistry, "ar")).toEqual(copy.ar);
      expect(copy.en.body).not.toEqual(copy.ar.body);
      expect(copy.ar.title).toMatch(/[\u0600-\u06ff]/);
    }
  });

  it("has no permissive unknown-key fallback or data-dependent help lookup", () => {
    expect(isContextHelpKey("live.sessionDetail")).toBe(true);
    expect(isContextHelpKey("live.nonexistent")).toBe(false);
    expect(isContextHelpKey("__proto__")).toBe(false);
    expect(isContextHelpKey("/integrations")).toBe(false);
    expect(contextHelpFor("setting.releaseRequiresPayment", "ar").body)
      .toContain("التحقق");
  });

  it("detects missing copies, generic placeholders, and blank explanatory text", () => {
    const complete: ContextHelpCopy = {
      en: { title: "Valid English", body: "A complete factual explanation with enough context to cover the authorized workflow and its limits." },
      ar: { title: "عنوان عربي", body: "هذا وصف حقيقي لإجراء إداري مخوّل، وحدود الصلاحية والفترة الزمنية وقيمة الإعداد قبل الحفظ وبعده." },
    };
    const missing = { en: complete.en } as unknown as ContextHelpCopy;
    expect(inspectHelpCatalog([["x", missing]], ["x"])).toContain("Missing locale: x");
    const blank = { ...complete, en: { title: " ", body: " " } };
    expect(inspectHelpCatalog([["x", blank]], ["x"])).toContain("Insufficient en copy: x");
    const generic = { ...complete, en: { ...complete.en, body: "This section manages information." } };
    expect(inspectHelpCatalog([["x", generic]], ["x"])).toContain("Generic placeholder: x");
  });

  it("detects duplicated, undeclared, and missing semantic IDs", () => {
    const copy = contextHelpRegistry["live.page"];
    expect(inspectHelpCatalog([["a", copy], ["a", copy]], ["a"]))
      .toContain("Duplicate registry key: a");
    expect(inspectHelpCatalog([["a", copy]], ["a", "a"]))
      .toContain("Duplicate declared key: a");
    expect(inspectHelpCatalog([["a", copy]], ["b"]))
      .toEqual(expect.arrayContaining(["Orphan registry key: a", "Missing registry key: b"]));
  });

  it("describes availability without inventing released audit enrichment or continuous GPS", () => {
    expect(contextHelpRegistry["audit.detail"].en.body).toContain("remain hidden");
    expect(contextHelpRegistry["maps.page"].en.body).toContain("Never infer continuous employee tracking");
    expect(contextHelpRegistry["services.status"].en.body).toContain("There is no Save");
    expect(contextHelpRegistry["roles.page"].en.body).toContain("not a role builder");
  });
});
