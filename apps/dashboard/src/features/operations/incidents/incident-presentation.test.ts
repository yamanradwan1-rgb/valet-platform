import { incidentTypeSchema } from "@valet/contracts";
import { describe, expect, it } from "vitest";
import {
  incidentTypeLabel,
  incidentStatusLabel,
  incidentSeverityLabel,
} from "./incident-presentation";

describe("incident presentation", () => {
  it.each(incidentTypeSchema.options)("localizes %s", (type) => {
    expect(incidentTypeLabel(type, "en")).not.toBe(type);
    expect(incidentTypeLabel(type, "ar")).toMatch(/[\u0600-\u06ff]/u);
  });
  it.each(["future", "__proto__", "constructor", ""])(
    "does not guess unknown type %s",
    (type) => {
      expect(incidentTypeLabel(type, "en")).toBe("Other incident type");
      expect(incidentTypeLabel(type, "ar")).toBe("نوع حادث آخر");
    },
  );
  it.each(["OPEN", "INVESTIGATING", "RESOLVED", "CLOSED"] as const)(
    "localizes status %s",
    (status) => {
      expect(incidentStatusLabel(status, "en")).not.toBe(status);
      expect(incidentStatusLabel(status, "ar")).toMatch(/[\u0600-\u06ff]/u);
    },
  );
  it.each(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const)(
    "localizes severity %s",
    (severity) => {
      expect(incidentSeverityLabel(severity, "en")).not.toBe(severity);
      expect(incidentSeverityLabel(severity, "ar")).toMatch(/[\u0600-\u06ff]/u);
    },
  );
});
