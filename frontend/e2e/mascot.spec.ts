import { expect, test, type Page } from "@playwright/test";

async function setEditorCode(page: Page, code: string) {
  await page.locator(".monaco-editor").first().click();
  await page.evaluate((text) => navigator.clipboard.writeText(text), code);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
}

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("Deb reacts to runs with a mood, a line and a badge", async ({ page }) => {
  await page.goto("/playground");
  const mascot = page.getByTestId("mascot");
  await expect(mascot).toHaveAttribute("data-mood", "idle");

  await setEditorCode(page, "print('hi')\n");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(mascot).toHaveAttribute("data-mood", "happy");
  await expect(page.getByTestId("mascot-badge")).toHaveText("Ran OK");
  await expect(page.getByTestId("mascot-bubble")).toBeVisible();
  await expect(mascot.getByRole("img")).toHaveAttribute("src", /\/stickers\/deb\/(08-thumbs-up-wink|09-fist-pump|10-proud-point|27-feet-up)\.svg$/);

  // Wait for Deb to settle, then a syntax error.
  await expect(mascot).toHaveAttribute("data-mood", "idle", { timeout: 6000 });
  await setEditorCode(page, "print('hi'\n");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(mascot).toHaveAttribute("data-mood", "concerned");
  await expect(page.getByTestId("mascot-badge")).toHaveText("Syntax error");
});

test("sound mute and mascot visibility are remembered", async ({ page }) => {
  await page.goto("/");
  const sound = page.getByTestId("sound-toggle");
  await expect(sound).toHaveAttribute("aria-pressed", "true");
  await sound.click();
  await expect(sound).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Hide Deb, the mascot" }).click();
  await expect(page.getByTestId("mascot")).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId("sound-toggle")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("mascot")).toHaveCount(0);
  await page.getByRole("button", { name: "Show Deb, the mascot" }).click();
  await expect(page.getByTestId("mascot")).toBeVisible();
});

test("no AudioContext is created before the first user gesture", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __audioContexts: number; AudioContext: typeof AudioContext };
    w.__audioContexts = 0;
    const Original = w.AudioContext;
    w.AudioContext = class extends Original {
      constructor(options?: AudioContextOptions) {
        super(options);
        w.__audioContexts += 1;
      }
    };
  });
  await page.goto("/playground");
  await expect(page.locator(".monaco-editor")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __audioContexts: number }).__audioContexts)).toBe(0);
  await page.getByRole("button", { name: "Run" }).click();
  expect(await page.evaluate(() => (window as unknown as { __audioContexts: number }).__audioContexts)).toBe(1);
});

test("reduced motion: Deb still reacts, without animation or confetti", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce", permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage();
  await page.goto("/playground");
  await setEditorCode(page, "print('calm')\n");
  await page.getByRole("button", { name: "Run" }).click();
  const mascot = page.getByTestId("mascot");
  await expect(mascot).toHaveAttribute("data-mood", "happy");
  await expect(mascot).toHaveClass(/mascot--still/);
  const animation = await mascot.locator(".mascot__sticker").evaluate((el) => getComputedStyle(el).animationName);
  expect(animation).toBe("none");
  await context.close();
});
