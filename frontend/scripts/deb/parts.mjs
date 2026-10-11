/**
 * Deb: the shared, parametric character every sticker is built from.
 *
 * Deb is an original character drawn for PyArena from basic shapes. She is not
 * based on any existing character, studio mascot or logo. Keeping one set of
 * parts (hair, face, hoodie, hands, legs) and only changing pose parameters is
 * what keeps all 28 stickers on-model.
 *
 * Coordinates are in a 256 x 256 design space; build-stickers.mjs scales the
 * finished drawing to fill 80% of the canvas height. Outlines are 3 units.
 */

export const C = {
  navy: "#0B1B2B",
  yellow: "#FFCB3D",
  cream: "#FFF5E1",
  coral: "#FF6B6B",
  mint: "#7BD389",
  // Character colours the spec requires beyond the five-colour palette.
  skin: "#C98A5E",
  hair: "#4A2E22",
};

const SHADE = `fill="${C.navy}" opacity="0.16"`;
export const OL = `stroke="${C.navy}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
const R = (n) => Math.round(n * 100) / 100;

/** An outlined tube (sleeve, leg, string): navy stroke under a narrower coloured stroke. */
export function tube(d, fill, width) {
  const common = `fill="none" stroke-linecap="round" stroke-linejoin="round"`;
  return `<path d="${d}" stroke="${C.navy}" stroke-width="${width + 6}" ${common}/><path d="${d}" stroke="${fill}" stroke-width="${width}" ${common}/>`;
}

const q = (a, c, b) => `M${a[0]} ${a[1]} Q${c[0]} ${c[1]} ${b[0]} ${b[1]}`;

/* ------------------------------------------------------------------ hands */

// Local hand geometry: palm at (0, 0), fingers pointing to -y. Three fingers
// plus a thumb: a four-finger cartoon hand.
const HAND_SHAPES = {
  fist: { palm: 7.5, caps: [], lines: ["M-3 -5.5 v3", "M1.5 -6 v3"] },
  hold: { palm: 7.5, caps: [], lines: ["M-3.5 -5 v3", "M1 -6 v3.2"] },
  open: {
    palm: 6.6,
    caps: [
      [-4.6, -3.5, -6.6, -13, 4.3],
      [0, -4.5, 0, -15, 4.3],
      [4.6, -3.5, 6.6, -13, 4.3],
      [-6, 1.5, -12.5, -3.5, 4.5],
    ],
    lines: [],
  },
  flat: {
    palm: 6.6,
    caps: [
      [-3.6, -3.5, -3.8, -13, 4],
      [0, -4.5, 0, -14, 4],
      [3.6, -3.5, 3.8, -13, 4],
      [-6, 1.5, -11, -4.5, 4.4],
    ],
    lines: ["M-1.8 -6 v-5", "M1.8 -6 v-5"],
  },
  thumbsUp: {
    palm: 7.5,
    caps: [[-2.5, -4, -2.5, -15.5, 5]],
    lines: ["M2 -2.5 h4.5", "M2 1 h5", "M2 4.5 h4"],
  },
  // Index finger on the thumb side, the thumb wrapped across the front and
  // knuckle lines for the curled fingers, so it can only read as pointing.
  point: {
    palm: 7.5,
    caps: [
      [-3.6, -4.5, -4.4, -17.5, 4.2],
      [-6.5, 1.5, 0.5, 0.5, 4.2],
    ],
    lines: ["M1.5 -4.5 h5", "M2.5 -0.5 h4.5", "M1.5 3.5 h4.5"],
  },
  peace: {
    palm: 7.5,
    caps: [
      [-2.2, -5, -4.5, -16.5, 4.2],
      [2.8, -5, 5.5, -16.5, 4.2],
    ],
    lines: [],
  },
  pinch: {
    palm: 7.2,
    caps: [
      [2, -4.5, 14, -7.5, 4],
      [2, 3, 13, 4, 4.4],
    ],
    lines: ["M-3 -2 h3"],
  },
};

/** A hand at (x, y); `angle` rotates the fingers (0 = up, 180 = down). */
export function hand(x, y, angle = 0, type = "fist", scale = 1) {
  const s = HAND_SHAPES[type] ?? HAND_SHAPES.fist;
  const outline = [
    `<circle r="${s.palm}" fill="${C.navy}" stroke="${C.navy}" stroke-width="6"/>`,
    ...s.caps.map(([x1, y1, x2, y2, w]) => `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${C.navy}" stroke-width="${w + 6}" stroke-linecap="round"/>`),
  ];
  const fill = [
    ...s.caps.map(([x1, y1, x2, y2, w]) => `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${C.skin}" stroke-width="${w}" stroke-linecap="round"/>`),
    `<circle r="${s.palm}" fill="${C.skin}"/>`,
    ...s.lines.map((d) => `<path d="${d}" stroke="${C.navy}" stroke-width="1.6" stroke-linecap="round" fill="none"/>`),
  ];
  return `<g transform="translate(${R(x)} ${R(y)}) rotate(${angle}) scale(${scale})">${outline.join("")}${fill.join("")}</g>`;
}

/* ------------------------------------------------------------------- head */

const FACE = { cx: 128, cy: 67, rx: 31, ry: 29 };
const EYE_L = [115, 73];
const EYE_R = [141, 73];

const BACK_HAIR =
  "M128 30 C100 30 86 46 86 70 C86 86 84 96 88 108 L95 101 L99 111 L106 101 L110 106 L112 92 L144 92 L146 106 L150 101 L157 111 L161 101 L168 108 C172 96 170 86 170 70 C170 46 156 30 128 30 Z";
// Bangs: rounded, slightly uneven locks hanging between "notch" points.
const NOTCHES = [
  [158, 68],
  [151, 51],
  [141, 47],
  [131, 44],
  [121, 46],
  [112, 49],
  [104, 55],
  [98, 66],
];
const LOCK_DROP = [9, 8, 10, 8, 9, 7, 9];
const FRONT_HAIR = (() => {
  let d = "M95 77 C91 52 104 31 128 30 C152 31 166 50 161 79 L158 68";
  for (let i = 1; i < NOTCHES.length; i++) {
    const [x0, y0] = NOTCHES[i - 1];
    const [x1, y1] = NOTCHES[i];
    const cx = (x0 + x1) / 2 + (i % 2 ? 1.5 : -1.5);
    const cy = Math.max(y0, y1) + LOCK_DROP[i - 1];
    d += ` Q${cx} ${cy} ${x1} ${y1}`;
  }
  return `${d} L95 77 Z`;
})();
const TUFTS = ["M127 31 C125 23 119 19 111 20 C117 23 120 27 119 33 Z", "M136 31 C139 26 145 24 150 26 C145 27 142 30 142 34 Z"];

function eye([x, y], type, look = [0, 0]) {
  const [dx, dy] = look;
  const ex = x + dx;
  const ey = y + dy;
  const line = (d, w = 2.8) => `<path d="${d}" stroke="${C.navy}" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  switch (type) {
    case "closedHappy":
      return line(`M${x - 6} ${y + 2} Q${x} ${y - 6} ${x + 6} ${y + 2}`);
    case "closedCalm":
      return line(`M${x - 6} ${y - 1} Q${x} ${y + 5} ${x + 6} ${y - 1}`);
    case "squeeze":
      return line(`M${x - 6} ${y - 4} L${x + 4} ${y} L${x - 6} ${y + 4}`);
    case "squeezeR":
      return line(`M${x + 6} ${y - 4} L${x - 4} ${y} L${x + 6} ${y + 4}`);
    case "half":
      return `<ellipse cx="${ex}" cy="${ey + 1.5}" rx="5.6" ry="5" fill="${C.navy}"/><rect x="${x - 8}" y="${y - 9}" width="16" height="9" fill="${C.skin}"/>${line(`M${x - 7} ${y} Q${x} ${y - 1.5} ${x + 7} ${y}`)}<circle cx="${ex + 2}" cy="${ey + 2}" r="1.5" fill="${C.cream}"/>`;
    case "narrow":
      return `<ellipse cx="${ex}" cy="${ey + 1}" rx="5.6" ry="2.6" fill="${C.navy}"/>${line(`M${x - 7} ${y - 2} Q${x} ${y - 3.5} ${x + 7} ${y - 2}`)}`;
    case "blink":
      return `<ellipse cx="${ex}" cy="${ey + 2.5}" rx="5.4" ry="3" fill="${C.navy}"/><rect x="${x - 8}" y="${y - 9}" width="16" height="10.5" fill="${C.skin}"/>${line(`M${x - 7} ${y + 1.5} Q${x} ${y + 0.5} ${x + 7} ${y + 1.5}`)}`;
    case "dot":
      return `<ellipse cx="${ex}" cy="${ey}" rx="3.4" ry="3.9" fill="${C.navy}"/><circle cx="${ex + 1.1}" cy="${ey - 1.3}" r="1" fill="${C.cream}"/>`;
    case "wide":
      return `<circle cx="${x}" cy="${y}" r="8" fill="${C.cream}" stroke="${C.navy}" stroke-width="2.4"/><circle cx="${ex}" cy="${ey}" r="3.4" fill="${C.navy}"/><circle cx="${ex + 1.2}" cy="${ey - 1.3}" r="1.1" fill="${C.cream}"/>`;
    case "teary":
      return `<ellipse cx="${ex}" cy="${ey}" rx="6" ry="7.4" fill="${C.navy}"/><circle cx="${ex + 2}" cy="${ey - 2.8}" r="2.3" fill="${C.cream}"/><circle cx="${ex - 2}" cy="${ey + 2.6}" r="1.3" fill="${C.cream}"/>`;
    case "open":
    default:
      return `<ellipse cx="${ex}" cy="${ey}" rx="5.8" ry="7.2" fill="${C.navy}"/><circle cx="${ex + 1.9}" cy="${ey - 2.7}" r="2.2" fill="${C.cream}"/>`;
  }
}

function brow([x, y], side, type) {
  if (!type || type === "none") return "";
  // side: -1 for the left eye (inner end is +x), +1 for the right eye.
  const inner = x - side * 5.5;
  const outer = x + side * 5.5;
  const at = {
    relaxed: [-12.5, -12.5, -14.5],
    up: [-16, -16, -18],
    worried: [-11.5, -16, -15],
    determined: [-15.5, -11.5, -15],
    hopeful: [-13, -16.5, -16],
  }[type];
  if (!at) return "";
  const [o, i, mid] = at;
  return `<path d="M${outer} ${y + o} Q${x} ${y + mid} ${inner} ${y + i}" stroke="${C.hair}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
}

function mouth(type) {
  const s = (d, w = 2.6) => `<path d="${d}" stroke="${C.navy}" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  switch (type) {
    case "none":
      return "";
    case "grin":
      return `<path d="M115 84 Q128 87 141 84 Q128 106 115 84 Z" fill="${C.navy}" ${OL} stroke-width="2.4"/><path d="M117.6 85.2 Q128 87.6 138.4 85.2 L137 88.6 Q128 90.4 119 88.6 Z" fill="${C.cream}"/><ellipse cx="128" cy="93.4" rx="5.6" ry="2.6" fill="${C.coral}"/>`;
    case "bigOpen":
      return `<path d="M117 84 Q128 86 139 84 Q136 102 128 102 Q120 102 117 84 Z" fill="${C.navy}" ${OL} stroke-width="2.4"/><ellipse cx="128" cy="97" rx="6" ry="3.4" fill="${C.coral}"/>`;
    case "o":
      return `<ellipse cx="128" cy="89" rx="3.4" ry="4.4" fill="${C.navy}"/>`;
    case "oSmall":
      return `<ellipse cx="128" cy="89" rx="2.4" ry="2.8" fill="${C.navy}"/>`;
    case "smirk":
      return s("M120 89 Q130 92 137 85");
    case "flat":
      return s("M122 89 L134 89");
    case "wavy":
      return s("M118 90 q2.5 -3 5 0 t5 0 t5 0 t5 0", 2.4);
    case "sad":
      return s("M121 91 Q128 85 135 91");
    case "tongue":
      return `${s("M120 87 Q128 91 136 87")}<path d="M129.5 89.2 Q131 96 135 94 Q137 92 135.5 87.6 Z" fill="${C.coral}" stroke="${C.navy}" stroke-width="1.8" stroke-linejoin="round"/>`;
    case "pressed":
      return s("M117 85 Q128 95 139 85", 2.8);
    case "openSmile":
      return `<path d="M120 86 Q128 88 136 86 Q134 96 128 96 Q122 96 120 86 Z" fill="${C.navy}" ${OL} stroke-width="2.2"/><ellipse cx="128" cy="92.6" rx="3.6" ry="1.8" fill="${C.coral}"/>`;
    case "smile":
    default:
      return s("M120 86 Q128 93 136 86");
  }
}

/**
 * The head, drawn in front of the body. `back` is drawn separately (behind the
 * body) so long hair falls behind the shoulders.
 */
export function head(o = {}) {
  const eyes = o.eyes ?? ["open", "open"];
  const brows = o.brows ?? ["relaxed", "relaxed"];
  const look = o.look ?? [0, 0];
  const blush = o.blush ?? true;
  const parts = [];
  // ears
  parts.push(`<circle cx="97.5" cy="74" r="5.5" fill="${C.skin}" ${OL}/><circle cx="158.5" cy="74" r="5.5" fill="${C.skin}" ${OL}/>`);
  // face + the flat shadow under the bangs
  parts.push(`<ellipse cx="${FACE.cx}" cy="${FACE.cy}" rx="${FACE.rx}" ry="${FACE.ry}" fill="${C.skin}" ${OL}/>`);
  parts.push(`<g clip-path="url(#faceClip)"><path d="${FRONT_HAIR}" transform="translate(0 5)" ${SHADE}/></g>`);
  if (blush) parts.push(`<ellipse cx="106" cy="84" rx="5.5" ry="3.2" fill="${C.coral}" opacity="0.5"/><ellipse cx="150" cy="84" rx="5.5" ry="3.2" fill="${C.coral}" opacity="0.5"/>`);
  parts.push(eye(EYE_L, eyes[0], look), eye(EYE_R, eyes[1], look));
  parts.push(`<path d="M126 80.5 q2 2 4 0" stroke="${C.navy}" stroke-width="2" fill="none" stroke-linecap="round"/>`);
  parts.push(mouth(o.mouth ?? "smile"));
  // hair over the forehead
  parts.push(`<path d="${FRONT_HAIR}" fill="${C.hair}" ${OL}/>`);
  parts.push(...TUFTS.map((d) => `<path d="${d}" fill="${C.hair}" ${OL}/>`));
  parts.push(`<path d="M112 38 Q120 33 128 34" stroke="${C.cream}" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.45"/>`);
  parts.push(brow(EYE_L, -1, brows[0]), brow(EYE_R, 1, brows[1]));
  if (o.extra) parts.push(o.extra);
  return parts.join("");
}

export const backHair = () => `<path d="${BACK_HAIR}" fill="${C.hair}" ${OL}/>`;

export const DEFS = `<clipPath id="faceClip"><ellipse cx="${FACE.cx}" cy="${FACE.cy}" rx="${FACE.rx}" ry="${FACE.ry}"/></clipPath>
<clipPath id="torsoClip"><path d="${"M100 104 Q128 96 156 104 Q170 110 170 128 L172 166 Q172 176 160 176 L96 176 Q84 176 84 166 L86 128 Q86 110 100 104 Z"}"/></clipPath>`;

/* ------------------------------------------------------------------- body */

const TORSO = "M100 104 Q128 96 156 104 Q170 110 170 128 L172 166 Q172 176 160 176 L96 176 Q84 176 84 166 L86 128 Q86 110 100 104 Z";
export const SHOULDER_L = [101, 117];
export const SHOULDER_R = [155, 117];

export function torso() {
  return [
    `<path d="${TORSO}" fill="${C.cream}" ${OL}/>`,
    `<g clip-path="url(#torsoClip)"><path d="M158 100 Q172 130 166 180 L180 180 L180 100 Z" ${SHADE}/><rect x="80" y="104" width="100" height="10" ${SHADE}/></g>`,
    // kangaroo pocket and ribbed hem
    `<path d="M106 150 Q128 146 150 150 L155 168 L101 168 Z" fill="none" stroke="${C.navy}" stroke-width="2.4" stroke-linejoin="round"/>`,
    `<path d="M86 166 Q128 171 171 166" fill="none" stroke="${C.navy}" stroke-width="2.2" stroke-linecap="round"/>`,
    // hood collar
    `<path d="M101 107 Q128 90 155 107 Q150 118 128 118 Q106 118 101 107 Z" fill="${C.cream}" ${OL}/>`,
    `<path d="M106 109 Q128 112 150 109" fill="none" stroke="${C.navy}" stroke-width="1.8" opacity="0.35"/>`,
    // drawstrings
    tube("M121 118 L120 134", C.yellow, 2.4),
    tube("M135 118 L136 134", C.yellow, 2.4),
    // the "Py" patch
    `<rect x="140.5" y="123" width="17" height="12.5" rx="3" fill="${C.navy}" stroke="${C.navy}" stroke-width="1.5"/>`,
    `<path d="M144 132.5 V125.8 h2.6 a1.9 1.9 0 0 1 0 3.8 h-2.6 M150.2 126.4 l2 3.2 M154.4 126.4 l-3.4 6.6" stroke="${C.cream}" stroke-width="1.35" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  ].join("");
}

export function neck() {
  return `<rect x="119" y="88" width="18" height="20" rx="4" fill="${C.skin}" ${OL}/><rect x="120.5" y="96" width="15" height="10" ${SHADE}/>`;
}

/** Coral headphones resting around the neck (never on the ears). */
export function headphones() {
  return [
    tube("M104 107 Q128 128 152 107", C.coral, 4.5),
    `<ellipse cx="103" cy="106" rx="7.5" ry="9.5" fill="${C.coral}" ${OL}/><ellipse cx="103" cy="106" rx="3" ry="5" fill="${C.navy}"/>`,
    `<ellipse cx="153" cy="106" rx="7.5" ry="9.5" fill="${C.coral}" ${OL}/><ellipse cx="153" cy="106" rx="3" ry="5" fill="${C.navy}"/>`,
  ].join("");
}

/** A sleeve from a shoulder through `ctrl` to `to`, with a hand at the end. */
export function arm(from, a) {
  const d = q(from, a.ctrl, a.to);
  return tube(d, C.cream, 13) + (a.hand === "none" ? "" : hand(a.to[0] + (a.handOffset?.[0] ?? 0), a.to[1] + (a.handOffset?.[1] ?? 0), a.angle ?? 180, a.hand ?? "fist", a.handScale ?? 1));
}

function shoe(x, y, dir = 1, angle = 0) {
  return `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${dir} 1)"><path d="M-8 -5 Q-8 -9 -2 -9 Q6 -9 11 -3 Q13 1 9 3 L-7 3 Q-10 3 -8 -5 Z" fill="${C.mint}" ${OL}/><path d="M-8 1 L11 1" stroke="${C.cream}" stroke-width="2.2" stroke-linecap="round"/></g>`;
}

const LEG_W = 15;

/** Navy trousers with a faint cream tint so the navy outline still separates the legs. */
function leg(d) {
  const common = `fill="none" stroke-linecap="round" stroke-linejoin="round"`;
  return `<path d="${d}" stroke="${C.navy}" stroke-width="${LEG_W + 6}" ${common}/><path d="${d}" stroke="${C.navy}" stroke-width="${LEG_W}" ${common}/><path d="${d}" stroke="${C.cream}" stroke-opacity="0.16" stroke-width="${LEG_W}" ${common}/>`;
}

/** Leg poses. Each returns svg drawn behind the hoodie. */
export const legs = {
  none: () => "",
  stand: () =>
    [leg("M114 170 L113 212"), leg("M142 170 L143 212"), shoe(108, 216, -1), shoe(148, 216, 1)].join(""),
  wide: () =>
    [leg("M113 170 L104 211"), leg("M143 170 L152 211"), shoe(99, 215, -1, -6), shoe(157, 215, 1, 6)].join(""),
  sit: () =>
    [
      `<ellipse cx="128" cy="190" rx="34" ry="14" fill="${C.navy}"/>`,
      leg("M110 168 Q72 200 132 204"),
      leg("M146 168 Q184 200 124 198"),
      shoe(136, 205, 1, -8),
      shoe(120, 199, -1, 8),
    ].join(""),
  jump: () =>
    [leg("M113 170 Q84 186 102 202"), leg("M143 170 Q172 186 154 202"), shoe(108, 205, 1, -20), shoe(148, 205, -1, 20)].join(""),
  kick: () =>
    [leg("M114 170 Q108 192 112 212"), leg("M143 168 Q170 168 194 150"), shoe(107, 216, -1), shoe(200, 146, 1, -32)].join(""),
  chair: () =>
    [
      leg("M112 168 Q150 178 196 156"),
      leg("M144 166 Q176 164 210 146"),
      shoe(200, 146, 1, -18),
      shoe(215, 136, 1, -24),
    ].join(""),
};

/* ---------------------------------------------------------------- compose */

/**
 * Compose Deb.
 * @param {object} o
 * @param {keyof legs} o.legs
 * @param {object} o.head      see head()
 * @param {number} o.tilt      head tilt in degrees
 * @param {number} o.lean      upper-body rotation around the hips
 * @param {object} o.armL, o.armR  {ctrl, to, hand, angle, behind}
 * @param {string} o.back      props behind everything
 * @param {string} o.mid       props behind the arms but in front of the body
 * @param {string} o.front     props in front of everything
 */
export function deb(o) {
  const tilt = o.tilt ?? 0;
  const lean = o.lean ?? 0;
  const headT = `rotate(${tilt} 128 100)`;
  const armL = o.armL ?? { ctrl: [86, 142], to: [89, 163], hand: "fist", angle: 175 };
  const armR = o.armR ?? { ctrl: [170, 142], to: [167, 163], hand: "fist", angle: 185 };
  const behindArms = [armL.behind ? arm(SHOULDER_L, armL) : "", armR.behind ? arm(SHOULDER_R, armR) : ""].join("");
  const frontArms = [!armL.behind ? arm(SHOULDER_L, armL) : "", !armR.behind ? arm(SHOULDER_R, armR) : ""].join("");
  const upper = [
    o.cape ?? "",
    `<g transform="${headT}">${backHair()}</g>`,
    behindArms,
    neck(),
    torso(),
    headphones(),
    `<g transform="${headT}">${head(o.head)}</g>`,
    o.mid ?? "",
    frontArms,
  ].join("");
  return [
    o.back ?? "",
    `<g id="deb">`,
    o.under ?? "",
    legs[o.legs ?? "stand"](),
    `<g transform="rotate(${lean} 128 172)">${upper}</g>`,
    `</g>`,
    o.front ?? "",
  ].join("");
}
