# Design tokens

One source for every value, and no hardcoded colours in components.

| What | Where | Used as |
|---|---|---|
| Colours (dark) | `frontend/src/styles/themes/_dark.scss` (`$theme-dark` map) | `var(--color-*)` |
| Colours (light) | `frontend/src/styles/themes/_light.scss` (`$theme-light` map) | `var(--color-*)` |
| Spacing, type scale, fonts, radii, motion, z-index | `frontend/src/styles/tokens.css` | `var(--space-4)`, `var(--text-lg)`… |
| Breakpoints | `frontend/src/styles/abstracts/_variables.scss` | Sass `$breakpoint-md` (media queries cannot use CSS variables) |

`themes/_runtime.scss` turns each map into CSS custom properties: dark on `:root` and `[data-theme="dark"]`, light on `[data-theme="light"]`. The theme toggle only changes the `data-theme` attribute, so every component updates at once. `public/theme-init.js` applies the saved or system theme before the first paint.

Sass variables in `_variables.scss` such as `$color-primary` are aliases for `var(--color-primary)`; they never hold their own hex values, so Sass and CSS cannot drift apart. TypeScript values are not imported into Sass.

The Monaco editor theme is generated at runtime from the same CSS variables (`components/editor/monacoSetup.ts`).

The only fixed colours outside the theme maps are in `public/logo.svg` and `favicon.svg`: an image loaded with `<img>` cannot read CSS variables. They match the dark theme's surface, primary and accent values.

## Palette

| Token | Dark | Light | Use |
|---|---|---|---|
| `background` | `#0e1626` | `#f4f6fa` | page |
| `surface` | `#142035` | `#ffffff` | panels |
| `text` | `#e8edf6` | `#13213a` | body text |
| `muted` | `#94a2bd` | `#55627c` | secondary text |
| `primary` | `#ffd43b` | `#ffd43b` | main actions (dark text on top) |
| `accent` | `#7fb2e5` | `#2a64a8` | links, focus, judging |
| `success` / `danger` / `warning` | green / red / amber | darker variants | verdicts |

Type: **Fredoka** (`--font-display`, headings), **Inter** (`--font-body`, interface), **JetBrains Mono** (`--font-code`, code; ligatures off so `->` looks as typed) and **Comic Neue** (`--font-mascot`, the mascot's speech bubbles only, never body text). All four are under the SIL Open Font License and self-hosted through `@fontsource` packages, so no request goes to a font CDN. The production build preloads the latin subsets of Inter and Fredoka (`preloadFonts` in `vite.config.ts`).

## Scrolling and motion

| Rule | Where |
|---|---|
| Lenis smooth scrolling on marketing pages only (`handle: { marketing: true }` in `router.tsx`: home, about) | `features/scroll/SmoothScroll.tsx` |
| Scroll to top on route change, but not for back/forward or `#anchor` links | `features/scroll/ScrollReset.tsx` |
| Reveal on scroll with IntersectionObserver; content always in the DOM | `features/scroll/Reveal.tsx`, `styles/components/_reveal.scss` |
| Parallax on hero decorations only, at most 3 per page (`MAX_PARALLAX_PER_PAGE`) | `features/scroll/Parallax.tsx` |
| Inner scrollers carry `data-lenis-prevent` and `overscroll-behavior: contain`: editor, output console, problem statement, results, player lists, modal | the components and their SCSS |
| `100dvh` (via `--viewport-height`, falling back to `100vh`), `scrollbar-gutter: stable both-edges` on `html` | `tokens.css`, `base/_reset.scss` |
| Workspaces (Playground, question page, competition room) get no scroll animations | `MainLayout.tsx` decides from the route handle |
| `prefers-reduced-motion: reduce` turns off Lenis, reveals and parallax, and sets every duration token to 0 | `hooks/useReducedMotion.ts`, `tokens.css` |

### Manual check (after changing layout or scrolling)

1. Home page, mouse wheel over the hero: the page scrolls smoothly; the two background glows drift slightly.
2. Home page, wheel over the code sample: the page scrolls (the sample is short); once it has its own scrollbar, the sample scrolls instead.
3. Playground: wheel over the editor scrolls the code; wheel over Output scrolls the output; the page itself never scrolls and never bounces.
4. Question page and competition room: the problem statement, results and player list scroll on their own; the editor keeps its position.
5. Phone width (or browser toolbar showing/hiding on a phone): the workspace fills the visible height exactly; nothing hides under the toolbar.
6. Turn on "reduce motion" in the operating system: no smooth scrolling, no parallax, sections appear without animation.
7. Navigate from a scrolled home page to About: the new page starts at the top. Press Back: the old position returns.

Steps 1, 3 (partly) and 6 are automated in `frontend/e2e/scroll.spec.ts`.
