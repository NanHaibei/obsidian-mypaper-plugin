#!/usr/bin/env python3
"""Crop an original page image without reconstructing its contents."""
import argparse
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('--page', required=True, help='source-pages/page-NNN.png')
parser.add_argument('--rect', required=True, nargs=4, type=int, metavar=('X', 'Y', 'W', 'H'))
parser.add_argument('--output', required=True, help='figures/figure-N.png')
args = parser.parse_args()
root = Path.cwd().resolve()
source = (root / args.page).resolve()
target = (root / args.output).resolve()
if not source.is_relative_to(root / 'source-pages') or not target.is_relative_to(root / 'figures'):
    parser.error('Source must be in source-pages/ and output in figures/')
if target.suffix.lower() != '.png':
    parser.error('Output must be PNG')
with Image.open(source) as page:
    x, y, width, height = args.rect
    if min(x, y) < 0 or min(width, height) < 20 or x + width > page.width or y + height > page.height:
        parser.error('Crop bounds are outside the page or too small')
    target.parent.mkdir(parents=True, exist_ok=True)
    page.crop((x, y, x + width, y + height)).save(target)
print(target.relative_to(root))
