import test from "node:test";
import assert from "node:assert/strict";
import { intersection, measuredIntersections, newlyIntroducedOverlaps, measuredKinds } from "./issue278-overlap-geometry.mjs";

const rect = (x, y, w, h) => ({ x, y, w, h });
const help = { label: "Help: Audit Log", text: "", rect: rect(8, 8, 28, 28), visibleRect: rect(8, 8, 28, 28), hitTarget: true };
function record(kind, target) {
  return { semanticSchemaVersion: 2, help: [help], ...Object.fromEntries(measuredKinds.map((name) => [name, name === kind ? [target] : []])) };
}
function target(text, r, visible = r) { return { text, rect: r, visibleRect: visible, paintedTextRect: r }; }

for (const kind of measuredKinds) {
  test(`detects deliberate Help intersection with ${kind}`, () => {
    const collisions = measuredIntersections(record(kind, target("synthetic", rect(10, 12, 20, 14))));
    assert.equal(collisions.length, 1);
    assert.equal(collisions[0].kind, kind);
    assert.ok(collisions[0].visibleArea > 0);
    assert.equal(collisions[0].obstruction, true);
  });
}
test("no intersection means no collision", () => {
  assert.deepEqual(measuredIntersections(record("scopeBadges", target("badge", rect(100, 100, 20, 20)))), []);
});
test("does not report an unchanged historical overlap as introduced", () => {
  const previous = measuredIntersections(record("scopeBadges", target("badge", rect(12, 14, 18, 18))));
  assert.deepEqual(newlyIntroducedOverlaps(previous, previous), []);
});
test("reports a new overlap against a collision-free baseline", () => {
  const previous = measuredIntersections(record("scopeBadges", target("badge", rect(80, 80, 18, 18))));
  const next = measuredIntersections(record("scopeBadges", target("badge", rect(12, 14, 18, 18))));
  assert.equal(newlyIntroducedOverlaps(previous, next).length, 1);
});
test("clipped target produces raw intersection but zero visible obstruction", () => {
  const c = measuredIntersections(record("tableHeaders", target("hidden header", rect(12, 14, 18, 18), null)));
  assert.ok(c[0].rawArea > 0);
  assert.equal(c[0].visibleArea, 0);
  assert.equal(c[0].obstruction, false);
});
test("missing measurement is unknown, never a false zero", () => {
  const incomplete = { help: [help], controls: [] };
  assert.equal(measuredIntersections(incomplete), null);
  assert.equal(newlyIntroducedOverlaps(null, []), null);
  assert.equal(intersection(rect(0, 0, 2, 2), rect(2, 0, 2, 2)), 0);
});
