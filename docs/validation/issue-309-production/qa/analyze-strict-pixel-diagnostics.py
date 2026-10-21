"""Forensic summary of exact preserved #309 photo and original-shell pixels.

No tolerance is applied in PASS/STOP judgments. No source/approved HTML edits.
"""
import json
from pathlib import Path

from PIL import Image, ImageChops

BASE = Path(__file__).resolve().parent / "results"
PHOTO = BASE / "strict-pixel-diagnostics"
FROZEN = {
    "original": BASE / "production-build-original",
    "originalRepeat": BASE / "production-build-original-repeat",
    "candidate": BASE / "production-build-candidate",
}


def compare(a: Path, b: Path) -> dict:
    with Image.open(a) as left, Image.open(b) as right:
        src, dst = left.convert("RGBA"), right.convert("RGBA")
        if src.size != dst.size:
            return {"sourceSize": src.size, "targetSize": dst.size, "failure": "size"}
        diff = ImageChops.difference(src, dst)
        changed = [max(rgba) for rgba in diff.get_flattened_data() if any(rgba)]
        return {
            "changedPixels": len(changed),
            "totalPixels": src.width * src.height,
            "maxChannelDifference": max(changed, default=0),
            "onlyChangesAtMost2RGB": all(value <= 2 for value in changed),
            "changedPixelsAtMost2": sum(value <= 2 for value in changed),
            "diffBounds": diff.getbbox(alpha_only=False),
        }


photos = []
for state in ("empty", "three", "network", "viewer"):
    snapshot = json.loads((PHOTO / (state + ".json")).read_text(encoding="utf-8"))
    images = {tag: PHOTO / (state + "-" + tag + ".png")
              for tag in ("html-0", "html-1", "react-0", "react-1")}
    observations = {
        "sourceToReact": compare(images["html-0"], images["react-0"]),
        "htmlSelf": compare(images["html-0"], images["html-1"]),
        "reactSelf": compare(images["react-0"], images["react-1"]),
    }
    if state in ("empty", "three"):
        observations["testOnlyDomHypothesis"] = compare(
            images["html-0"], PHOTO / (state + "-react-normalized.png")
        )
    photos.append({
        "state": state, "sourceSHA256": snapshot["designHash"],
        "actual": snapshot["actual"], "expected": snapshot["expected"],
        "pixelEvidence": observations,
    })

frozen = []
for name in ("vehicles-en-dark-320", "vehicles-en-dark-390",
             "vehicles-ar-dark-320", "vehicles-ar-light-320"):
    file = name + "-closed.png"
    original = FROZEN["original"] / file
    repeat = FROZEN["originalRepeat"] / file
    candidate = FROZEN["candidate"] / file
    frozen.append({
        "name": name,
        "sourceToCandidate": compare(original, candidate),
        "sourceToSourceRepeat": compare(original, repeat),
        "candidateToSourceRepeat": compare(candidate, repeat),
    })

result = {
    "scope": "diagnostic snapshots only; no mutation to HTML or production code",
    "photoStates": photos,
    "originalProtectedRegions": frozen,
    "visualDecision": "STRICT_STOP: exact photo 100% not proven; original shell 93/96",
}
target = PHOTO / "FORENSICS.json"
target.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
for item in photos:
    p = item["pixelEvidence"]
    print(item["state"], "html/react", p["sourceToReact"]["changedPixels"],
          "html repeat", p["htmlSelf"]["changedPixels"],
          "react repeat", p["reactSelf"]["changedPixels"])
for item in frozen:
    print(item["name"], "source/candidate",
          item["sourceToCandidate"]["changedPixels"],
          "source/self", item["sourceToSourceRepeat"]["changedPixels"],
          "candidate/self", item["candidateToSourceRepeat"]["changedPixels"])
