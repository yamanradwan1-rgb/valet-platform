"""Verify the scoped 6px paint clip margin exposes thumbnail focus rings.

Capture files come from photo-focus-outline.spec.ts, with browser focus-visible
assertions and immutable before/focused screenshots per case. For EN the first
and last tile are flush LEFT, while RTL places them flush RIGHT. Exact RGB(A)
pixel differences in the 6px band outside the section must be positive.
"""

import json
from pathlib import Path

from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parent / "results" / "focus-outline"
observations = []
for surface in ("vehicles", "live-operations"):
    data = json.loads((ROOT / f"{surface}-focus-results.json").read_text(encoding="utf-8"))
    for case in data["screenshots"]:
        tile, section = case["tile"], case["section"]
        left = abs(tile["x"] - section["x"]) < 1
        right = abs(tile["right"] - section["right"]) < 1
        if not (left or right):
            raise AssertionError(f"Neither flush left nor right: {case['key']}")
        x = int(section["x"] if left else section["right"])
        region = (
            max(0, x - 6) if left else x,
            max(0, int(tile["y"])),
            x if left else x + 6,
            min(900, int(tile["bottom"])),
        )
        with Image.open(ROOT / case["files"]["before"]) as before, Image.open(
            ROOT / case["files"]["focused"]
        ) as after:
            diff = ImageChops.difference(
                before.convert("RGBA").crop(region), after.convert("RGBA").crop(region)
            )
            pixels = sum(any(channel for channel in rgba) for rgba in diff.get_flattened_data())
        observations.append(
            {
                "case": case["key"],
                "tile": case["side"],
                "exteriorSide": "left" if left else "right",
                "pixelsChangedOutsideSection": pixels,
                "focusVisible": case["focusVisible"],
                "clipMargin": case["clipMargin"],
                "crop": region,
            }
        )

result = {
    "method": "actual Chromium before/after RGBA outside photo section; 6px paint margin",
    "focusCases": len(observations),
    "positiveExteriorRings": sum(v["pixelsChangedOutsideSection"] > 0 for v in observations),
    "observations": observations,
}
(ROOT / "focus-exterior-pixel-verification.json").write_text(
    json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8"
)
print(f"Visible outside focus rings {result['positiveExteriorRings']}/{result['focusCases']}")
if result["focusCases"] != 32 or result["positiveExteriorRings"] != 32:
    raise SystemExit(1)
