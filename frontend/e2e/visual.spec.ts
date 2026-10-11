import { expect, test, type Page } from "@playwright/test";

/**
 * Visual regression: pixel comparisons of key pages in both themes.
 *
 * Baselines live in e2e/visual.spec.ts-snapshots/ and are specific to the
 * browser build and OS fonts that rendered them (the file names end in
 * "-linux"). After an intentional UI change, or when CI renders differently
 * from your machine, refresh them with `npm run test:visual:update` and
 * review the new images in the pull request.
 */
const PAGES = [
  { name: "home", path: "/", ready: "h1" },
  { name: "playground", path: "/playground", ready: ".monaco-editor .view-lines" },
  { name: "questions", path: "/questions", ready: ".question-row" },
  { name: "login", path: "/login", ready: "h1" },
];

async function settle(page: Page, ready: string) {
  await expect(page.locator(ready).first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400); // Monaco paints its last decorations after layout
}

for (const scheme of ["dark", "light"] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme, contextOptions: { reducedMotion: "reduce" }, viewport: { width: 1280, height: 800 } });
    for (const { name, path, ready } of PAGES) {
      test(`${name} looks the same`, async ({ page }) => {
        await page.goto(path);
        await settle(page, ready);
        await expect(page).toHaveScreenshot(`${name}-${scheme}.png`, {
          animations: "disabled",
          caret: "hide",
          // The mascot's idle sticker rotates and the editor cursor blinks.
          mask: [page.getByTestId("mascot"), page.locator(".monaco-editor .cursors-layer")],
          maxDiffPixelRatio: 0.01,
        });
      });
    }
  });
}
