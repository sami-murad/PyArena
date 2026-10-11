/**
 * Which pages get smooth scrolling and scroll animations.
 *
 * Marketing pages (marked with `handle: { marketing: true }` in router.tsx) do.
 * Workspaces (Playground, question workspace, competition room) never do: they
 * are full-height layouts whose inner panels scroll on their own, and motion
 * there would get in the way of reading code.
 */
export interface ScrollRouteHandle {
  /** Full-height editor page: no page scroll, no footer, no scroll animations. */
  workspace?: boolean;
  /** Landing-style page: Lenis smooth scrolling, reveal-on-scroll and hero parallax. */
  marketing?: boolean;
}

export function handleOf(match: { handle: unknown }): ScrollRouteHandle {
  const handle = match.handle;
  return handle && typeof handle === "object" ? (handle as ScrollRouteHandle) : {};
}

/** Parallax is limited to this many elements per page (hero only). */
export const MAX_PARALLAX_PER_PAGE = 3;
