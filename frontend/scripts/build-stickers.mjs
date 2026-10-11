#!/usr/bin/env node
/**
 * Builds the "Deb" mascot sticker set (28 stickers, original art).
 *
 *   node scripts/build-stickers.mjs                 # SVGs -> public/stickers/deb/
 *   node scripts/build-stickers.mjs --png <dir>     # also 1024 x 1024 transparent PNGs
 *   node scripts/build-stickers.mjs --sheet <file>  # also a contact sheet PNG
 *
 * Deb is an original character drawn for PyArena from basic shapes in
 * scripts/deb/. She is not based on any existing character, studio mascot or
 * logo. A headless Chromium (the one Playwright uses; set PW_CHROMIUM_PATH to
 * use a specific binary) measures each drawing so the character fills 80% of
 * the canvas height, then the fitted SVG is written. No network access is needed.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { DEFS } from "./deb/parts.mjs";
import { STICKERS } from "./deb/stickers.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "stickers", "deb");
const SIZE = 256;

const args = process.argv.slice(2);
const argValue = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? resolve(args[i + 1]) : null;
};
const pngDir = argValue("--png");
const sheetFile = argValue("--sheet");

// Die-cut sticker border: the silhouette is blurred and thresholded (which
// rounds it, unlike a square morphology kernel) into a cream rim with a thin
// navy edge. Flat colours only, no gradients reach the output.
const DIECUT = `<filter id="diecut" x="0" y="0" width="${SIZE}" height="${SIZE}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
  <feGaussianBlur in="SourceAlpha" stdDeviation="2.6" result="b1"/>
  <feComponentTransfer in="b1" result="edge"><feFuncA type="linear" slope="60" intercept="-1"/></feComponentTransfer>
  <feFlood flood-color="#0B1B2B"/><feComposite in2="edge" operator="in" result="navyRim"/>
  <feGaussianBlur in="SourceAlpha" stdDeviation="2.2" result="b2"/>
  <feComponentTransfer in="b2" result="rim"><feFuncA type="linear" slope="60" intercept="-2.2"/></feComponentTransfer>
  <feFlood flood-color="#FFF5E1"/><feComposite in2="rim" operator="in" result="creamRim"/>
  <feMerge><feMergeNode in="navyRim"/><feMergeNode in="creamRim"/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>`;

function rawSvg(sticker, transform = "") {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="1024" height="1024">
<title>Deb: ${sticker.title}</title>
<defs>${DEFS}${DIECUT}</defs>
<g filter="url(#diecut)"><g id="fit" transform="${transform}"><g id="all">${sticker.svg}</g></g></g>
</svg>
`;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  if (pngDir) mkdirSync(pngDir, { recursive: true });
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
  const fitted = [];
  for (const sticker of STICKERS) {
    await page.setContent(`<html><body style="margin:0;background:transparent">${rawSvg(sticker)}</body></html>`);
    const box = await page.evaluate(() => {
      const all = document.getElementById("all").getBBox();
      const deb = document.getElementById("deb").getBBox();
      return { all: [all.x, all.y, all.width, all.height], deb: [deb.x, deb.y, deb.width, deb.height] };
    });
    // Outlines extend 1.5 units past the geometric box, the die-cut rim ~6 more.
    const pad = 8;
    const [ax, ay, aw, ah] = box.all;
    const [, , , dh] = box.deb;
    const scale = Math.min((0.8 * SIZE) / (dh + 3), (SIZE - 2 * pad) / (aw + 3), (SIZE - 2 * pad) / (ah + 3));
    const tx = SIZE / 2 - (ax + aw / 2) * scale;
    const ty = SIZE / 2 - (ay + ah / 2) * scale;
    const transform = `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})`;
    const svg = rawSvg(sticker, transform);
    writeFileSync(join(OUT, `${sticker.id}.svg`), svg);
    fitted.push({ ...sticker, file: `${sticker.id}.svg`, final: svg });
    if (pngDir) {
      await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
      await page.locator("svg").screenshot({ path: join(pngDir, `${sticker.id}.png`), omitBackground: true });
    }
  }
  if (sheetFile) {
    const cells = fitted
      .map((s) => `<figure><div class="img">${s.final.replace(/width="1024" height="1024"/, 'width="220" height="220"')}</div><figcaption>${s.id} · ${s.mood}</figcaption></figure>`)
      .join("");
    await page.setViewportSize({ width: 1640, height: 1300 });
    await page.setContent(`<html><body style="margin:0;padding:16px;background:#26364a;font:13px sans-serif;color:#FFF5E1">
      <style>main{display:grid;grid-template-columns:repeat(7,1fr);gap:8px}figure{margin:0;text-align:center}.img{background:repeating-conic-gradient(#33475e 0 25%,#2c3e52 0 50%) 0 0/20px 20px;border-radius:10px}</style>
      <main>${cells}</main></body></html>`);
    await page.screenshot({ path: sheetFile, fullPage: true });
  }
  await browser.close();
  console.log(`wrote ${fitted.length} stickers to ${OUT}${pngDir ? ` and PNGs to ${pngDir}` : ""}`);
}

await main();
