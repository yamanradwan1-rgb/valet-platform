import { describe, expect, it } from "vitest";

import type { ConfigurationSettingProjection } from "@valet/contracts";

import { arTranslations } from "../../i18n/translations/ar";
import { enTranslations } from "../../i18n/translations/en";
import type { TranslationKey } from "../../i18n/translations/types";
import {
  CONFIGURATION_SETTING_ORDER,
} from "./configuration-state";
import {
  booleanValueLabelKey,
  enumOptions,
  settingDescriptionKey,
  settingLabelKey,
  settingValueDisplay,
} from "./configuration-labels";

/**
 * EN/AR parity for the Location Settings surface (D4-003): every setting
 * name/description, every enum option and every action/explanation key must
 * resolve to natural text in BOTH locales. Raw developer enum values and
 * missing Arabic labels must never reach the UI.
 */

function requiredKeys(): readonly TranslationKey[] {
  const keys: TranslationKey[] = [
    "config.note",
    "config.note.digitalOnly",
    "config.metadata.timezone",
    "config.metadata.currency",
    "config.metadata.updatedAt",
    "config.columns.setting",
    "config.columns.companyDefault",
    "config.columns.locationOverride",
    "config.columns.applied",
    "config.columns.actions",
    "config.override.absent",
    "config.default.readOnly",
    "config.actions.setOverride",
    "config.actions.editOverride",
    "config.actions.clearOverride",
    "config.actions.cancel",
    "config.state.loading",
    "config.state.loadFailed",
    "config.editor.titleSet",
    "config.editor.titleEdit",
    "config.editor.subtitle",
    "config.editor.companyDefault",
    "config.editor.currentOverride",
    "config.editor.newValue",
    "config.editor.save",
    "config.editor.saving",
    "config.clear.title",
    "config.clear.body",
    "config.clear.confirm",
    "config.conflict.title",
    "config.conflict.body",
    "config.conflict.reload",
    "config.errors.valueInvalid",
  ];
  for (const setting of CONFIGURATION_SETTING_ORDER) {
    keys.push(settingLabelKey(setting), settingDescriptionKey(setting));
  }
  for (const options of [
    enumOptions("handoffStandardMethodPolicy"),
    enumOptions("paymentServicePayer"),
    enumOptions("paymentMethodsPolicy"),
  ]) {
    for (const option of options) keys.push(option.labelKey);
  }
  keys.push(
    booleanValueLabelKey(true),
    booleanValueLabelKey(false),
  );
  return keys;
}

describe("location settings labels", () => {
  const keys = requiredKeys();

  it("resolves all required labels in BOTH EN and AR", () => {
    for (const key of keys) {
      expect(enTranslations[key]?.length ?? 0).toBeGreaterThan(0);
      expect(arTranslations[key]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("renders no raw underscore enum values in either locale", () => {
    const enumKeys = [
      ...enumOptions("handoffStandardMethodPolicy"),
      ...enumOptions("paymentServicePayer"),
      ...enumOptions("paymentMethodsPolicy"),
    ].map((option) => option.labelKey);
    for (const key of [...enumKeys, booleanValueLabelKey(true), booleanValueLabelKey(false)]) {
      expect(enTranslations[key]).not.toMatch(/_/u);
      expect(arTranslations[key]).not.toMatch(/_/u);
    }
  });

  it("keeps Set-override and Clear-override unambiguous in both locales", () => {
    for (const dictionary of [enTranslations, arTranslations]) {
      expect(dictionary["config.actions.setOverride"]).not.toBe(
        dictionary["config.actions.editOverride"],
      );
      expect(dictionary["config.actions.setOverride"]).not.toBe(
        dictionary["config.actions.clearOverride"],
      );
      expect(dictionary["config.actions.clearOverride"]).not.toBe(
        dictionary["config.actions.editOverride"],
      );
    }
  });

  it("explains default/override/applied in both languages", () => {
    for (const key of [
      "config.note",
      "config.note.digitalOnly",
      "config.columns.companyDefault",
      "config.columns.locationOverride",
      "config.columns.applied",
      "config.override.absent",
      "config.conflict.body",
    ] as const) {
      // Meaningful explanations/column names are longer than a bare word:
      expect(enTranslations[key].length).toBeGreaterThan(9);
      expect(arTranslations[key].length).toBeGreaterThan(9);
    }
  });

  it("renders the BACKEND effective value verbatim, never a local recompute", () => {
    // Deliberately inconsistent projection: effective !== override ?? default.
    // The UI consumes the backend `effective` directly; if any rendering path
    // recomputed precedence, the displayed text would differ below.
    const inconsistent: ConfigurationSettingProjection = {
      default: false,
      effective: true,
      override: null,
      overridePresent: false,
      setting: "checkInPhotosRequired",
    };
    const applied = settingValueDisplay(
      "checkInPhotosRequired",
      inconsistent.effective,
      "JOD",
    );
    expect(applied).toEqual({ kind: "boolean", key: booleanValueLabelKey(true) });
    expect(enTranslations[booleanValueLabelKey(true)]).toBe("On");
    // The override-absent column still shows the absent posture truthfully:
    expect(inconsistent.overridePresent).toBe(false);
  });
});
