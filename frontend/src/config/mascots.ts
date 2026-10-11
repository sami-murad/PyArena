/**
 * Mascots: one entry per character. The UI uses `activeMascotId`.
 *
 * Copyright note: every mascot here must be ORIGINAL art that this project
 * owns. "Deb", a junior developer in a cream hoodie, was drawn for PyArena from
 * basic shapes (scripts/deb/, built by scripts/build-stickers.mjs) and is not
 * based on any existing character, studio mascot or logo.
 *
 * The roadmap asked for an "mrIncredible" entry. It is intentionally NOT
 * included: Mr. Incredible is a Disney/Pixar character, and drawing him (or a
 * look-alike) would copy someone else's protected character. To add another
 * mascot, draw original art, put it in public/stickers/<id>/ and add an entry
 * with at least two stickers for every mood.
 */
import type { Mood } from "@/features/mascot/moods";

export interface MascotDefinition {
  id: string;
  name: string;
  /** Short description used as the image's accessible name. */
  description: string;
  /** Sticker URLs per mood; at least two each, shown in rotation. */
  stickers: Record<Mood, readonly string[]>;
}

const deb = (...names: string[]) => names.map((n) => `/stickers/deb/${n}.svg`);

export const mascots: Record<string, MascotDefinition> = {
  deb: {
    id: "deb",
    name: "Deb",
    description: "Deb, a junior developer in a cream hoodie",
    stickers: {
      idle: deb("01-coffee-sip", "02-blank-stare", "03-tap-monitor", "26-cozy-mug"),
      thinking: deb("04-gears-turning", "05-drumming-fingers", "06-detective", "07-chin-thinking", "28-aha"),
      happy: deb("08-thumbs-up-wink", "09-fist-pump", "10-proud-point", "27-feet-up"),
      concerned: deb("11-panic", "12-head-tilt", "13-facepalm", "14-cracked-screen"),
      encouraging: deb("15-shoulder-pat", "16-so-close", "17-coach-nod"),
      celebrate: deb("18-arms-up", "19-jump", "20-sunglasses", "21-victory-dance"),
      trophy: deb("22-trophy", "23-podium-cape", "24-bow", "25-crown"),
    },
  },
};

export const activeMascotId = "deb";

export function activeMascot(): MascotDefinition {
  return mascots[activeMascotId];
}
