"""Strict pixel diff of original React source and Issue #309 production React.

Requires Pillow. Never crops away the intended frozen header, FactList or
closed Dashboard; the added photo section is intentionally excluded from
the open drawer comparison. A one-pixel change is reported, not rounded away.
"""

import argparse
import json
from pathlib import Path

from PIL import Image, ImageChops


def rect_crop(image: Image.Image, rect: dict) -> Image.Image:
    """Use identical reference rectangle for both images; preserve full pixels."""
    import math

    return image.crop(
        (
            math.floor(rect["x"]),
            math.floor(rect["y"]),
            math.ceil(rect["right"]),
            math.ceil(rect["bottom"]),
        )
    )


def measure(original: Image.Image, actual: Image.Image) -> dict:
    if original.size != actual.size:
        return {
            "sourceSize": list(original.size),
            "candidateSize": list(actual.size),
            "differentPixels": None,
            "failure": "size mismatch",
        }
    # Alpha is not ignored: clipping/opacity changes are product changes too.
    diff = ImageChops.difference(original.convert("RGBA"), actual.convert("RGBA"))
    bounds = diff.getbbox(alpha_only=False)
    # Pillow computes no difference immediately for exact copies. A populated
    # bounding box is counted pixel by pixel, including alpha, without any
    # tolerance or visual approximation.
    pixels = (
        sum(1 for rgba in diff.get_flattened_data() if any(channel != 0 for channel in rgba))
        if bounds else 0
    )
    return {
        "sourceSize": list(original.size),
        "candidateSize": list(actual.size),
        "differentPixels": pixels,
        "totalPixels": original.width * original.height,
        "diffBounds": list(bounds) if bounds else None,
        "failure": "pixel mismatch" if pixels else None,
    }


def evaluate(baseline: Path, candidate: Path, report: Path) -> dict:
    details: list[dict] = []
    missing: list[str] = []
    for surface in ("vehicles", "live-operations"):
        manifest = baseline / f"{surface}-metrics.json"
        if not manifest.is_file():
            raise FileNotFoundError(f"Missing genuine React baseline manifest {manifest}")
        source_data = json.loads(manifest.read_text(encoding="utf-8"))
        cases = [entry for entry in source_data["cases"] if "320x400" not in entry["key"]]
        for entry in cases:
            key = entry["key"]
            source_rects = entry["top"]
            for state, regions in (("closed", ("whole-shell",)), ("top", ("header", "factList"))):
                source_img = baseline / f"{key}-{state}.png"
                candidate_img = candidate / f"{key}-{state}.png"
                if not source_img.is_file() or not candidate_img.is_file():
                    missing.extend(str(path) for path in (source_img, candidate_img) if not path.is_file())
                    continue
                with Image.open(source_img) as src_image, Image.open(candidate_img) as dst_image:
                    for region in regions:
                        if region == "whole-shell":
                            src = src_image
                            dst = dst_image
                        else:
                            r = source_rects[region]
                            if not r:
                                raise ValueError(f"Baseline missing {key} / {region}")
                            src, dst = rect_crop(src_image, r), rect_crop(dst_image, r)
                        result = measure(src, dst)
                        details.append({"key": key, "region": region, **result})
    summary = {
        "baseline": str(baseline.resolve()),
        "candidate": str(candidate.resolve()),
        "baselineSourceSha": "459e9c42dfff5b2aeb11ee9165a7d1a4338a7783",
        "comparison": "exact per-pixel RGBA, 0 allowed changed pixels",
        "testedRegions": len(details),
        "expectedRegions": 32 * 3,
        "differentRegions": sum(1 for case in details if case["failure"]),
        "totalChangedPixels": sum(case["differentPixels"] or 0 for case in details),
        "missingFiles": missing,
    }
    summary["verdict"] = (
        "PASS" if len(details) == 96 and not summary["differentRegions"] and not missing else "STOP"
    )
    payload = {"summary": summary, "regions": details}
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--candidate", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    outcome = evaluate(args.baseline, args.candidate, args.report)
    print(json.dumps(outcome, ensure_ascii=False, indent=2))
    raise SystemExit(0 if outcome["verdict"] == "PASS" else 1)
