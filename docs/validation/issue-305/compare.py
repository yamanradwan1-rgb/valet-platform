"""Compare the paired Chromium snapshots and recorded DOM geometry for Issue #305."""

import json
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parent
BEFORE = ROOT / "before"
AFTER = ROOT / "after"
PAGES = ("live-operations", "vehicles", "tasks", "incidents")


def captures(directory, page):
    return {
        f"{entry['page']}-{entry['locale']}-{entry['theme']}-{entry['width']}-{entry['zoom']}": entry
        for entry in json.loads((directory / f"{page}-geometry.json").read_text(encoding="utf-8"))
    }


def same_boxes(first, second):
    for a, b in zip(first["tables"], second["tables"]):
        for key in ("x", "y", "width", "height"):
            if abs(a["tableBox"][key] - b["tableBox"][key]) > 0.5:
                return False
        if len(a["columns"]) != len(b["columns"]):
            return False
        for ac, bc in zip(a["columns"], b["columns"]):
            for key in ("x", "y", "width", "height"):
                if abs(ac["headerBox"][key] - bc["headerBox"][key]) > 0.5:
                    return False
            if len(ac["rows"]) != len(bc["rows"]):
                return False
            for ar, br in zip(ac["rows"], bc["rows"]):
                for key in ("x", "y", "width", "height"):
                    if abs(ar["cellBox"][key] - br["cellBox"][key]) > 0.5:
                        return False
    return len(first["tables"]) == len(second["tables"])


def changed_pixels(im):
    return sum(value for index, value in enumerate(im.convert("L").histogram()) if index > 0)


def compare_png(stem, capture, old_dir, new_dir, kind):
    old_path = old_dir / (stem + ".png")
    new_path = new_dir / (stem + ".png")
    if not old_path.exists() or not new_path.exists():
        return {"name": stem, "status": "MISSING_PAIR"}
    with Image.open(old_path) as source, Image.open(new_path) as target:
        old = source.convert("RGB")
        new = target.convert("RGB")
        if old.size != new.size:
            return {"name": stem, "status": "IMAGE_DIMENSIONS_CHANGED", "before": old.size, "after": new.size}
        diff = ImageChops.difference(old, new)
        mask = Image.new("L", old.size, 255)
        drawer = ImageDraw.Draw(mask)
        for table in capture["tables"]:
            if capture["zoom"] == 200 and table["columns"]:
                # RTL full-page screenshot includes horizontal overflow, whose
                # screenshot origin can differ from viewport DOM coordinates.
                # The complete header y-band is the allowed changed region.
                first = table["columns"][0]["headerBox"]
                band = [0, math.floor(first["y"]) - 1, old.width, math.ceil(first["y"] + first["height"]) + 1]
                drawer.rectangle(band, fill=0)
            else:
                for column in table["columns"]:
                    if column["action"]:
                        continue
                    box = column["headerBox"]
                    drawer.rectangle(
                        (math.floor(box["x"]) - 1,
                         math.floor(box["y"]) - 1,
                         math.ceil(box["x"] + box["width"]) + 1,
                         math.ceil(box["y"] + box["height"]) + 1),
                        fill=0,
                    )
        outside = Image.composite(diff, Image.new("RGB", old.size), mask)
        diff.save(ROOT / f"{kind}-{stem}-pixel-diff.png")
        return {
            "name": stem,
            "status": "PASS" if outside.getbbox() is None else "OUTSIDE_HEADER_CHANGED",
            "image_size": old.size,
            "total_changed_pixels": changed_pixels(diff),
            "outside_allowed_header_pixels": changed_pixels(outside),
            "outside_change_bounds": outside.getbbox(),
        }


def main():
    report = {
        "phase": "Independent baseline DOM geometry + controlled same-render visual parity",
        "zoom": "CSS zoom (Chromium), 100% and 200% (native browser zoom NOT RUN)",
        "pages": {}, "screenshots": [], "independent_screenshot_diagnostics": [],
    }
    for page in PAGES:
        before, after = captures(BEFORE, page), captures(AFTER, page)
        item = {"captures_before": len(before), "captures_after": len(after), "mismatches": [], "before_max_header_offset": 0, "after_max_header_offset": 0}
        for key, original in before.items():
            candidate = after.get(key)
            if candidate is None:
                item["mismatches"].append(key + ": missing AFTER")
                continue
            if not same_boxes(original, candidate):
                item["mismatches"].append(key + ": table or cell box geometry changed")
            for old_table, new_table in zip(original["tables"], candidate["tables"]):
                for a, b in zip(old_table["columns"], new_table["columns"]):
                    if a["action"]:
                        if a["headingAlign"] != "end" or b["headingAlign"] != "end":
                            item["mismatches"].append(key + ": action heading alignment")
                        continue
                    item["before_max_header_offset"] = max(item["before_max_header_offset"], abs(a["headingTextOffset"]))
                    item["after_max_header_offset"] = max(item["after_max_header_offset"], abs(b["headingTextOffset"]))
                    if b["headingAlign"] != "start" or abs(b["headingTextOffset"]) >= 1.5:
                        item["mismatches"].append(key + ": failed " + b["name"] + " content start")
        report["pages"][page] = item
        for stem, capture in before.items():
            if (BEFORE / (stem + ".png")).exists():
                report["independent_screenshot_diagnostics"].append(compare_png(stem, capture, BEFORE, AFTER, "independent"))
            if (ROOT / "controlled-before" / (stem + ".png")).exists():
                report["screenshots"].append(compare_png(
                    stem, capture, ROOT / "controlled-before", ROOT / "controlled-after", "controlled",
                ))
    report["ui_freeze_pass"] = (
        all(not item["mismatches"] for item in report["pages"].values())
        and all(entry["status"] == "PASS" for entry in report["screenshots"])
    )
    (ROOT / "pixel-geometry-comparison.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"pass": report["ui_freeze_pass"], "pages": report["pages"], "screenshots": report["screenshots"]}, indent=2))
    raise SystemExit(0 if report["ui_freeze_pass"] else 1)


if __name__ == "__main__":
    main()
