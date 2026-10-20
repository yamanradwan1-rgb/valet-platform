// Historic Issue #304 Option 3 browser QA scenarios, separated from runner.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { designDir } from "./browser-setup.mjs";

const fixture = JSON.parse(readFileSync(
  join(designDir, "fixtures", "canonical-data.json"), "utf8",
));

export const exact = {
  "loc-a": [6, 2, 4, 7, 3, 4],
  "loc-b": [2, 1, 1, 2, 1, 1],
};

export const vehicleCases = {
  "loc-a": [
    { type: "keys", code: "K-02", identity: "DEMO 4821", kind: "plate" },
    { type: "spots", code: "P-02", identity: "DEMO 4821", kind: "plate" },
    { type: "keys", code: "K-03", identity: ["Temporary vehicle · Silver sedan", "مركبة مؤقتة · سيدان فضية"], kind: "descriptor" },
    { type: "spots", code: "P-03", identity: ["Temporary vehicle · Silver sedan", "مركبة مؤقتة · سيدان فضية"], kind: "descriptor" },
    { type: "keys", code: "K-08", identity: ["Vehicle identity unavailable", "هوية المركبة غير متاحة"], kind: "unavailable" },
    { type: "spots", code: "P-08", identity: ["Vehicle identity unavailable", "هوية المركبة غير متاحة"], kind: "unavailable" },
    { type: "keys", code: "K-05", identity: ["Vehicle association unknown", "ارتباط المركبة غير معروف"], kind: "inactive" },
    { type: "spots", code: "P-04", identity: ["Vehicle association unknown", "ارتباط المركبة غير معروف"], kind: "inactive" },
  ],
  "loc-b": [
    { type: "keys", code: "K-12", identity: "DEMO 9076", kind: "plate" },
    { type: "spots", code: "P-12", identity: "DEMO 9076", kind: "plate" },
    { type: "keys", code: "K-13", identity: ["Vehicle association unknown", "ارتباط المركبة غير معروف"], kind: "inactive" },
    { type: "spots", code: "P-13", identity: ["Vehicle association unknown", "ارتباط المركبة غير معروف"], kind: "inactive" },
  ],
};

export function fixtureCounts(location) {
  const resources = fixture.resources[location];
  const count = (rows, status, usage) => rows.filter(
    row => row.status === status && (!usage || row.usage === usage)
  ).length;
  const keys = resources.keys;
  const spots = resources.spots;
  return [
    count(keys, "ACTIVE"), count(keys, "ACTIVE", "AVAILABLE"),
    count(keys, "ACTIVE", "IN_USE"), count(spots, "ACTIVE"),
    count(spots, "ACTIVE", "AVAILABLE"), count(spots, "ACTIVE", "OCCUPIED"),
  ];
}
