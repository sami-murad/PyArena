import { expect, test, type Browser, type Page } from "@playwright/test";

const shots = process.env.E2E_SCREENSHOTS;
async function snap(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
}

async function newUser(browser: Browser, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const username = `${name}_${Date.now().toString(36)}`.slice(0, 24);
  await page.goto("/register");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Email").fill(`${username}@pyarena.dev`);
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: new RegExp(username) })).toBeVisible();
  return { page, username };
}

/** Simulates the tab being hidden or shown (headless browsers never really switch tabs). */
async function setTabVisible(page: Page, visible: boolean) {
  await page.evaluate((v) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (v ? "visible" : "hidden") });
    document.dispatchEvent(new Event("visibilitychange"));
  }, visible);
}

test("Focus Mode: notice first, short switches are free, long ones warn, opponents see it", async ({ browser }) => {
  const host = await newUser(browser, "fhost");
  const guest = await newUser(browser, "fguest");

  await host.page.goto("/competitions");
  await host.page.getByRole("radio", { name: "Easy" }).click();
  await host.page.getByLabel("Focus Mode").check();
  await host.page.getByRole("button", { name: "Open room" }).click();
  await expect(host.page.getByRole("heading", { name: "Lobby" })).toBeVisible();

  // The host reads the notice before anything else.
  const hostNotice = host.page.getByTestId("focus-disclosure");
  await expect(hostNotice).toContainText("What counts");
  await expect(hostNotice).toContainText("Number 7 disqualifies you");
  await snap(host.page, "focus-notice");
  await host.page.getByRole("button", { name: "I understand" }).click();
  await expect(host.page.getByText("You accepted the notice.")).toBeVisible();

  const code = (await host.page.locator(".invite__code").innerText()).replace(/\s/g, "");
  await guest.page.goto("/competitions");
  await guest.page.getByLabel("Room code").fill(code);
  await guest.page.getByRole("button", { name: "Join room" }).click();
  await expect(guest.page.getByTestId("focus-disclosure")).toBeVisible();
  // Closing the notice is allowed, but "ready" brings it back.
  await guest.page.getByRole("button", { name: "Not now" }).click();
  await expect(host.page.getByText("Reading notice")).toBeVisible();
  await guest.page.getByRole("button", { name: "I'm ready" }).click();
  await guest.page.getByRole("button", { name: "I understand" }).click();
  await guest.page.getByRole("button", { name: "I'm ready" }).click();

  await expect(host.page.getByRole("button", { name: "Start competition" })).toBeEnabled();
  await host.page.getByRole("button", { name: "Start competition" }).click();
  await expect(guest.page.locator(".arena .problem__title").first()).toBeVisible({ timeout: 20_000 });
  await expect(guest.page.getByTestId("focus-banner")).toContainText("Focus Mode is on");

  // A blip under 2 seconds does not count, and the opponent never sees it.
  await setTabVisible(guest.page, false);
  await guest.page.waitForTimeout(400);
  await setTabVisible(guest.page, true);
  await guest.page.waitForTimeout(800);
  await expect(guest.page.getByTestId("focus-banner")).toContainText("switches under 2 seconds don't count");
  await expect(host.page.getByTestId("lane-away")).toHaveCount(0);

  // A real absence: the opponent sees "left tab", then the guest gets a warning.
  await setTabVisible(guest.page, false);
  await expect(host.page.getByTestId("lane-away")).toBeVisible({ timeout: 6000 });
  await snap(host.page, "focus-opponent-away");
  await guest.page.waitForTimeout(500);
  await setTabVisible(guest.page, true);
  await expect(guest.page.getByTestId("mascot-badge")).toHaveText("Focus warning 1/3");
  await expect(guest.page.getByTestId("focus-banner")).toContainText("1 counted. Next tab switch means a warning.");
  await snap(guest.page, "focus-warned");
  await expect(host.page.getByTestId("lane-away")).toHaveCount(0);
  await expect(host.page.locator(".feed__item", { hasText: "left the tab (Focus Mode: warn)" })).toBeVisible();
});
