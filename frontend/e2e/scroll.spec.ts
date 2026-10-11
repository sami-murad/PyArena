import { expect, test } from "@playwright/test";

test("marketing pages scroll smoothly, workspaces do not, inner scrollers keep the wheel", async ({ page }) => {
  await page.goto("/");
  // Lenis marks <html class="lenis ..."> while it is active.
  await expect(page.locator("html")).toHaveClass(/\blenis\b/);
  await expect(page.locator("[data-parallax='on']")).toHaveCount(2);

  // The wheel scrolls the page on the home page.
  await page.mouse.move(400, 400);
  await page.mouse.wheel(0, 600);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);

  // Reveal sections become visible once scrolled into view.
  await expect(page.locator(".reveal.is-revealed").first()).toBeVisible();

  // Workspaces: no Lenis, no page scroll, inner panels marked to keep the wheel.
  await page.goto("/playground");
  await expect(page.locator("html")).not.toHaveClass(/\blenis\b/);
  await expect(page.locator(".console__body")).toHaveAttribute("data-lenis-prevent");
  await expect(page.locator(".code-editor")).toHaveAttribute("data-lenis-prevent");
  const scrollable = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 1);
  expect(scrollable).toBe(false);
});

test("reduced motion turns smooth scrolling and parallax off", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator(".hero__title")).toBeVisible();
  await expect(page.locator("html")).not.toHaveClass(/\blenis\b/);
  await expect(page.locator("[data-parallax='on']")).toHaveCount(0);
  await expect(page.locator(".reveal").first()).toHaveClass(/is-revealed/);
  await context.close();
});

test("self-hosted fonts load", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const loaded = await page.evaluate(async () => {
    const families = ['600 16px "Inter Variable"', '700 32px "Fredoka Variable"', '16px "JetBrains Mono Variable"'];
    await Promise.all(families.map((f) => document.fonts.load(f)));
    return families.map((f) => document.fonts.check(f));
  });
  expect(loaded).toEqual([true, true, true]);
  const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(bodyFont).toContain("Inter Variable");
  // No request leaves for a third-party font host.
  const external = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .map((e) => e.name)
      .filter((u) => /fonts\.(googleapis|gstatic)\.com/.test(u)),
  );
  expect(external).toEqual([]);
});
