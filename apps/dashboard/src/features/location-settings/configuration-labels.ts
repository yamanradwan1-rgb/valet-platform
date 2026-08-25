import type { ConfigurationSettingKey } from "@valet/contracts";

import type { TranslationKey } from "../../i18n/translations/types";

/**
 * Label + display mapping for the Location Settings surface (D4-003).
 *
 * Raw developer enum values are never rendered. Every setting name,
 * description and enum member maps into typed translation keys resolved at
 * render time in the active locale; the functions are typed against the
 * shared contract types so a new backend enum member breaks compilation
 * until it is given a label.
 */

export function settingLabelKey(
  setting: ConfigurationSettingKey,
): TranslationKey {
  const keys: Record<ConfigurationSettingKey, TranslationKey> = {
    checkInPhotosRequired: "config.setting.checkInPhotosRequired",
    handoffStandardMethodPolicy: "config.setting.handoffStandardMethodPolicy",
    trackingEnabled: "config.setting.trackingEnabled",
    rawGpsRetentionDays: "config.setting.rawGpsRetentionDays",
    valetServiceFee: "config.setting.valetServiceFee",
    paymentServicePayer: "config.setting.paymentServicePayer",
    paymentMethodsPolicy: "config.setting.paymentMethodsPolicy",
    tipsEnabled: "config.setting.tipsEnabled",
    validationEnabled: "config.setting.validationEnabled",
    releaseRequiresPayment: "config.setting.releaseRequiresPayment",
  };
  return keys[setting];
}

export function settingDescriptionKey(
  setting: ConfigurationSettingKey,
): TranslationKey {
  const keys: Record<ConfigurationSettingKey, TranslationKey> = {
    checkInPhotosRequired: "config.description.checkInPhotosRequired",
    handoffStandardMethodPolicy:
      "config.description.handoffStandardMethodPolicy",
    trackingEnabled: "config.description.trackingEnabled",
    rawGpsRetentionDays: "config.description.rawGpsRetentionDays",
    valetServiceFee: "config.description.valetServiceFee",
    paymentServicePayer: "config.description.paymentServicePayer",
    paymentMethodsPolicy: "config.description.paymentMethodsPolicy",
    tipsEnabled: "config.description.tipsEnabled",
    validationEnabled: "config.description.validationEnabled",
    releaseRequiresPayment: "config.description.releaseRequiresPayment",
  };
  return keys[setting];
}

export function booleanValueLabelKey(value: boolean): TranslationKey {
  return value ? "enum.config.boolean.ON" : "enum.config.boolean.OFF";
}

export type EnumPolicySetting =
  | "handoffStandardMethodPolicy"
  | "paymentServicePayer"
  | "paymentMethodsPolicy";

export interface EnumOption {
  readonly value: string;
  readonly labelKey: TranslationKey;
}

/** Selectable options for the three enum policy settings, in stable order. */
export function enumOptions(setting: EnumPolicySetting): readonly EnumOption[] {
  switch (setting) {
    case "handoffStandardMethodPolicy":
      return [
        { labelKey: "enum.config.method.PICKUP_CODE", value: "PICKUP_CODE" },
        { labelKey: "enum.config.method.DYNAMIC_QR", value: "DYNAMIC_QR" },
        { labelKey: "enum.config.method.EITHER", value: "EITHER" },
      ];
    case "paymentServicePayer":
      return [
        { labelKey: "enum.config.payer.CUSTOMER", value: "CUSTOMER" },
        { labelKey: "enum.config.payer.VENUE", value: "VENUE" },
      ];
    case "paymentMethodsPolicy":
      return [
        { labelKey: "enum.config.methods.CASH_ONLY", value: "CASH_ONLY" },
        { labelKey: "enum.config.methods.DIGITAL_ONLY", value: "DIGITAL_ONLY" },
        {
          labelKey: "enum.config.methods.CASH_OR_DIGITAL",
          value: "CASH_OR_DIGITAL",
        },
      ];
  }
}

const ENUM_LABEL_BY_VALUE: Readonly<Record<string, TranslationKey>> = {
  CASH_ONLY: "enum.config.methods.CASH_ONLY",
  CASH_OR_DIGITAL: "enum.config.methods.CASH_OR_DIGITAL",
  CUSTOMER: "enum.config.payer.CUSTOMER",
  DIGITAL_ONLY: "enum.config.methods.DIGITAL_ONLY",
  DYNAMIC_QR: "enum.config.method.DYNAMIC_QR",
  EITHER: "enum.config.method.EITHER",
  PICKUP_CODE: "enum.config.method.PICKUP_CODE",
  VENUE: "enum.config.payer.VENUE",
};

function enumLabel(setting: EnumPolicySetting, value: string): TranslationKey {
  const key = ENUM_LABEL_BY_VALUE[value];
  if (key === undefined) throw new Error(`Unlabeled ${setting} value.`);
  return key;
}

/** A concrete configured value of any supported setting. */
export type ConfiguredValue = boolean | number | string;

/**
 * Display model for ONE configured value (company default, override or
 * effective — chosen by the caller). Money renders as an exact
 * `CURRENCY amount` string: the decimal text passes through verbatim and is
 * never converted through Number()/parseFloat(). Booleans and enums resolve
 * into natural-language translation keys.
 */
export type SettingDisplay =
  | { readonly kind: "boolean"; readonly key: TranslationKey }
  | { readonly kind: "enum"; readonly key: TranslationKey }
  | { readonly kind: "money"; readonly text: string }
  | { readonly kind: "number"; readonly text: string };

export function settingValueDisplay(
  setting: ConfigurationSettingKey,
  value: ConfiguredValue,
  currency: string,
): SettingDisplay {
  switch (setting) {
    case "handoffStandardMethodPolicy":
      return { kind: "enum", key: enumLabel("handoffStandardMethodPolicy", value as string) };
    case "paymentServicePayer":
      return { kind: "enum", key: enumLabel("paymentServicePayer", value as string) };
    case "paymentMethodsPolicy":
      return { kind: "enum", key: enumLabel("paymentMethodsPolicy", value as string) };
    case "rawGpsRetentionDays":
      return { kind: "number", text: String(value) };
    case "valetServiceFee":
      return { kind: "money", text: `${currency} ${value}` };
    default:
      return {
        kind: "boolean",
        key: booleanValueLabelKey(value === true),
      };
  }
}

/** Resolves a display model into user-facing text for the active locale. */
export function settingDisplayText(
  display: SettingDisplay,
  translate: (key: TranslationKey) => string,
): string {
  if (display.kind === "boolean" || display.kind === "enum") {
    return translate(display.key);
  }
  return display.text;
}
