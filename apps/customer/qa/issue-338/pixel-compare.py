"""Compare screenshot pixels against the boxes of actual changed color consumers."""
import json
import math
import os
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw

root = Path(os.environ.get('QA338_EVIDENCE', '/workspace/work/issue338-evidence'))
screenshots = root / ('screenshots200' if os.environ.get('QA338_ZOOM') == '200' else 'screenshots')
results = []
for mask_file in sorted(screenshots.glob('*-masks.json')):
    name = mask_file.name.removesuffix('-masks.json')
    before = Image.open(screenshots / f'{name}-before.png').convert('RGB')
    after = Image.open(screenshots / f'{name}-after.png').convert('RGB')
    if before.size != after.size:
        raise AssertionError(f'{name}: screenshot dimensions changed')
    mask = Image.new('L', before.size, 0)
    draw = ImageDraw.Draw(mask)
    mask_data = json.loads(mask_file.read_text())
    scale = mask_data.get('scale', 1) if isinstance(mask_data, dict) else 1
    rectangles = mask_data['rects'] if isinstance(mask_data, dict) else mask_data
    for x, y, width, height in rectangles:
        x, y, width, height = (value * scale for value in (x, y, width, height))
        # One pixel accommodates rasterization at fractional CSS coordinates.
        draw.rectangle((math.floor(x) - 1, math.floor(y) - 1,
                        math.ceil(x + width) + 1, math.ceil(y + height) + 1), fill=255)
    difference = ImageChops.difference(before, after)
    changed = difference.convert('L').point(lambda value: 255 if value else 0)
    outside = ImageChops.subtract(changed, mask)
    outside_count = outside.histogram()[255]
    results.append({'name': name, 'changed_pixels': changed.histogram()[255],
                    'pixels_outside_color_consumers': outside_count})
    if outside_count:
        outside.save(screenshots / f'{name}-unexpected.png')
    if '00FF00-demo-parked' in name:
        comparison = Image.new('RGB', (before.width * 3, before.height), 'white')
        comparison.paste(before, (0, 0))
        comparison.paste(after, (before.width, 0))
        comparison.paste(difference, (before.width * 2, 0))
        comparison.save(screenshots / f'{name}-comparison.png')
(root / ('pixel-results200.json' if os.environ.get('QA338_ZOOM') == '200' else 'pixel-results.json')).write_text(json.dumps(results, indent=2))
print(json.dumps({'pairs': len(results), 'outside_color_consumers': sum(
    item['pixels_outside_color_consumers'] for item in results)}, indent=2))
if not results or any(item['pixels_outside_color_consumers'] for item in results):
    raise SystemExit(1)
