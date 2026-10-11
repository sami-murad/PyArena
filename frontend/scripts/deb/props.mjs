/** Props and effects for the Deb stickers, all in the fixed palette. */
import { C, OL, tube } from "./parts.mjs";

const R = (n) => Math.round(n * 100) / 100;

/** Small deterministic PRNG so confetti is identical on every build. */
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function sparkle(x, y, s = 7, fill = C.yellow) {
  const k = s * 0.22;
  return `<path d="M${x} ${y - s} Q${x + k} ${y - k} ${x + s} ${y} Q${x + k} ${y + k} ${x} ${y + s} Q${x - k} ${y + k} ${x - s} ${y} Q${x - k} ${y - k} ${x} ${y - s} Z" fill="${fill}" stroke="${C.navy}" stroke-width="2.2" stroke-linejoin="round"/>`;
}

export function star(x, y, r = 7, fill = C.yellow) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${R(x + rr * Math.cos(a))},${R(y + rr * Math.sin(a))}`);
  }
  return `<polygon points="${pts.join(" ")}" fill="${fill}" stroke="${C.navy}" stroke-width="2.2" stroke-linejoin="round"/>`;
}

export function confetti(seed, box, n = 26) {
  const rand = rng(seed);
  const colors = [C.yellow, C.coral, C.mint, C.cream, C.yellow, C.coral, C.mint];
  const [x0, y0, x1, y1] = box;
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = R(x0 + rand() * (x1 - x0));
    const y = R(y0 + rand() * (y1 - y0));
    const c = colors[Math.floor(rand() * colors.length)];
    const a = Math.round(rand() * 180);
    const kind = rand();
    if (kind < 0.45) out.push(`<rect x="${x - 3}" y="${y - 1.8}" width="6" height="3.6" rx="0.8" fill="${c}" stroke="${C.navy}" stroke-width="1.4" transform="rotate(${a} ${x} ${y})"/>`);
    else if (kind < 0.7) out.push(`<circle cx="${x}" cy="${y}" r="2.4" fill="${c}" stroke="${C.navy}" stroke-width="1.4"/>`);
    else out.push(`<path d="M${x - 5} ${y} q2.5 -4 5 0 t5 0" fill="none" stroke="${C.navy}" stroke-width="4.4" stroke-linecap="round" transform="rotate(${a} ${x} ${y})"/><path d="M${x - 5} ${y} q2.5 -4 5 0 t5 0" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" transform="rotate(${a} ${x} ${y})"/>`);
  }
  return out.join("");
}

export function firework(x, y, r = 18, color = C.coral) {
  const out = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI * 2 * i) / 10;
    const x1 = R(x + Math.cos(a) * r * 0.35);
    const y1 = R(y + Math.sin(a) * r * 0.35);
    const x2 = R(x + Math.cos(a) * r);
    const y2 = R(y + Math.sin(a) * r);
    out.push(tube(`M${x1} ${y1} L${x2} ${y2}`, color, 2.6));
  }
  out.push(`<circle cx="${x}" cy="${y}" r="3" fill="${C.yellow}" stroke="${C.navy}" stroke-width="1.8"/>`);
  return out.join("");
}

export function sweat(x, y, s = 1, rot = 0) {
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><path d="M0 -9 Q7 0 6 4 Q5 9 0 9 Q-5 9 -6 4 Q-7 0 0 -9 Z" fill="${C.cream}" ${OL} stroke-width="2.2"/><path d="M-2.5 2 Q-2.5 5 0 6" stroke="${C.mint}" stroke-width="1.8" fill="none" stroke-linecap="round"/></g>`;
}

export const tear = (x, y, s = 0.6) => sweat(x, y, s, 0);

export function qmark(x, y, s = 1, color = C.yellow) {
  const d = "M-7 -8 Q-7 -17 0 -17 Q8 -17 8 -9 Q8 -3 1 0 L1 5";
  return `<g transform="translate(${x} ${y}) scale(${s})">${tube(d, color, 4.6)}<circle cx="1" cy="13" r="3.6" fill="${color}" stroke="${C.navy}" stroke-width="2.6"/></g>`;
}

export function thoughtBubble(x, y, inner = "") {
  const cloud = `M${x - 26} ${y + 6} Q${x - 34} ${y - 6} ${x - 22} ${y - 14} Q${x - 18} ${y - 28} ${x - 2} ${y - 24} Q${x + 10} ${y - 34} ${x + 22} ${y - 20} Q${x + 36} ${y - 14} ${x + 28} ${y} Q${x + 32} ${y + 14} ${x + 16} ${y + 14} Q${x + 4} ${y + 22} ${x - 8} ${y + 14} Q${x - 26} ${y + 20} ${x - 26} ${y + 6} Z`;
  return `<path d="${cloud}" fill="${C.cream}" ${OL}/><circle cx="${x - 22}" cy="${y + 24}" r="4.5" fill="${C.cream}" ${OL}/><circle cx="${x - 28}" cy="${y + 34}" r="2.8" fill="${C.cream}" ${OL}/>${inner}`;
}

export function loadingDots(x, y) {
  return [-12, 0, 12].map((dx, i) => `<circle cx="${x + dx}" cy="${y - i * 2}" r="${3.4 + i * 0.6}" fill="${[C.cream, C.yellow, C.mint][i]}" stroke="${C.navy}" stroke-width="2.2"/>`).join("");
}

/** Screen content kinds: code, blank, error, crack, check. */
export function screen(x, y, w, h, kind = "code", angle = 0, floating = true) {
  const out = [];
  if (floating) out.push(`<ellipse cx="${x + w / 2}" cy="${y + h + 12}" rx="${w * 0.36}" ry="3.4" fill="${C.navy}" opacity="0.16"/>`);
  out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${C.navy}" ${OL}/>`);
  const ix = x + 5;
  const iy = y + 5;
  const iw = w - 10;
  const ih = h - 10;
  const bg = kind === "error" || kind === "crack" ? C.cream : kind === "blank" ? C.cream : C.cream;
  out.push(`<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="3" fill="${bg}"/>`);
  const bar = (bx, by, bw, c) => `<rect x="${R(bx)}" y="${R(by)}" width="${R(bw)}" height="3.4" rx="1.7" fill="${c}"/>`;
  if (kind === "code" || kind === "check") {
    const rows = [
      [0, 0.5, C.coral],
      [0.12, 0.62, C.navy],
      [0.12, 0.38, C.mint],
      [0, 0.28, C.yellow],
    ];
    rows.forEach(([off, len, c], i) => {
      if (iy + 6 + i * 7 < iy + ih - 4) out.push(bar(ix + 5 + off * iw, iy + 5 + i * 7, len * iw, c));
    });
    if (kind === "check") out.push(`<circle cx="${ix + iw - 11}" cy="${iy + ih - 10}" r="7" fill="${C.mint}" stroke="${C.navy}" stroke-width="2"/><path d="M${ix + iw - 14.5} ${iy + ih - 10} l2.6 2.8 l5 -5.4" stroke="${C.navy}" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  if (kind === "error" || kind === "crack") {
    out.push(bar(ix + 5, iy + 5, iw * 0.45, C.navy), bar(ix + 5, iy + 12, iw * 0.6, C.coral), bar(ix + 5, iy + 19, iw * 0.35, C.coral));
    const cx = ix + iw - 13;
    const cy = iy + ih - 12;
    out.push(`<circle cx="${cx}" cy="${cy}" r="8" fill="${C.coral}" stroke="${C.navy}" stroke-width="2"/><path d="M${cx - 3.4} ${cy - 3.4} l6.8 6.8 M${cx + 3.4} ${cy - 3.4} l-6.8 6.8" stroke="${C.cream}" stroke-width="2.6" stroke-linecap="round"/>`);
  }
  if (kind === "crack") {
    const sx = ix + iw * 0.42;
    out.push(`<path d="M${sx} ${iy} L${sx + 6} ${iy + ih * 0.3} L${sx - 4} ${iy + ih * 0.5} L${sx + 8} ${iy + ih * 0.75} L${sx + 2} ${iy + ih}" stroke="${C.navy}" stroke-width="2.6" fill="none" stroke-linejoin="round"/><path d="M${sx + 6} ${iy + ih * 0.3} L${sx + 18} ${iy + ih * 0.22} M${sx - 4} ${iy + ih * 0.5} L${sx - 16} ${iy + ih * 0.62} M${sx + 8} ${iy + ih * 0.75} L${sx + 20} ${iy + ih * 0.86}" stroke="${C.navy}" stroke-width="2" fill="none" stroke-linecap="round"/>`);
  }
  return `<g transform="rotate(${angle} ${x + w / 2} ${y + h / 2})">${out.join("")}</g>`;
}

export function monitor(x, y, w = 56, h = 40) {
  const cx = x + w / 2;
  return [
    `<rect x="${cx - 4}" y="${y + h}" width="8" height="14" fill="${C.navy}"/>`,
    `<rect x="${cx - 16}" y="${y + h + 12}" width="32" height="6" rx="3" fill="${C.navy}" ${OL}/>`,
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${C.navy}" ${OL}/>`,
    `<rect x="${x + 5}" y="${y + 5}" width="${w - 10}" height="${h - 10}" rx="2.5" fill="${C.cream}"/>`,
    `<circle cx="${x + w - 7}" cy="${y + h - 3}" r="1.2" fill="${C.mint}"/>`,
  ].join("");
}

export function steam(x, y, s = 1) {
  const wisps = [-7, 0, 7].map((dx, i) => tube(`M${x + dx} ${y - i * 2} q-4 -5 0 -10 t0 -10`, C.cream, 2.4)).join("");
  return `<g transform="translate(${R(x * (1 - s))} ${R(y * (1 - s))}) scale(${s})">${wisps}</g>`;
}

export function mug(x, y, s = 1) {
  return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M10 -6 Q20 -6 20 3 Q20 12 9 11" fill="none" stroke="${C.navy}" stroke-width="8"/><path d="M10 -6 Q20 -6 20 3 Q20 12 9 11" fill="none" stroke="${C.coral}" stroke-width="3"/><path d="M-12 -12 L12 -12 L10 14 Q10 18 6 18 L-6 18 Q-10 18 -10 14 Z" fill="${C.coral}" ${OL}/><path d="M-11.2 -2 L11.2 -2 L10.6 5 L-10.6 5 Z" fill="${C.cream}"/><ellipse cx="0" cy="-12" rx="12" ry="2.6" fill="${C.navy}"/></g>`;
}

export function gear(cx, cy, r, teeth = 8, rot = 0, fill = C.yellow) {
  const pts = [];
  const ro = r;
  const ri = r * 0.78;
  for (let i = 0; i < teeth * 4; i++) {
    const a = (Math.PI * 2 * i) / (teeth * 4) + (rot * Math.PI) / 180;
    const rr = i % 4 < 2 ? ro : ri;
    pts.push(`${R(cx + rr * Math.cos(a))},${R(cy + rr * Math.sin(a))}`);
  }
  return `<polygon points="${pts.join(" ")}" fill="${fill}" stroke="${C.navy}" stroke-width="2.4" stroke-linejoin="round"/><circle cx="${cx}" cy="${cy}" r="${R(r * 0.32)}" fill="${C.cream}" stroke="${C.navy}" stroke-width="2.2"/>`;
}

export function spinArc(cx, cy, r) {
  return `<path d="M${cx + r} ${cy} A${r} ${r} 0 0 0 ${cx} ${cy - r}" stroke="${C.navy}" stroke-width="2" fill="none" stroke-linecap="round" stroke-dasharray="3 4"/>`;
}

export function desk(top = 168, x0 = 52, x1 = 204) {
  return `<rect x="${x0}" y="${top}" width="${x1 - x0}" height="12" rx="4" fill="${C.yellow}" ${OL}/><rect x="${x0 + 10}" y="${top + 12}" width="${x1 - x0 - 20}" height="34" fill="${C.yellow}" ${OL}/><rect x="${x0 + 10}" y="${top + 12}" width="${x1 - x0 - 20}" height="7" fill="${C.navy}" opacity="0.16"/><path d="M${x0 + 30} ${top + 30} h22" stroke="${C.navy}" stroke-width="2.4" stroke-linecap="round"/>`;
}

export function keyboard(cx, y, w = 76) {
  const keys = [];
  for (let i = 0; i < 9; i++) keys.push(`<rect x="${R(cx - w / 2 + 6 + i * ((w - 12) / 9))}" y="${y + 3}" width="5" height="2.6" rx="1" fill="${C.cream}"/>`);
  return `<rect x="${cx - w / 2}" y="${y}" width="${w}" height="9" rx="3" fill="${C.navy}" ${OL}/>${keys.join("")}`;
}

export function motion(x, y, len = 10, angle = 0, n = 3, gap = 6) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(`<path d="M${x} ${y + i * gap} h${len - i * 2}" stroke="${C.navy}" stroke-width="2.4" stroke-linecap="round"/>`);
  return `<g transform="rotate(${angle} ${x} ${y})">${out.join("")}</g>`;
}

export function squiggles(cx, cy) {
  const z = (x, y, a) => `<g transform="rotate(${a} ${x} ${y})">${tube(`M${x - 7} ${y} l3.5 -4 l3.5 4 l3.5 -4 l3.5 4`, C.coral, 2.2)}</g>`;
  return [z(cx - 46, cy - 18, -60), z(cx + 46, cy - 18, 60), z(cx - 40, cy - 46, -30), z(cx + 40, cy - 46, 30), z(cx, cy - 66, 0)].join("");
}

export function scribbleCloud(x, y) {
  const cloud = `M${x - 16} ${y + 4} Q${x - 22} ${y - 4} ${x - 12} ${y - 9} Q${x - 8} ${y - 18} ${x + 2} ${y - 13} Q${x + 12} ${y - 18} ${x + 16} ${y - 7} Q${x + 24} ${y - 2} ${x + 16} ${y + 6} Q${x} ${y + 12} ${x - 16} ${y + 4} Z`;
  const scrib = `M${x - 9} ${y - 2} q3 -6 6 0 t6 0 t6 0 M${x - 6} ${y + 3} l4 -3 l3 3 l4 -3 l3 3`;
  return `<path d="${cloud}" fill="${C.navy}" ${OL}/><path d="${scrib}" stroke="${C.coral}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>${tube(`M${x - 4} ${y + 12} l-3 6 h5 l-3 6`, C.yellow, 2)}`;
}

export function magnifier(cx, cy, r, handleAngle = 135) {
  const a = (handleAngle * Math.PI) / 180;
  const hx1 = R(cx + Math.cos(a) * r);
  const hy1 = R(cy + Math.sin(a) * r);
  const hx2 = R(cx + Math.cos(a) * (r + 30));
  const hy2 = R(cy + Math.sin(a) * (r + 30));
  return {
    lens: `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${C.cream}" opacity="0.55"/>`,
    rim: `${tube(`M${hx1} ${hy1} L${hx2} ${hy2}`, C.coral, 7)}<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.navy}" stroke-width="9"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.yellow}" stroke-width="4"/><path d="M${cx - r * 0.55} ${cy - r * 0.25} A${r * 0.6} ${r * 0.6} 0 0 1 ${cx - r * 0.2} ${cy - r * 0.58}" stroke="${C.cream}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
    handle: [hx2, hy2],
  };
}

export function codeLine(x, y, w, scale = 1) {
  return `<g transform="translate(${x} ${y}) scale(${scale})"><rect x="0" y="0" width="${w}" height="14" rx="7" fill="${C.navy}" ${OL}/><rect x="7" y="5" width="${w * 0.22}" height="4" rx="2" fill="${C.coral}"/><rect x="${10 + w * 0.22}" y="5" width="${w * 0.3}" height="4" rx="2" fill="${C.mint}"/><rect x="${13 + w * 0.52}" y="5" width="${w * 0.24}" height="4" rx="2" fill="${C.yellow}"/></g>`;
}

export function trophy(cx, top, s = 1) {
  return `<g transform="translate(${cx} ${top}) scale(${s})">
  <path d="M-20 6 Q-34 6 -32 18 Q-30 30 -14 30" fill="none" stroke="${C.navy}" stroke-width="9"/><path d="M-20 6 Q-34 6 -32 18 Q-30 30 -14 30" fill="none" stroke="${C.yellow}" stroke-width="3.6"/>
  <path d="M20 6 Q34 6 32 18 Q30 30 14 30" fill="none" stroke="${C.navy}" stroke-width="9"/><path d="M20 6 Q34 6 32 18 Q30 30 14 30" fill="none" stroke="${C.yellow}" stroke-width="3.6"/>
  <path d="M-22 0 L22 0 Q22 34 4 40 L4 48 L-4 48 L-4 40 Q-22 34 -22 0 Z" fill="${C.yellow}" ${OL}/>
  <path d="M6 4 Q8 26 1 34 L4 40 Q20 32 20 4 Z" fill="${C.navy}" opacity="0.16"/>
  <rect x="-15" y="48" width="30" height="8" rx="2" fill="${C.yellow}" ${OL}/><rect x="-20" y="56" width="40" height="9" rx="2.5" fill="${C.navy}" ${OL}/>
  <path d="M-10 6 Q-11 18 -6 26" stroke="${C.cream}" stroke-width="3" fill="none" stroke-linecap="round"/>
  ${star(0, 16, 6.5, C.cream)}
  </g>`;
}

export function spotlight(cx, cy, r) {
  const rays = [];
  for (let i = 0; i < 12; i++) {
    const a1 = (Math.PI * 2 * i) / 12;
    const a2 = a1 + Math.PI / 12;
    rays.push(`M${cx} ${cy} L${R(cx + Math.cos(a1) * r)} ${R(cy + Math.sin(a1) * r)} L${R(cx + Math.cos(a2) * r)} ${R(cy + Math.sin(a2) * r)} Z`);
  }
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${C.yellow}" opacity="0.35"/><path d="${rays.join(" ")}" fill="${C.yellow}" opacity="0.45"/>`;
}

export function podium(cx, top, w = 96, h = 34) {
  return `<rect x="${cx - w / 2}" y="${top}" width="${w}" height="${h}" rx="4" fill="${C.cream}" ${OL}/><rect x="${cx - w / 2}" y="${top}" width="${w}" height="8" rx="3" fill="${C.yellow}" ${OL}/><rect x="${cx + w / 2 - 16}" y="${top + 9.5}" width="14.5" height="${h - 11}" fill="${C.navy}" opacity="0.16"/>${star(cx, top + 21, 7)}`;
}

export function crown(cx, cy, s = 1) {
  return `<g transform="translate(${cx} ${cy}) scale(${s})"><path d="M-20 10 L-22 -10 L-10 0 L0 -16 L10 0 L22 -10 L20 10 Z" fill="${C.yellow}" ${OL}/><rect x="-21" y="8" width="42" height="7" rx="2" fill="${C.yellow}" ${OL}/><circle cx="0" cy="11.5" r="2.3" fill="${C.coral}"/><circle cx="-12" cy="11.5" r="2" fill="${C.mint}"/><circle cx="12" cy="11.5" r="2" fill="${C.mint}"/><circle cx="0" cy="-16" r="3" fill="${C.coral}" stroke="${C.navy}" stroke-width="2"/></g>`;
}

export function sunglasses(cy = 73, dy = 0) {
  const y = cy + dy;
  return `<g><path d="M104 ${y - 6} L152 ${y - 6}" stroke="${C.navy}" stroke-width="7" stroke-linecap="round"/><path d="M104 ${y - 6} L152 ${y - 6}" stroke="${C.yellow}" stroke-width="2.4" stroke-linecap="round"/><path d="M104 ${y - 7} L125 ${y - 7} L123 ${y + 4} Q114 ${y + 9} 106 ${y + 4} Z" fill="${C.navy}" stroke="${C.yellow}" stroke-width="2.4" stroke-linejoin="round"/><path d="M131 ${y - 7} L152 ${y - 7} L150 ${y + 4} Q142 ${y + 9} 133 ${y + 4} Z" fill="${C.navy}" stroke="${C.yellow}" stroke-width="2.4" stroke-linejoin="round"/><path d="M109 ${y - 3} l5 0 M136 ${y - 3} l5 0" stroke="${C.cream}" stroke-width="2" stroke-linecap="round"/></g>`;
}

/** A hero cape whose left and right edges are a giant "{" and "}" in cream. */
export function braceCape() {
  const left = "M92 108 Q74 108 74 124 L74 150 Q74 163 60 165 Q74 167 74 180 L74 204 Q74 220 90 220";
  const right = left.replace(/([ML Q]|^)(\d+(?:\.\d+)?) /g, (m, cmd, x) => `${cmd}${256 - Number(x)} `);
  const sheet = "M92 108 Q74 108 74 124 L74 150 Q74 163 60 165 Q74 167 74 180 L74 204 Q74 220 90 220 L166 220 Q182 220 182 204 L182 180 Q182 167 196 165 Q182 163 182 150 L182 124 Q182 108 164 108 Z";
  return `<path d="${sheet}" fill="${C.coral}" ${OL}/><path d="M150 112 Q172 140 168 218 L166 220 Q182 220 182 204 L182 180 Q182 167 196 165 Q182 163 182 150 L182 124 Q182 108 164 108 Z" fill="${C.navy}" opacity="0.16"/>${tube(left, C.cream, 7)}${tube(right, C.cream, 7)}`;
}

export function chair(cx = 128) {
  return `<rect x="${cx - 46}" y="94" width="92" height="90" rx="20" fill="${C.yellow}" ${OL}/><rect x="${cx - 52}" y="170" width="104" height="14" rx="6" fill="${C.yellow}" ${OL}/><rect x="${cx - 4}" y="184" width="8" height="22" fill="${C.navy}"/><path d="M${cx - 24} 214 L${cx + 24} 214 M${cx} 206 L${cx} 214" stroke="${C.navy}" stroke-width="5" stroke-linecap="round"/><circle cx="${cx - 24}" cy="216" r="4" fill="${C.navy}"/><circle cx="${cx + 24}" cy="216" r="4" fill="${C.navy}"/>`;
}

export function sideTable(x, top, w = 46) {
  return `<rect x="${x}" y="${top}" width="${w}" height="10" rx="3" fill="${C.yellow}" ${OL}/><rect x="${x + 6}" y="${top + 10}" width="6" height="44" fill="${C.yellow}" ${OL}/><rect x="${x + w - 12}" y="${top + 10}" width="6" height="44" fill="${C.yellow}" ${OL}/>`;
}

export function lightbulb(cx, cy, s = 1) {
  const rays = [];
  for (let i = 0; i < 7; i++) {
    const a = Math.PI + (Math.PI * i) / 6;
    rays.push(tube(`M${R(cx + Math.cos(a) * 24 * s)} ${R(cy + Math.sin(a) * 24 * s)} L${R(cx + Math.cos(a) * 33 * s)} ${R(cy + Math.sin(a) * 33 * s)}`, C.yellow, 2.4));
  }
  return `${rays.join("")}<g transform="translate(${cx} ${cy}) scale(${s})"><circle r="24" fill="${C.yellow}" opacity="0.3"/><path d="M-13 4 Q-17 -4 -15 -10 Q-10 -20 0 -20 Q10 -20 15 -10 Q17 -4 13 4 Q8 9 8 14 L-8 14 Q-8 9 -13 4 Z" fill="${C.yellow}" ${OL}/><path d="M-4 12 L-4 2 Q0 -4 4 2 L4 12" stroke="${C.navy}" stroke-width="1.8" fill="none"/><rect x="-8" y="14" width="16" height="9" rx="2" fill="${C.navy}" ${OL}/><path d="M-9 -8 Q-8 -14 -3 -16" stroke="${C.cream}" stroke-width="2.6" fill="none" stroke-linecap="round"/></g>`;
}
