/**
 * Public social profiles. Leave `url` empty until you have a real, verified
 * account; empty links are not rendered anywhere.
 */
export interface SocialLink {
  label: string;
  url: string;
}

export const socialLinks: SocialLink[] = [
  { label: "GitHub", url: "" }, // e.g. https://github.com/<your-username>/pyarena
  { label: "LinkedIn", url: "" }, // e.g. https://www.linkedin.com/in/<your-profile>
];

export const visibleSocialLinks = socialLinks.filter((link) => link.url.trim() !== "");
