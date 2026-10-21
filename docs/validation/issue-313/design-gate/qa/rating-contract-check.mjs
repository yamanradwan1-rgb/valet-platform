import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const source = new URL("./edge-case-rating-fixture.json", import.meta.url);
const fixture = JSON.parse(readFileSync(source, "utf8"));
const fmt = new Map();

function localDate(instant, timezone) {
  if (!fmt.has(timezone)) fmt.set(timezone, new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: timezone,
  }));
  const fields = Object.fromEntries(
    fmt.get(timezone).formatToParts(new Date(instant)).map((part) => [part.type, part.value]),
  );
  return fields.year + "-" + fields.month + "-" + fields.day;
}

function aggregate(items, from = fixture.period.from, to = fixture.period.to) {
  const qualifying = items.filter((v) => {
    if (v.state !== "COMPLETED") return false;
    const tz = fixture.locations[v.location].timezone;
    const local = localDate(v.completedAt, tz);
    return from <= local && local <= to;
  });
  const stars = qualifying.filter((v) => Number.isInteger(v.rating) && v.rating >= 1 && v.rating <= 5);
  const distribution = [1, 2, 3, 4, 5].map((star) =>
    stars.filter((visit) => visit.rating === star).length,
  );
  const sum = stars.reduce((total, item) => total + item.rating, 0);
  return {
    eligible: qualifying.length,
    rated: stars.length,
    sum,
    average: stars.length === 0 ? null : sum / stars.length,
    responseRate: qualifying.length === 0 ? null : stars.length / qualifying.length * 100,
    distribution,
  };
}

function equivalent(actual, expected) {
  for (const field of ["eligible", "rated", "sum"]) {
    assert.equal(actual[field], expected[field], field);
  }
  assert.deepEqual(actual.distribution, expected.distribution, "star bin counts 1..5");
  for (const field of ["average", "responseRate"]) {
    if (expected[field] === null) assert.equal(actual[field], null, field);
    else assert.ok(Math.abs(actual[field] - expected[field]) < 1e-9, field);
  }
  assert.equal(actual.distribution.reduce((a, b) => a + b, 0), actual.rated);
  assert.ok(actual.rated <= actual.eligible);
}

const results = {
  amman: aggregate(fixture.visits.filter((v) => v.location === "amman")),
  "new-york": aggregate(fixture.visits.filter((v) => v.location === "new-york")),
  company: aggregate(fixture.visits),
  emptyDay: aggregate(fixture.visits, "2026-11-05", "2026-11-05"),
  unratedSubset: aggregate(fixture.visits.filter((v) => ["TST-AM-3", "TST-NY-2"].includes(v.ref))),
};
for (const [scope, values] of Object.entries(results)) {
  equivalent(values, fixture.expect[scope]);
}
assert.notEqual(results.company.average,
  (results.amman.average + results["new-york"].average) / 2,
  "weighted company mean must differ from naive average of location means");
assert.equal(localDate("2026-10-01T21:30:00.000Z", "Asia/Amman"), "2026-10-02");
assert.equal(localDate("2026-10-02T01:00:00.000Z", "America/New_York"), "2026-10-01");
console.log(JSON.stringify({ status: "PASS", checks: Object.keys(results).length + 3, results }, null, 2));
