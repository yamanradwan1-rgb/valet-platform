import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sharedLoader = "lib/maps/google-maps-sdk.ts";
const attendanceMap =
  "features/administration/settings/attendance-zone-map.tsx";
const operationsMap = "features/operations/maps/operational-google-map.tsx";

function source(path: string) {
  return readFileSync(join(sourceRoot, path), "utf8");
}

function productionSources(directory = sourceRoot): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return productionSources(path);
    if (!/\.(ts|tsx)$/.test(entry.name) || entry.name.includes(".test.")) return [];
    return [path];
  });
}

function owners(fragment: string) {
  return productionSources()
    .filter((path) => readFileSync(path, "utf8").includes(fragment))
    .map((path) => relative(sourceRoot, path).replaceAll("\\", "/"));
}

it("keeps Attendance and Operations on the one shared Maps SDK loader", () => {
  for (const consumer of [attendanceMap, operationsMap]) {
    expect(source(consumer)).toContain(
      'from "../../../lib/maps/google-maps-sdk"',
    );
  }

  expect(owners("https://maps.googleapis.com/maps/api/js?")).toEqual([
    sharedLoader,
  ]);
  expect(owners("gm_authFailure")).toEqual([sharedLoader]);
  expect(
    existsSync(
      join(
        sourceRoot,
        "features/administration/settings/attendance-zone-google-sdk.ts",
      ),
    ),
  ).toBe(false);
});
