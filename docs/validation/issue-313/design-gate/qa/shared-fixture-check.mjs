/* Independently validate the Prime-owned, browser-global, deterministic prototype fixture.
   Usage: node shared-fixture-check.mjs FULL-PATH-TO-feedback-fixture.js
*/
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import assert from "node:assert/strict";
import { resolve } from "node:path";

const file = process.argv[2];
if (!file) throw new Error("Provide the current Prime-owned feedback-fixture.js path");
const code = readFileSync(resolve(file), "utf8");
const sandbox = { window: {} };
runInNewContext(code, sandbox, { timeout: 4000, filename: "feedback-fixture.js" });
const fixture = sandbox.window.VAYLET313;
assert.ok(fixture, "Browser VAYLET313 fixture must be available");
assert.equal(fixture.validate(), true, "Fixture self-validation");

const data = (query) => fixture.selectData(query);
const groups = [];
for (const period of ["sep", "oct", "aug"]) {
  for (const location of ["all", "main", "north"]) {
    const snapshot = data({ period, location, role: "company" });
    assert.ok(snapshot.rated <= snapshot.eligible);
    assert.equal(snapshot.counts.length, 5);
    assert.equal(snapshot.counts.reduce((sum, count) => sum + count, 0), snapshot.rated);
    const total = snapshot.counts.reduce((sum, count, index) => sum + count * (5 - index), 0);
    assert.ok(snapshot.average === null ? snapshot.rated === 0 :
      Math.abs(snapshot.average - total / snapshot.rated) < 1e-10);
    assert.ok(snapshot.participation === null ? snapshot.eligible === 0 :
      Math.abs(snapshot.participation - snapshot.rated / snapshot.eligible) < 1e-10);
    assert.ok(snapshot.records.every((v) => v.reference.startsWith("DEMO-VISIT-")));
    assert.ok(snapshot.records.every((v) => v.completedAt.startsWith("2026-" +
      (period === "sep" ? "09" : period === "oct" ? "10" : "08"))));
    assert.ok(snapshot.records.every((v) => v.rating >= 1 && v.rating <= 5));
    assert.ok(snapshot.records.every((v) => location === "all" || v.locationId === location));
    groups.push({ period, location, eligible: snapshot.eligible, rated: snapshot.rated });
  }
  const whole = data({ period, role: "company", location: "all" });
  const a = data({ period, location: "main", role: "company" });
  const b = data({ period, location: "north", role: "company" });
  assert.equal(whole.eligible, a.eligible + b.eligible);
  assert.equal(whole.rated, a.rated + b.rated);
  assert.equal(whole.counts.join(","), a.counts.map((v, i) => v + b.counts[i]).join(","));
}
assert.equal(data({ period: "sep", role: "company" }).eligible, 120);
assert.equal(data({ period: "sep", role: "company" }).rated, 78);
assert.equal(data({ period: "sep", role: "company" }).average, 305 / 78);
assert.equal(data({ period: "sep", role: "company" }).participation, 0.65);
assert.equal(data({ period: "oct", role: "company" }).eligible, 14);
assert.equal(data({ period: "oct", role: "company" }).rated, 6);
assert.equal(data({ period: "sep", role: "manager", location: "north" }).location, "main");
assert.ok(data({ period: "sep", role: "manager", location: "north" }).records
  .every((v) => v.locationId === "main"));
const empty = data({ period: "sep", role: "company", state: "empty" });
assert.equal(empty.eligible, 120);
assert.equal(empty.rated, 0);
assert.equal(empty.average, null);
assert.equal(empty.participation, 0);
const none = data({ period: "sep", role: "company", state: "none" });
assert.equal(none.eligible, 0);
assert.equal(none.average, null);
assert.equal(none.participation, null);
for (const state of ["error", "loading", "denied"]) {
  const unavailable = data({ period: "sep", role: "company", state });
  assert.equal(unavailable.records.length, 0);
  assert.equal(unavailable.average, null);
}
const language = fixture.localeText;
for (const key of Object.keys(language.en)) {
  assert.ok(typeof language.ar[key] === "string" && language.ar[key].trim(),
    "Missing AR translation: " + key);
}
console.log(JSON.stringify({
  status: "PASS", fixture: resolve(file), checks: "9 aggregated groups, consistency, roles, states and i18n",
  cohortNote: "Shared fixture uses Location-local date-only completedAt; adversarial timezones tested separately",
  groups,
}, null, 2));
