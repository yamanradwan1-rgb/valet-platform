import { describe, expect, it } from "vitest";

import {
  managementAlertTimingPreferenceDefaults,
  managementAlertTimingPreferenceValuesSchema,
  managementAlertTimingPreferencesResponseSchema,
  managementAlertTimingPreferencesSetRequestSchema,
} from "./management-alert-timing-preferences";

describe("DEC-109 Management Alert timing preferences", () => {
  it("accepts exact approved defaults and inclusive endpoints", () => {
    expect(
      managementAlertTimingPreferenceValuesSchema.parse(
        managementAlertTimingPreferenceDefaults,
      ),
    ).toEqual(managementAlertTimingPreferenceDefaults);
    expect(
      managementAlertTimingPreferenceValuesSchema.safeParse({
        alt01GraceSeconds: 60,
        alt02QueueSeconds: 300,
        alt03DeclineSeconds: 120,
        alt04StageSeconds: 900,
        alt06HandoffSeconds: 900,
        alt11UnknownPaymentSeconds: 600,
      }).success,
    ).toBe(true);
    expect(
      managementAlertTimingPreferenceValuesSchema.safeParse({
        alt01GraceSeconds: 0,
        alt02QueueSeconds: 0,
        alt03DeclineSeconds: 0,
        alt04StageSeconds: 60,
        alt06HandoffSeconds: 60,
        alt11UnknownPaymentSeconds: 60,
      }).success,
    ).toBe(true);
  });

  it("rejects fractional, nonfinite, negative, over-limit and unrelated options", () => {
    const invalid: readonly [
      keyof typeof managementAlertTimingPreferenceDefaults,
      number,
    ][] = [
      ["alt01GraceSeconds", -1],
      ["alt01GraceSeconds", 61],
      ["alt02QueueSeconds", 301],
      ["alt03DeclineSeconds", 121],
      ["alt04StageSeconds", 59],
      ["alt04StageSeconds", 901],
      ["alt06HandoffSeconds", 59],
      ["alt06HandoffSeconds", 901],
      ["alt11UnknownPaymentSeconds", 59],
      ["alt11UnknownPaymentSeconds", 601],
      ["alt02QueueSeconds", 0.5],
      ["alt01GraceSeconds", Number.NaN],
      ["alt06HandoffSeconds", Infinity],
    ];
    for (const [key, value] of invalid) {
      expect(
        managementAlertTimingPreferenceValuesSchema.safeParse({
          ...managementAlertTimingPreferenceDefaults,
          [key]: value,
        }).success,
        key,
      ).toBe(false);
    }
    expect(
      managementAlertTimingPreferenceValuesSchema.safeParse({
        ...managementAlertTimingPreferenceDefaults,
        disabled: true,
      }).success,
    ).toBe(false);
  });

  it("requires a complete own-user revisioned request and a strict response", () => {
    expect(
      managementAlertTimingPreferencesSetRequestSchema.safeParse({
        expectedRevision: 0,
        values: managementAlertTimingPreferenceDefaults,
      }).success,
    ).toBe(true);
    expect(
      managementAlertTimingPreferencesSetRequestSchema.safeParse({
        expectedRevision: -1,
        values: managementAlertTimingPreferenceDefaults,
      }).success,
    ).toBe(false);
    expect(
      managementAlertTimingPreferencesSetRequestSchema.safeParse({
        expectedRevision: 0,
        values: { alt01GraceSeconds: 0 },
      }).success,
    ).toBe(false);
    expect(
      managementAlertTimingPreferencesResponseSchema.safeParse({
        organizationId: "d14ac25d-95bc-4e4f-8a74-8c3aaf3b7f22",
        userId: "6313286a-cedc-41d0-b6f2-99c548cabd75",
        revision: 0,
        updatedAt: null,
        values: managementAlertTimingPreferenceDefaults,
      }).success,
    ).toBe(true);
  });
});
