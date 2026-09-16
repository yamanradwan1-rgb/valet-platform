import { describe, expect, it } from "vitest";

import {
  managementNotificationTypeSchema,
  managementSettingClearRequestSchema,
  managementSettingSetRequestSchema,
  operatingHoursValueSchema,
} from "./management-settings.js";

const token = "2026-09-17T00:00:00.000Z";
const weekdays = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

function week() {
  return {
    days: weekdays.map((weekday, index) =>
      index === 6
        ? { status: "CLOSED" as const, weekday }
        : {
            closesAt: "18:00",
            opensAt: "09:00",
            status: "OPEN" as const,
            weekday,
          },
    ),
  };
}

describe("MGT-BE-05 management settings contracts", () => {
  it.each(["EN", "AR"] as const)("accepts finite language %s", (value) => {
    expect(
      managementSettingSetRequestSchema.parse({
        expectedUpdatedAt: token,
        setting: "languageDefault",
        value,
      }),
    ).toMatchObject({ value });
  });

  it.each(["en", "ar-JO", "FR", "", "AR "])(
    "rejects unsupported locale %j",
    (value) => {
      expect(
        managementSettingSetRequestSchema.safeParse({
          expectedUpdatedAt: token,
          setting: "languageDefault",
          value,
        }).success,
      ).toBe(false);
    },
  );

  it("accepts exactly one normalized Monday-through-Sunday week", () => {
    expect(operatingHoursValueSchema.parse(week())).toEqual(week());
  });

  it.each([
    {
      name: "missing day",
      value: { days: week().days.slice(0, 6) },
    },
    {
      name: "extra day",
      value: { days: [...week().days, week().days[6]] },
    },
    {
      name: "duplicate/out-of-order day",
      value: {
        days: week().days.map((day, index) =>
          index === 1 ? { ...day, weekday: "MONDAY" as const } : day,
        ),
      },
    },
    {
      name: "malformed time",
      value: {
        days: week().days.map((day, index) =>
          index === 0 && day.status === "OPEN"
            ? { ...day, opensAt: "9:00" }
            : day,
        ),
      },
    },
    {
      name: "non-increasing interval",
      value: {
        days: week().days.map((day, index) =>
          index === 0 && day.status === "OPEN"
            ? { ...day, closesAt: "09:00" }
            : day,
        ),
      },
    },
  ])("rejects $name", ({ value }) => {
    expect(operatingHoursValueSchema.safeParse(value).success).toBe(false);
  });

  it("rejects arbitrary settings, future notification names, null SET, and unknown fields", () => {
    expect(managementNotificationTypeSchema.safeParse("FUTURE_EVENT").success).toBe(
      false,
    );
    expect(
      managementSettingSetRequestSchema.safeParse({
        expectedUpdatedAt: token,
        setting: "notificationKey",
        value: true,
      }).success,
    ).toBe(false);
    expect(
      managementSettingSetRequestSchema.safeParse({
        expectedUpdatedAt: token,
        setting: "ocrAssistEnabled",
        value: null,
      }).success,
    ).toBe(false);
    expect(
      managementSettingSetRequestSchema.safeParse({
        expectedUpdatedAt: token,
        setting: "ocrAssistEnabled",
        unexpected: "field",
        value: true,
      }).success,
    ).toBe(false);
    expect(
      managementSettingClearRequestSchema.safeParse({
        expectedUpdatedAt: token,
        setting: "FUTURE_EVENT",
      }).success,
    ).toBe(false);
  });
});
