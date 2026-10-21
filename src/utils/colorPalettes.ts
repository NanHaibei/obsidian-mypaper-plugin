/*!
 * Palette color values from Open Color, Nord, and Catppuccin (MIT License).
 * Copyright (c) 2016 heeyeun
 * Copyright (c) 2016-present Sven Greb <development@svengreb.de> (https://www.svengreb.de)
 * Copyright (c) 2021 Catppuccin
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import type { FieldStyle } from '../types';

export interface PaperPalette {
  id: string;
  name: string;
  sourceName: string;
  sourceUrl: string;
  mode: 'light' | 'dark';
  colors: Readonly<Pick<FieldStyle, 'backgroundColor'>>;
}

const OPEN_COLOR = {
  sourceName: 'Open Color',
  sourceUrl: 'https://yeun.github.io/open-color/',
};
const NORD = {
  sourceName: 'Nord',
  sourceUrl: 'https://www.nordtheme.com/docs/colors-and-palettes/',
};
const CATPPUCCIN = {
  sourceName: 'Catppuccin',
  sourceUrl: 'https://github.com/catppuccin/catppuccin#-palette',
};

type BackgroundRow = readonly [id: string, name: string, color: string];
function backgrounds(
  source: Pick<PaperPalette, 'sourceName' | 'sourceUrl'>,
  mode: PaperPalette['mode'],
  rows: readonly BackgroundRow[],
): PaperPalette[] {
  return rows.map(([id, name, backgroundColor]) => ({
    id, name, ...source, mode, colors: { backgroundColor },
  }));
}

// Official Open Color shades 0–4. Names are local labels; values are bundled
// for offline use. Each entry is one distinct background, not a style preset.
const LIGHT_FAMILIES: ReadonlyArray<readonly [string, string, readonly string[]]> = [
  ['gray', '雾灰', ['#f8f9fa', '#f1f3f5', '#e9ecef', '#dee2e6', '#ced4da']],
  ['red', '珊瑚红', ['#fff5f5', '#ffe3e3', '#ffc9c9', '#ffa8a8', '#ff8787']],
  ['pink', '玫瑰粉', ['#fff0f6', '#ffdeeb', '#fcc2d7', '#faa2c1', '#f783ac']],
  ['grape', '兰花紫', ['#f8f0fc', '#f3d9fa', '#eebefa', '#e599f7', '#da77f2']],
  ['violet', '薰衣草紫', ['#f3f0ff', '#e5dbff', '#d0bfff', '#b197fc', '#9775fa']],
  ['indigo', '鸢尾蓝', ['#edf2ff', '#dbe4ff', '#bac8ff', '#91a7ff', '#748ffc']],
  ['blue', '晴空蓝', ['#e7f5ff', '#d0ebff', '#a5d8ff', '#74c0fc', '#4dabf7']],
  ['cyan', '湖水青', ['#e3fafc', '#c5f6fa', '#99e9f2', '#66d9e8', '#3bc9db']],
  ['teal', '薄荷绿', ['#e6fcf5', '#c3fae8', '#96f2d7', '#63e6be', '#38d9a9']],
  ['green', '春芽绿', ['#ebfbee', '#d3f9d8', '#b2f2bb', '#8ce99a', '#69db7c']],
  ['lime', '青柠绿', ['#f4fce3', '#e9fac8', '#d8f5a2', '#c0eb75', '#a9e34b']],
  ['yellow', '奶油黄', ['#fff9db', '#fff3bf', '#ffec99', '#ffe066', '#ffd43b']],
  ['orange', '暖杏橙', ['#fff4e6', '#ffe8cc', '#ffd8a8', '#ffc078', '#ffa94d']],
];
const SHADE_NAMES = ['轻雾', '浅柔', '柔和', '明亮', '浓郁'];

export const PAPER_PALETTES: readonly PaperPalette[] = [
  ...LIGHT_FAMILIES.flatMap(([id, name, shades]) => backgrounds(OPEN_COLOR, 'light',
    shades.map((color, index) => [`open-${id}-${index}`, `${name} · ${SHADE_NAMES[index]}`, color] as const))),
  ...backgrounds(OPEN_COLOR, 'light', [['open-white', '纯白', '#ffffff']]),
  ...backgrounds(CATPPUCCIN, 'light', [['latte-base', '拿铁雾白', '#eff1f5']]),
  ...backgrounds(OPEN_COLOR, 'dark', [
    ['open-gray-7', '岩石灰', '#495057'],
    ['open-gray-8', '炭灰', '#343a40'],
    ['open-gray-9', '墨灰', '#212529'],
  ]),
  ...backgrounds(NORD, 'dark', [
    ['nord-0', '北欧夜蓝', '#2e3440'],
    ['nord-1', '北境暮蓝', '#3b4252'],
    ['nord-2', '北欧石蓝', '#434c5e'],
    ['nord-3', '北欧雾蓝', '#4c566a'],
  ]),
  ...backgrounds(CATPPUCCIN, 'dark', [
    ['frappe-base', '冰咖暮紫', '#303446'],
    ['frappe-mantle', '冰咖夜紫', '#292c3c'],
    ['frappe-crust', '冰咖深紫', '#232634'],
    ['frappe-surface', '冰咖灰紫', '#414559'],
    ['macchiato-base', '玛奇朵暮蓝', '#24273a'],
    ['macchiato-mantle', '玛奇朵夜蓝', '#1e2030'],
    ['macchiato-crust', '玛奇朵深蓝', '#181926'],
    ['macchiato-surface', '玛奇朵灰蓝', '#363a4f'],
    ['mocha-base', '摩卡暮色', '#1e1e2e'],
    ['mocha-mantle', '摩卡夜色', '#181825'],
    ['mocha-crust', '摩卡深夜', '#11111b'],
    ['mocha-surface', '摩卡灰紫', '#313244'],
  ]),
];

/** Select a background without changing any other field property. */
export function applyPaperPalette(field: FieldStyle, palette: PaperPalette): void {
  field.backgroundColor = palette.colors.backgroundColor;
}
