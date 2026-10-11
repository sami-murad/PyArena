/**
 * Single source of truth for the website's identity.
 *
 * Import this wherever the name, tagline, contact address, logo or URL is
 * shown. index.html receives these values through the Vite plugin in
 * vite.config.ts, so nothing here is duplicated.
 *
 * Never put secrets here: everything in this file ships to the browser.
 */
export interface WebsiteInfo {
  readonly name: string;
  readonly shortName: string;
  readonly tagline: string;
  readonly description: string;
  readonly url: string;
  /** Public contact address. Placeholder until a verified address is provided. */
  readonly email: string;
  readonly logo: string;
  readonly favicon: string;
  readonly author: string;
  readonly version: string;
}

// import.meta.env exists in the browser bundle; vite.config.ts (Node) also imports this file.
const env: Record<string, string | undefined> =
  (import.meta as { env?: Record<string, string | undefined> }).env ?? {};

export const websitesInfo: WebsiteInfo = {
  name: "PyArena",
  shortName: "PyArena",
  tagline: "Code. Compete. Improve.",
  description: "An online Python playground and real-time coding competition platform.",
  url: env.VITE_SITE_URL || "http://localhost:5173",
  email: "REPLACE_WITH_VERIFIED_CONTACT_EMAIL",
  logo: "/logo.svg",
  favicon: "/favicon.svg",
  author: "PyArena Team",
  version: "0.1.0",
} as const;

/** True until a real contact address replaces the placeholder above. */
export const hasContactEmail = !websitesInfo.email.startsWith("REPLACE_WITH");

export function pageTitle(page?: string): string {
  return page ? `${page} | ${websitesInfo.name}` : `${websitesInfo.name}: ${websitesInfo.tagline}`;
}
