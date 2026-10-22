// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Biaoxi contributors.
// Original geometric SVG artwork is the only rendering input.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const mode = process.argv.slice(2);
if (mode.length > 1 || (mode.length === 1 && mode[0] !== '--check')) {
  throw new Error('Usage: node scripts/generate-icon.mjs [--check]');
}
const svgUrl = new URL('../assets/icon.svg', import.meta.url);
const pngUrl = new URL('../assets/icon.png', import.meta.url);
const svg = await readFile(svgUrl);
const svgText = svg.toString('utf8');
if (/<(?:image|text|foreignObject|script)\b|(?:href|font-family)\s*=/i.test(svgText)) {
  throw new Error('Icon source must contain only local SVG geometry, without fonts or external resources.');
}
const image = await loadImage(svg);
const canvas = createCanvas(1024, 1024);
canvas.getContext('2d').drawImage(image, 0, 0, 1024, 1024);
const png = canvas.toBuffer('image/png');
if (mode[0] === '--check') {
  const existing = await readFile(pngUrl);
  if (!existing.equals(png)) throw new Error('assets/icon.png differs from the SVG render; run the command without --check.');
} else {
  await writeFile(pngUrl, png);
}
const sha256 = data => createHash('sha256').update(data).digest('hex');
process.stdout.write(JSON.stringify({
  source: 'assets/icon.svg',
  output: 'assets/icon.png',
  size: [1024, 1024],
  svgSha256: sha256(svg),
  pngSha256: sha256(png),
  action: mode[0] === '--check' ? 'verified-existing-png' : 'wrote-png',
}, null, 2) + '\n');
