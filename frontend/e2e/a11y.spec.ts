import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Automated accessibility checks (axe-core, WCAG 2.1 A and AA rules) on the
 * main public pages, in both themes. Automated rules catch roughly a third of
 * real issues; they complement, not replace, keyboard and screen-reader checks.
 */
const PAGES = [
  { path: "/", ready: "h1" },
  { path: "/playground", ready: ".monaco-editor" },
  { path: "/questions", ready: "h1" },
  { path: "/login", ready: "h1" },
  { path: "/register", ready: "h1" },
  { path: "/about", ready: "h1" },
];

async function audit(page: Page) {
  return new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    // Monaco renders its own editor surface (hidden textarea, decorations);
    // its accessibility is Monaco's, configured with accessibilitySupport.
    .exclude(".monaco-editor")
    .analyze();
}

for (const scheme of ["dark", "light"] as const) {
  test.describe(`${scheme} theme`, () => {
    // Reduced motion shows reveal-on-scroll content at full opacity at once, so
    // contrast is measured on the final colours, not mid-fade.
    test.use({ colorScheme: scheme, contextOptions: { reducedMotion: "reduce" } });
    for (const { path, ready } of PAGES) {
      test(`no axe violations on ${path}`, async ({ page }) => {
        await page.goto(path);
        await expect(page.locator(ready).first()).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const result = await audit(page);
        const summary = result.violations.map(
          (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => `${n.target.join(" ")} [${n.any.map((a) => a.message).join("; ")}]`).join(", ")}`,
        );
        expect(summary).toEqual([]);
      });
    }
  });
}
