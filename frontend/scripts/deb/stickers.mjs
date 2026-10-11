/**
 * The 28 Deb stickers. Each entry poses the shared character from parts.mjs.
 * `mood` is the PyArena mascot mood the sticker is shown for.
 */
import { C, deb } from "./parts.mjs";
import {
  braceCape,
  chair,
  codeLine,
  confetti,
  crown,
  desk,
  firework,
  gear,
  keyboard,
  lightbulb,
  loadingDots,
  magnifier,
  monitor,
  motion,
  mug,
  podium,
  qmark,
  screen,
  scribbleCloud,
  sideTable,
  sparkle,
  spinArc,
  spotlight,
  squiggles,
  star,
  steam,
  sunglasses,
  sweat,
  tear,
  thoughtBubble,
  trophy,
} from "./props.mjs";

const hipL = { ctrl: [76, 132], to: [89, 158], hand: "fist", angle: 230 };
const hipR = { ctrl: [180, 132], to: [167, 158], hand: "fist", angle: 130 };
const chinL = { ctrl: [98, 152], to: [118, 101], hand: "fist", angle: 12 };

const mag = magnifier(50, 72, 22, 45);

export const STICKERS = [
  /* ------------------------------------------------------------ IDLE */
  {
    id: "01-coffee-sip",
    mood: "idle",
    title: "Sipping coffee, cozy and bored",
    svg: deb({
      legs: "sit",
      head: { eyes: ["half", "half"], mouth: "oSmall", brows: ["relaxed", "relaxed"] },
      mid: mug(128, 106, 1.05),
      armL: { ctrl: [88, 150], to: [111, 112], hand: "hold", angle: 60 },
      armR: { ctrl: [168, 150], to: [145, 112], hand: "hold", angle: -60 },
    }),
  },
  {
    id: "02-blank-stare",
    mood: "idle",
    title: "Staring blankly at a loading screen",
    svg: deb({
      back: screen(14, 66, 60, 44, "blank", -6),
      head: { eyes: ["dot", "blink"], mouth: "flat", brows: ["none", "none"], look: [-2, 0] },
      front: loadingDots(128, 6),
    }),
  },
  {
    id: "03-tap-monitor",
    mood: "idle",
    title: "Is this thing on?",
    svg: deb({
      back: sideTable(180, 152, 52) + monitor(178, 94, 56, 40),
      tilt: 5,
      head: { eyes: ["open", "open"], mouth: "flat", brows: ["relaxed", "up"], look: [2.5, 0] },
      armL: hipL,
      armR: { ctrl: [178, 136], to: [184, 112], hand: "point", angle: 80 },
    }),
  },

  /* -------------------------------------------------------- THINKING */
  {
    id: "04-gears-turning",
    mood: "thinking",
    title: "Gears turning, tongue out",
    svg: deb({
      legs: "none",
      head: { eyes: ["wide", "wide"], mouth: "tongue", brows: ["determined", "determined"], look: [0, 1.5] },
      mid: desk(166) + keyboard(128, 157),
      armL: { ctrl: [92, 150], to: [111, 158], hand: "fist", angle: 170 },
      armR: { ctrl: [164, 150], to: [145, 158], hand: "fist", angle: 190 },
      front: gear(102, 12, 12, 8, 10) + gear(128, -6, 9, 7, 0) + gear(155, 10, 14, 9, 5) + spinArc(102, 12, 18) + spinArc(155, 10, 20),
    }),
  },
  {
    id: "05-drumming-fingers",
    mood: "thinking",
    title: "Drumming fingers, eyes on the screen",
    svg: deb({
      legs: "none",
      back: screen(176, 30, 60, 42, "code", 6),
      head: { eyes: ["open", "open"], mouth: "flat", brows: ["determined", "determined"], look: [2.6, -2] },
      mid: desk(166),
      armL: { ctrl: [90, 150], to: [104, 166], hand: "flat", angle: 175 },
      armR: { ctrl: [166, 150], to: [154, 166], hand: "open", angle: 185 },
      front: sweat(165, 52, 0.75, 10) + motion(166, 180, 8, 0, 3, 5),
    }),
  },
  {
    id: "06-detective",
    mood: "thinking",
    title: "Detective with a magnifying glass",
    svg: deb({
      back: codeLine(6, 64, 84),
      lean: -5,
      tilt: -8,
      head: { eyes: ["wide", "narrow"], mouth: "smirk", brows: ["up", "determined"], look: [-2.5, 0] },
      mid: mag.lens + mag.rim,
      armL: { ctrl: [84, 136], to: [mag.handle[0], mag.handle[1]], hand: "hold", angle: -50 },
      armR: { ctrl: [152, 146], to: [134, 101], hand: "fist", angle: -20 },
    }),
  },
  {
    id: "07-chin-thinking",
    mood: "thinking",
    title: "Chin in hand, a question in mind",
    svg: deb({
      tilt: -6,
      head: { eyes: ["narrow", "narrow"], mouth: "flat", brows: ["determined", "relaxed"], look: [2, -2] },
      armR: { ctrl: [140, 154], to: [110, 147], hand: "hold", angle: -100 },
      armL: chinL,
      front: thoughtBubble(190, 30, qmark(190, 32, 0.75)),
    }),
  },

  /* ----------------------------------------------------------- HAPPY */
  {
    id: "08-thumbs-up-wink",
    mood: "happy",
    title: "Thumbs up and a wink",
    svg: deb({
      head: { eyes: ["open", "closedHappy"], mouth: "grin", brows: ["relaxed", "up"] },
      armR: { ctrl: [186, 128], to: [180, 98], hand: "thumbsUp", angle: 0 },
      front: sparkle(76, 44, 8) + sparkle(64, 74, 5) + sparkle(190, 52, 6),
    }),
  },
  {
    id: "09-fist-pump",
    mood: "happy",
    title: "A quiet fist pump",
    svg: deb({
      head: { eyes: ["closedCalm", "closedCalm"], mouth: "pressed", brows: ["relaxed", "relaxed"] },
      armR: { ctrl: [188, 150], to: [170, 104], hand: "fist", angle: -8 },
      front: sparkle(194, 82, 6) + sparkle(184, 60, 4.5) + motion(186, 102, 9, -30, 2, 6),
    }),
  },
  {
    id: "10-proud-point",
    mood: "happy",
    title: "Proudly pointing at working code",
    svg: deb({
      back: screen(4, 34, 64, 48, "check", -6),
      tilt: -4,
      head: { eyes: ["open", "open"], mouth: "grin", brows: ["up", "up"], look: [-2.5, -0.5] },
      armL: { ctrl: [80, 126], to: [72, 104], hand: "point", angle: -70 },
      armR: { ctrl: [132, 144], to: [94, 120], hand: "point", angle: -76 },
      front: star(90, 18, 7) + star(164, 14, 6) + star(184, 44, 5),
    }),
  },

  /* ------------------------------------------------------- CONCERNED */
  {
    id: "11-panic",
    mood: "concerned",
    title: "Panic!",
    svg: deb({
      legs: "wide",
      head: { eyes: ["wide", "wide"], mouth: "o", brows: ["worried", "worried"], blush: false },
      armL: { ctrl: [88, 132], to: [101, 88], hand: "open", angle: -12 },
      armR: { ctrl: [168, 132], to: [155, 88], hand: "open", angle: 12 },
      front: sweat(148, 44, 1.35, 12) + squiggles(128, 70),
    }),
  },
  {
    id: "12-head-tilt",
    mood: "concerned",
    title: "Head tilt at a red error",
    svg: deb({
      back: screen(182, 62, 58, 46, "error", 4),
      tilt: 14,
      head: { eyes: ["open", "open"], mouth: "oSmall", brows: ["relaxed", "up"], look: [2.6, 0] },
      armL: { ctrl: [76, 120], to: [84, 66], hand: "open", angle: -10 },
      front: qmark(116, 2, 1.25),
    }),
  },
  {
    id: "13-facepalm",
    mood: "concerned",
    title: "Facepalm",
    svg: deb({
      legs: "none",
      head: { eyes: ["closedCalm", "closedCalm"], mouth: "wavy", brows: ["worried", "worried"] },
      mid: desk(166) + keyboard(140, 157, 64),
      armL: { ctrl: [96, 152], to: [119, 76], hand: "flat", angle: 18 },
      armR: { ctrl: [164, 150], to: [148, 158], hand: "fist", angle: 190 },
      front: scribbleCloud(184, 26),
    }),
  },
  {
    id: "14-cracked-screen",
    mood: "concerned",
    title: "Heartbroken at a cracked screen",
    svg: deb({
      back: screen(4, 50, 66, 50, "crack", -5),
      lean: -3,
      tilt: -6,
      head: { eyes: ["teary", "teary"], mouth: "wavy", brows: ["worried", "worried"], look: [-1.5, 0] },
      armL: { ctrl: [80, 128], to: [74, 112], hand: "open", angle: -72 },
      armR: { ctrl: [168, 152], to: [137, 136], hand: "flat", angle: -70 },
      front: tear(151, 89, 0.55),
    }),
  },

  /* ----------------------------------------------------- ENCOURAGING */
  {
    id: "15-shoulder-pat",
    mood: "encouraging",
    title: "A pat on her own shoulder",
    svg: deb({
      head: { eyes: ["open", "open"], mouth: "smile", brows: ["relaxed", "up"] },
      armR: { ctrl: [146, 152], to: [107, 116], hand: "flat", angle: -40 },
      front: sparkle(80, 60, 6) + motion(84, 104, 7, -20, 2, 5),
    }),
  },
  {
    id: "16-so-close",
    mood: "encouraging",
    title: "So close!",
    svg: deb({
      lean: 3,
      tilt: -6,
      head: { eyes: ["open", "open"], mouth: "smile", brows: ["hopeful", "hopeful"], look: [2, -1] },
      armR: { ctrl: [188, 124], to: [175, 88], hand: "pinch", angle: -12 },
      front: sparkle(200, 70, 4.5),
    }),
  },
  {
    id: "17-coach-nod",
    mood: "encouraging",
    title: "Arms crossed, approving nod",
    svg: deb({
      tilt: 8,
      head: { eyes: ["half", "half"], mouth: "smirk", brows: ["relaxed", "up"] },
      armL: { ctrl: [100, 148], to: [146, 136], hand: "hold", angle: 80 },
      armR: { ctrl: [156, 152], to: [111, 140], hand: "hold", angle: -80 },
      front: `<path d="M176 40 q8 6 4 16 M184 34 q12 10 6 26" stroke="${C.navy}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
    }),
  },

  /* ----------------------------------------------------- CELEBRATION */
  {
    id: "18-arms-up",
    mood: "celebrate",
    title: "Arms up in pure joy",
    svg: deb({
      legs: "wide",
      back: confetti(18, [14, -6, 242, 150], 34),
      head: { eyes: ["closedHappy", "closedHappy"], mouth: "bigOpen", brows: ["up", "up"] },
      armL: { ctrl: [80, 92], to: [72, 48], hand: "open", angle: -25 },
      armR: { ctrl: [176, 92], to: [184, 48], hand: "open", angle: 25 },
    }),
  },
  {
    id: "19-jump",
    mood: "celebrate",
    title: "Jumping for joy",
    svg: deb({
      legs: "jump",
      back: confetti(19, [20, 100, 236, 230], 30),
      head: { eyes: ["open", "open"], mouth: "bigOpen", brows: ["up", "up"], look: [0, -1.5] },
      armL: { ctrl: [76, 108], to: [52, 92], hand: "open", angle: -68 },
      armR: { ctrl: [180, 108], to: [204, 92], hand: "open", angle: 68 },
      front: motion(112, 224, 32, 0, 2, 7),
    }),
  },
  {
    id: "20-sunglasses",
    mood: "celebrate",
    title: "Sunglasses drop, cool victory",
    svg: deb({
      legs: "wide",
      back: firework(46, 36, 22, C.coral) + firework(212, 30, 18, C.mint) + firework(206, 104, 13, C.yellow),
      head: { eyes: ["closedCalm", "closedCalm"], mouth: "smirk", brows: ["relaxed", "relaxed"], extra: sunglasses(73, -3) + motion(116, 48, 0, 0, 1) },
      armL: hipL,
      armR: { ctrl: [186, 126], to: [180, 92], hand: "peace", angle: 10 },
      front: `<path d="M114 34 v-10 M128 30 v-12 M142 34 v-10" stroke="${C.navy}" stroke-width="2.6" stroke-linecap="round"/>`,
    }),
  },
  {
    id: "21-victory-dance",
    mood: "celebrate",
    title: "Goofy victory dance",
    svg: deb({
      legs: "kick",
      lean: 6,
      tilt: -8,
      head: { eyes: ["closedHappy", "open"], mouth: "grin", brows: ["up", "up"] },
      armL: { ctrl: [76, 110], to: [52, 96], hand: "open", angle: -62 },
      armR: { ctrl: [180, 132], to: [172, 86], hand: "fist", angle: 10 },
      front: motion(208, 128, 10, -30, 3, 6) + sparkle(40, 70, 6) + sparkle(64, 40, 4.5),
    }),
  },

  /* ---------------------------------------------------------- TROPHY */
  {
    id: "22-trophy",
    mood: "trophy",
    title: "Holding the trophy high",
    svg: deb({
      legs: "wide",
      back: spotlight(128, 72, 84),
      head: { eyes: ["closedHappy", "closedHappy"], mouth: "grin", brows: ["up", "up"] },
      mid: trophy(128, -44, 1),
      armL: { behind: true, ctrl: [80, 64], to: [108, 22], hand: "hold", angle: 30 },
      armR: { behind: true, ctrl: [176, 64], to: [148, 22], hand: "hold", angle: -30 },
      front: tear(150, 88, 0.55),
    }),
  },
  {
    id: "23-podium-cape",
    mood: "trophy",
    title: "On the podium in a curly-brace cape",
    svg: deb({
      under: braceCape(),
      back: podium(128, 220, 108, 32),
      head: { eyes: ["closedCalm", "closedCalm"], mouth: "smirk", brows: ["relaxed", "relaxed"], look: [0, -2] },
      armL: hipL,
      armR: hipR,
      front: sparkle(58, 60, 6) + sparkle(200, 52, 7) + sparkle(206, 96, 4.5),
    }),
  },
  {
    id: "24-bow",
    mood: "trophy",
    title: "A theatrical bow",
    svg: deb({
      back: firework(40, 36, 22, C.mint) + firework(216, 40, 20, C.coral) + firework(206, 112, 13, C.yellow),
      lean: -13,
      tilt: -16,
      head: { eyes: ["closedCalm", "closedCalm"], mouth: "smile", brows: ["relaxed", "relaxed"] },
      armR: { ctrl: [150, 150], to: [126, 133], hand: "flat", angle: -82 },
      armL: { ctrl: [70, 132], to: [44, 146], hand: "open", angle: -112 },
    }),
  },
  {
    id: "25-crown",
    mood: "trophy",
    title: "A crown drops onto her head",
    svg: deb({
      head: { eyes: ["wide", "wide"], mouth: "openSmile", brows: ["up", "up"], look: [0, -2] },
      armL: { ctrl: [80, 92], to: [72, 50], hand: "open", angle: -25 },
      armR: { ctrl: [176, 92], to: [184, 50], hand: "open", angle: 25 },
      front: crown(128, 14, 1) + `<path d="M112 -12 v-9 M128 -16 v-10 M144 -12 v-9" stroke="${C.navy}" stroke-width="2.6" stroke-linecap="round"/>` + sparkle(90, 6, 5) + sparkle(168, 2, 6),
    }),
  },

  /* ----------------------------------------------------------- BONUS */
  {
    id: "26-cozy-mug",
    mood: "idle",
    title: "Hugging a warm mug",
    svg: deb({
      legs: "sit",
      head: { eyes: ["closedCalm", "closedCalm"], mouth: "smile", brows: ["relaxed", "relaxed"] },
      mid: mug(128, 142, 1.05) + steam(128, 124, 0.8),
      armL: { ctrl: [90, 156], to: [112, 142], hand: "hold", angle: 70 },
      armR: { ctrl: [166, 156], to: [144, 142], hand: "hold", angle: -70 },
    }),
  },
  {
    id: "27-feet-up",
    mood: "happy",
    title: "Feet up, hands behind head",
    svg: deb({
      legs: "chair",
      back: chair(126) + sideTable(186, 150, 50),
      lean: -8,
      head: { eyes: ["closedCalm", "closedCalm"], mouth: "pressed", brows: ["relaxed", "relaxed"] },
      armL: { behind: true, ctrl: [64, 86], to: [104, 54], hand: "hold", angle: 60 },
      armR: { behind: true, ctrl: [192, 86], to: [152, 54], hand: "hold", angle: -60 },
    }),
  },
  {
    id: "28-aha",
    mood: "thinking",
    title: "Aha! A lightbulb moment",
    svg: deb({
      head: { eyes: ["open", "open"], mouth: "openSmile", brows: ["up", "up"], look: [0, -2] },
      armL: chinL,
      armR: { ctrl: [188, 108], to: [180, 52], hand: "point", angle: 8 },
      front: lightbulb(128, -4, 1),
    }),
  },
];
