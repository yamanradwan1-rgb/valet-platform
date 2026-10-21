import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const cases = [
  "ar320-css200-dark",
  "en320-100-light",
  "ar390-100-dark",
  "ar768-css200-dark",
  "en1440-css200-light",
  "ar320-native200-dark",
  "en320-native200-light",
];
const round = (value) => Math.round(value * 100) / 100;
const load = (variant, id) => JSON.parse(readFileSync(join(root, variant, `${id}.json`), "utf8"));

const report = {
  baselineSHA: "c883883df721449b5ca8025ab5cad94cfe5f0ff4",
  afterSHA: "57975551d6a6896f8e3071742f6c4ccaf5f45310",
  test: "apps/dashboard/e2e/issue306-matched-baseline.spec.ts",
  nativeZoomMethod: "Chromium MV3 extension chrome.tabs.setZoom/getZoom; CSS zoom cases separately labeled",
  pairedCases: [],
};

for (const id of cases) {
  const b = load("before", id);
  const a = load("after", id);
  const oldFacts = b.top.facts;
  const newFacts = a.top.facts;
  if (oldFacts.length !== 9 || newFacts.length !== 10) {
    throw new Error(`${id}: expected exactly 9 original and 10 updated Facts`);
  }
  const shared = oldFacts.map((old, i) => {
    const current = newFacts[i < 5 ? i : i + 1];
    if (old.label !== current.label || old.value !== current.value) {
      throw new Error(`${id}: changed original Fact at ${i}: ${old.label}`);
    }
    return {
      label: old.label,
      oldValueLeft: old.valueRect.left,
      newValueLeft: current.valueRect.left,
      deltaLeft: round(current.valueRect.left - old.valueRect.left),
      oldRowY: old.rect.y,
      newRowY: current.rect.y,
      deltaY: round(current.rect.y - old.rect.y),
      deltaWidth: round(current.rect.width - old.rect.width),
      deltaHeight: round(current.rect.height - old.rect.height),
      oldTextLeft: old.valueTextBounds?.left ?? null,
      newTextLeft: current.valueTextBounds?.left ?? null,
    };
  });
  const belowShifts = shared.slice(5).map((row) => row.deltaY);
  const topUnchanged = shared.slice(0, 5).every((row) => row.deltaLeft === 0 && row.deltaY === 0);
  const oldHorizontalUnchanged = shared.every((row) => row.deltaLeft === 0);
  const allBelowShiftEqually = belowShifts.every((shift) => shift === belowShifts[0]);
  const reporter = newFacts[5];
  const native = id.includes("native");
  if (native && (b.reportedNativeZoom !== 2 || a.reportedNativeZoom !== 2)) {
    throw new Error(`${id}: native Chrome tab 2x zoom not confirmed`);
  }
  const caseReport = {
    id,
    viewportPhysicalWidth: b.settings.width,
    expectedZoom: b.settings.zoom,
    baseline: {
      innerWidth: b.top.innerWidth,
      devicePixelRatio: b.top.devicePixelRatio,
      visualScale: b.top.visualScale,
      htmlZoom: b.top.htmlZoom,
      direction: b.top.htmlDir,
      language: b.top.htmlLang,
      bodyFont: b.top.bodyFont,
      loadedFonts: b.top.fonts,
      closeLeft: b.top.close.left,
      closeRight: b.top.close.right,
      docClientWidth: b.top.documentClientWidth,
      docScrollWidth: b.top.documentScrollWidth,
      drawer: b.top.drawer,
      factList: b.top.factList,
      drawerScrollHeight: b.top.drawerBodyScrollHeight,
      originalFactsClippedLeft: shared.filter((row) => row.oldValueLeft < -0.5).map((row) => row.label),
    },
    updated: {
      innerWidth: a.top.innerWidth,
      devicePixelRatio: a.top.devicePixelRatio,
      visualScale: a.top.visualScale,
      htmlZoom: a.top.htmlZoom,
      direction: a.top.htmlDir,
      language: a.top.htmlLang,
      bodyFont: a.top.bodyFont,
      loadedFonts: a.top.fonts,
      closeLeft: a.top.close.left,
      closeRight: a.top.close.right,
      docClientWidth: a.top.documentClientWidth,
      docScrollWidth: a.top.documentScrollWidth,
      drawer: a.top.drawer,
      factList: a.top.factList,
      drawerScrollHeight: a.top.drawerBodyScrollHeight,
      reporter: {
        label: reporter.label, row: reporter.rect, value: reporter.valueRect,
        text: reporter.valueTextBounds, overflowWrap: reporter.valueOverflowWrap,
      },
    },
    comparison: {
      originalFacts: 9, updatedFacts: 10,
      allOriginalFactValuesAndLabelsEqual: true,
      beforeSharedFactRectsUnchanged: topUnchanged,
      allSharedFactValueLeftEdgesUnchanged: oldHorizontalUnchanged,
      allRowsAfterReporterHaveSameVerticalDelta: allBelowShiftEqually,
      lowerRowDeltaY: belowShifts[0],
      reporterHeight: reporter.rect.height,
      closeLeftDelta: round(a.top.close.left - b.top.close.left),
      drawerLeftDelta: round(a.top.drawer.left - b.top.drawer.left),
      drawerWidthDelta: round(a.top.drawer.width - b.top.drawer.width),
      factListLeftDelta: round(a.top.factList.left - b.top.factList.left),
      shared,
    },
    screenshots: {
      beforeTop: `before/${id}-top.png`, beforeBottom: `before/${id}-bottom.png`,
      afterTop: `after/${id}-top.png`, afterBottom: `after/${id}-bottom.png`,
    },
  };
  report.pairedCases.push(caseReport);
}
writeFileSync(join(root, "comparison.json"), JSON.stringify(report, null, 2));
for (const variant of ["before", "after"]) {
  writeFileSync(join(root, variant, "manifest.json"), JSON.stringify({
    variant,
    sourceSHA: variant === "before" ? report.baselineSHA : report.afterSHA,
    cases,
    topAndBottomScreenshotsPerCase: 2,
    measurementsPerCase: 1,
    nativeZoomMethod: report.nativeZoomMethod,
    note: "Seven separate fresh Chromium contexts, identical test source and synthetic original fields; reporter field appears only in after variant",
  }, null, 2));
}
console.log(`Matched cases ${report.pairedCases.length}/7, all shared old values/labels equal`);
for (const item of report.pairedCases) {
  const v = item.comparison;
  console.log(`${item.id}: oldHorizontalUnchanged=${v.allSharedFactValueLeftEdgesUnchanged}, first5Unchanged=${v.beforeSharedFactRectsUnchanged}, closeDelta=${v.closeLeftDelta}, belowDeltaY=${v.lowerRowDeltaY}`);
}
