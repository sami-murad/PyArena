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

Type: Bricolage Grotesque (headings), Instrument Sans (interface), JetBrains Mono (code, ligatures off so `->` looks as typed). Fonts are self-hosted through `@fontsource-variable` packages.
