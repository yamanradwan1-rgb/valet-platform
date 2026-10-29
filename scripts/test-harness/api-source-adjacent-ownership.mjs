import { relative } from "node:path";

// Source-adjacent API tests are intentionally few. New tests must receive an
// explicit lane review instead of being silently absent from official CI.
export const approvedApiSourceTests = [
  "modules/tracking/live-map-cursor.test.ts",
  "modules/tracking/point-in-polygon.test.ts",
  "modules/tracking/route-history-cursor.test.ts",
];

export function assertRegisteredApiSourceTests(
  discovered,
  sourceRoot,
  approved = approvedApiSourceTests,
) {
  const found = discovered.map((file) => relative(sourceRoot, file).replaceAll("\\", "/"));
  const approvedSet = new Set(approved);
  for (const file of found) {
    if (!approvedSet.has(file)) {
      throw new Error(`Unowned API source-adjacent test src/${file}. Assign an explicit safe test lane.`);
    }
  }
  for (const file of approved) {
    if (!found.includes(file)) {
      throw new Error(`Registered API source-adjacent test missing from discovery: src/${file}.`);
    }
  }
  return found;
}
