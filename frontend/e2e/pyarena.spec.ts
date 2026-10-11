import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test, type Browser, type Page } from "@playwright/test";

/** Reference solutions live with the seed data; tests use them to play a real, winning round. */
const seeds = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../database/seeds/questions.json", import.meta.url)), "utf-8"),
) as Array<{ title: string; reference_solution: string }>;

const shots = process.env.E2E_SCREENSHOTS;
async function snap(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
}

async function newUser(browser: Browser, name: string, theme: "dark" | "light" = "dark") {
  const context = await browser.newContext({ colorScheme: theme, permissions: ["clipboard-read", "clipboard-write"] });
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

/** Replaces the Monaco editor content through the clipboard (typing would trigger auto-indent). */
async function setEditorCode(page: Page, code: string) {
  const editor = page.locator(".monaco-editor").first();
  await editor.click();
  await page.evaluate((text) => navigator.clipboard.writeText(text), code);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
}

test("playground runs real Python with input and explains errors", async ({ page }) => {
  await page.goto("/playground");
  await expect(page.locator(".monaco-editor")).toBeVisible();
  await page.getByLabel("Input").fill("Ada");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.locator(".console__stdout")).toContainText("Hello, Ada!");
  await snap(page, "playground-ok");

  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await setEditorCode(page, "numbers = [1, 2, 3]\nprint(numbers[3])\n");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText("A list position does not exist")).toBeVisible();
  await expect(page.locator(".console__stderr")).toContainText("IndexError");
  await snap(page, "playground-error");
});

test("two players race and the server picks one winner", async ({ browser }) => {
  const host = await newUser(browser, "host");
  const guest = await newUser(browser, "guest", "light");

  await host.page.goto("/competitions");
  await snap(host.page, "competitions");
  await host.page.getByRole("radio", { name: "Easy" }).click();
  await host.page.getByRole("button", { name: "Open room" }).click();
  await expect(host.page.getByRole("heading", { name: "Lobby" })).toBeVisible();
  const code = (await host.page.locator(".invite__code").innerText()).replace(/\s/g, "");
  expect(code).toMatch(/^[2-9A-HJ-NP-Z]{8}$/);

  await guest.page.goto("/competitions");
  await guest.page.getByLabel("Room code").fill(code);
  await guest.page.getByRole("button", { name: "Join room" }).click();
  await expect(guest.page.getByRole("heading", { name: "Lobby" })).toBeVisible();

  // Both lobbies show both players in real time.
  await expect(host.page.locator(".roster__name", { hasText: guest.username })).toBeVisible();
  await expect(host.page.getByRole("button", { name: "Start competition" })).toBeDisabled();
  await guest.page.getByRole("button", { name: "I'm ready" }).click();
  await expect(host.page.getByRole("button", { name: "Start competition" })).toBeEnabled();
  await snap(host.page, "lobby");

  await host.page.getByRole("button", { name: "Start competition" }).click();
  await expect(guest.page.getByRole("timer", { name: /Starting in/ })).toBeVisible();
  await snap(guest.page, "countdown");

  const title = guest.page.locator(".arena .problem__title").first();
  await expect(title).toBeVisible({ timeout: 20_000 });
  const questionTitle = await title.innerText();
  await expect(host.page.locator(".arena .problem__title").first()).toHaveText(questionTitle);
  const reference = seeds.find((q) => q.title === questionTitle)?.reference_solution;
  expect(reference).toBeTruthy();
  await expect(guest.page.locator(".monaco-editor")).toBeVisible();

  // A wrong answer first: it must not win.
  await setEditorCode(guest.page, "def nothing():\n    return None\n");
  await guest.page.getByRole("button", { name: "Submit" }).click();
  // Judging runs every test in the sandbox; allow for slow CI machines.
  await expect(guest.page.locator(".verdict")).toContainText(/Wrong answer|Runtime error/, { timeout: 30_000 });
  await snap(guest.page, "arena-wrong");

  await guest.page.waitForTimeout(1200); // submission cooldown
  await setEditorCode(guest.page, reference!);
  await guest.page.getByRole("button", { name: "Submit" }).click();

  await expect(guest.page.locator(".podium__eyebrow")).toHaveText("You won", { timeout: 30_000 });
  // Py celebrates for the winner (the badge is the visual twin of the win sound).
  await expect(guest.page.getByTestId("mascot-badge")).toHaveText("You won!");
  await expect(host.page.locator(".podium__name")).toHaveText(guest.username);
  await expect(host.page.locator(".table__row--win")).toContainText(guest.username);
  await snap(guest.page, "results-winner");
  await snap(host.page, "results-host");
});
