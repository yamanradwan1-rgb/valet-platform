import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const moduleRoot = resolve(process.cwd(), "src/modules");
const fieldDirectories = [
  "check-in-api",
  "dispatch",
  "guest-access",
  "handoff",
  "incidents",
  "keys",
  "parking",
  "payments",
  "retrieval",
  "shifts",
  "staff-push",
  "tracking",
  "valet-sessions",
];
const managementReadException = "tracking/live-map-read-authorization.ts";

function sourceFiles(directory: string): string[] {
  const result: string[] = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) result.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(name)) result.push(path);
  }
  return result;
}

describe("MGT-BE-12 field-operation commercial boundary", () => {
  it("keeps the Management entitlement guard out of field-operation sources", () => {
    const violations: string[] = [];
    for (const directory of fieldDirectories) {
      for (const file of sourceFiles(join(moduleRoot, directory))) {
        const path = relative(moduleRoot, file).replaceAll("\\", "/");
        if (path === managementReadException) continue;
        const source = readFileSync(file, "utf8");
        if (
          source.includes("management-commercial-access-policy") ||
          source.includes("dashboard_access_enabled") ||
          source.includes("report_exports_enabled") ||
          source.includes("basic_branding_enabled") ||
          source.includes("organization_subscriptions")
        ) {
          violations.push(path);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("allows the single tracking exception only for the Management live-map read", () => {
    const source = readFileSync(
      join(moduleRoot, managementReadException),
      "utf8",
    );
    expect(source).toContain("hasManagementCommercialAccess");
    expect(source).not.toMatch(/gps|ingest|startTracking|stopTracking/i);
  });
});
