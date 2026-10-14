export function intersection(a, b) {
  if (!a || !b) return 0;
  const width = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return +(width * height).toFixed(2);
}

export const measuredKinds = ["controls", "scopeBadges", "pageTitles", "pageSubtitles", "tableHeaders"];

export function measuredIntersections(record) {
  if (!record?.help) return null;
  if (record.semanticSchemaVersion !== 2) return null;
  if (measuredKinds.some((kind) => !Array.isArray(record[kind]))) return null;
  const hits = [];
  for (const [helpIndex, help] of record.help.entries()) {
    for (const kind of measuredKinds) {
      for (const [targetIndex, target] of record[kind].entries()) {
        const observedTarget = kind === "pageTitles" || kind === "pageSubtitles" || kind === "tableHeaders"
          ? target.paintedTextRect : target.rect;
        const rawArea = intersection(help.rect, observedTarget);
        if (!rawArea) continue;
        const visibleArea = intersection(help.visibleRect, kind === "scopeBadges" || kind === "controls"
          ? target.visibleRect : observedTarget && target.visibleRect
            ? { x: Math.max(observedTarget.x, target.visibleRect.x),
                y: Math.max(observedTarget.y, target.visibleRect.y),
                w: Math.max(0, Math.min(observedTarget.x + observedTarget.w, target.visibleRect.x + target.visibleRect.w) - Math.max(observedTarget.x, target.visibleRect.x)),
                h: Math.max(0, Math.min(observedTarget.y + observedTarget.h, target.visibleRect.y + target.visibleRect.h) - Math.max(observedTarget.y, target.visibleRect.y)) }
            : null);
        hits.push({ help: help.label, helpIndex, kind, target: target.text, targetIndex, rawArea, visibleArea,
          // A visible painted overlap is actionable regardless of whether the
          // raw-rect CENTER is clickable (it may be scrolled offscreen).
          obstruction: visibleArea > 1,
          helpRect: help.rect, targetRect: target.rect,
        });
      }
    }
  }
  return hits;
}

export function newlyIntroducedOverlaps(before, after) {
  if (before === null || after === null) return null;
  return after.filter((hit) => !before.some((prior) =>
    prior.help === hit.help && prior.helpIndex === hit.helpIndex &&
    prior.kind === hit.kind && prior.targetIndex === hit.targetIndex &&
    prior.target === hit.target &&
    prior.obstruction === true,
  ) && hit.obstruction === true);
}

// A clipped preset can have a raw rectangle beneath Help without being
// painted there. Classify visible painted intersections conservatively.
export function visibleControlObstructions(hits) {
  if (hits === null) return null; // Preserve UNKNOWN instead of silently treating it as zero.
  return hits.filter((hit) => hit.kind === "controls" && hit.obstruction === true);
}
