import test from "node:test";
import assert from "node:assert/strict";
import { intersection, measuredIntersections, newlyIntroducedOverlaps, measuredKinds, visibleControlObstructions } from "./issue278-overlap-geometry.mjs";

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
test("clipped period preset is only a raw diagnostic, not a visible action collision", () => {
  const c = measuredIntersections(record("controls", target("30D", rect(12, 14, 30, 18), rect(12, 14, 0, 18))));
  assert.ok(c[0].rawArea > 0);
  assert.equal(c[0].visibleArea, 0);
  assert.deepEqual(visibleControlObstructions(c), []);
});
test("real accessible Help/control overlap remains a blocking collision", () => {
  const c = measuredIntersections(record("controls", target("Retry", rect(12, 14, 30, 18))));
  assert.equal(visibleControlObstructions(c).length, 1);
});
test("partially clipped Help remains blocking even when raw center is offscreen", () => {
  const halfVisible = { ...help, visibleRect: rect(8, 8, 28, 8), hitTarget: false };
  const fixture = { ...record("controls", target("Action", rect(12, 8, 16, 18))), help: [halfVisible] };
  const overlaps = measuredIntersections(fixture);
  assert.ok(overlaps[0].visibleArea > 1);
  assert.equal(overlaps[0].obstruction, true);
  assert.equal(visibleControlObstructions(overlaps).length, 1);
});
test("newly introduced obstruction is not hidden by prior unclickable center", () => {
  const fixture = record("controls", target("Action", rect(12, 14, 18, 18)));
  const before = measuredIntersections({ ...fixture, help: [{ ...help, visibleRect: null, hitTarget: false }] });
  const after = measuredIntersections(fixture);
  assert.equal(before[0].obstruction, false);
  assert.equal(newlyIntroducedOverlaps(before, after).length, 1);
});
test("different same-label controls cannot suppress newly introduced collisions", () => {
  const baseline = record("controls", target("Save", rect(12, 14, 18, 18)));
  baseline.controls.push(target("Save", rect(80, 14, 18, 18)));
  const current = record("controls", target("Save", rect(80, 14, 18, 18)));
  current.controls.push(target("Save", rect(12, 14, 18, 18)));
  const newly = newlyIntroducedOverlaps(measuredIntersections(baseline), measuredIntersections(current));
  assert.equal(newly.length, 1);
  assert.equal(newly[0].targetIndex, 1);
});
test("missing measurement is unknown, never a false zero", () => {
  const incomplete = { help: [help], controls: [] };
  assert.equal(measuredIntersections(incomplete), null);
  assert.equal(newlyIntroducedOverlaps(null, []), null);
  assert.equal(visibleControlObstructions(null), null);
  assert.equal(intersection(rect(0, 0, 2, 2), rect(2, 0, 2, 2)), 0);
});
