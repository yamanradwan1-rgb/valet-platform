"""Summarize immutable approved HTML vs actual Next/React photo-only evidence.

Never mask pixels, round nonzero paint differences to zero, or count the
approved demo's pre-existing FactList/shell position as a production regression.
"""

import json
from collections import Counter
from pathlib import Path

from PIL import Image, ImageChops


DIR = Path(__file__).resolve().parent / "results" / "approved-photo-parity"
files = sorted(filename for filename in DIR.glob("*.json") if filename.name != "SUMMARY.json")
cases = [entry for filename in files for entry in json.loads(filename.read_text(encoding="utf-8"))["observations"]]
expected = 2 * 10 * 2 * 2 * 4

style_failures = [(case["key"], item) for case in cases for item in case["mismatched"]]
geometry = [(case["key"], name, value) for case in cases for name, value in case["deltas"].items() if value]

# A portal is fixed to the viewport, not a descendant of the photo section.
# Its section-relative coordinate can differ when the approved HTML demo's
# original Facts do not have source-exact height; compare absolute portal
# x/y/width/height instead.
excluded_geometry = {"section.y", "viewer.relativeX", "viewer.relativeY", "viewerCanvas.relativeX", "viewerCanvas.relativeY", "viewerImage.relativeX", "viewerImage.relativeY", "viewerClose.relativeX", "viewerClose.relativeY"}
# Original frozen Facts may be taller in the standalone design fixture, so
# the children of the photo section move together. Their section-relative
# coordinates, dimensions and computed styles must match exactly instead.
excluded_geometry.update(f"{node}.y" for node in ("heading", "count", "hint", "grid", "tile", "image", "caption", "message"))
photo_inner_geometry = [g for g in geometry if g[1] not in excluded_geometry]

paint = []
for image in sorted(DIR.glob("*-html.png")):
    peer = image.with_name(image.name.replace("-html.png", "-react.png"))
    if not peer.is_file():
        paint.append({"name": image.stem, "error": "missing real React screenshot"})
        continue
    with Image.open(image) as left, Image.open(peer) as right:
        a, b = left.convert("RGBA"), right.convert("RGBA")
        if a.size != b.size:
            paint.append({"name": image.stem, "sourceSize": a.size, "reactSize": b.size, "error": "size mismatch"})
            continue
        diff = ImageChops.difference(a, b)
        changed = sum(1 for rgba in diff.get_flattened_data() if any(channel != 0 for channel in rgba))
        paint.append({"name": image.stem, "size": a.size, "changedPixels": changed, "totalPixels": a.width * a.height, "diffBounds": diff.getbbox(alpha_only=False)})

summary = {
    "immutableApprovedHtmlSHA256": "0b1900896b46af9d1f11dd88f01643978629001cb1c956de5f1e7f5987cdbd74",
    "verifiedCases": len(cases),
    "expectedCases": expected,
    "styleMismatchCases": len({case for case, _ in style_failures}),
    "styleMismatches": style_failures[:40],
    "nonzeroMeasuredGeometryFields": len(geometry),
    "nonzeroPhotoInternalGeometryFields": len(photo_inner_geometry),
    "geometryDeltasBySelector": Counter(name for _, name, _ in photo_inner_geometry),
    "geometryDeltasExamples": photo_inner_geometry[:40],
    "approvedDemoExternalSectionPositionDifferences": sum(1 for _, name, _ in geometry if name == "section.y"),
    "screenshots": paint,
    "paintPixelExactRepresentatives": sum(1 for case in paint if case.get("changedPixels") == 0),
    "limitation": (
        "The immutable standalone HTML's original FactList is not the frozen production React reference. "
        "The new photo section is compared with matching JPEGs and truthful React captions injected into the "
        "test browser's *in-memory demo DOM only*; no approved HTML source changed. "
        "A nonzero screenshot difference is reported, never waived. "
        "The new photo-specific contain:paint and overflow-clip-margin are purposefully not part of the approved "
        "standalone photo CSS because the real React scroll/compositor and keyboard focus need them to preserve the frozen facts."
    ),
}
DIR.mkdir(parents=True, exist_ok=True)
(DIR / "SUMMARY.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
print(json.dumps({key: summary[key] for key in ("verifiedCases", "expectedCases", "styleMismatchCases", "nonzeroPhotoInternalGeometryFields", "paintPixelExactRepresentatives")}, indent=2))
