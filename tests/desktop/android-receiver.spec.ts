import { expect, test, type Page } from "@playwright/test";

async function connect(page: Page) {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto(`/@fs/${process.cwd()}/tests/desktop/receiver-fixture.html`);
  await page.getByRole("button", { name: "Find", exact: true }).click();
  await page.getByRole("button", { name: "eko desktop", exact: true }).click();
  await expect(page.getByText("Waiting for desktop approval", { exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("fixture-connect")));
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
}

test("Android connected view has the shared waveform, all quality tiles and native controls", async ({ page }) => {
  await connect(page);
  await expect(page.getByRole("img", { name: "Live audio waveform" })).toBeVisible();
  for (const label of ["Estimated delay", "Jitter", "Buffer", "Packet loss"]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByText(/65\s*ms/)).toBeVisible();
  await expect(page.getByText("0.50", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: /scan|nearby/i })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  const pixels = await page.getByRole("img", { name: "Live audio waveform" }).evaluate((element) => {
    if (!(element instanceof HTMLCanvasElement)) return false;
    const data = element.getContext("2d")?.getImageData(0, 0, element.width, element.height).data;
    return data?.some((value, index) => index % 4 === 3 && value > 0) ?? false;
  });
  expect(pixels).toBe(true);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-calls", /"command":"set_android_playback_paused","payload":\{"paused":true\}/);
  await expect(page.locator("html")).not.toHaveAttribute("data-calls", /"command":"stop_native_receiver"/);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(page.getByRole("button", { name: "Find", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-calls", /stop_native_receiver/);
});

test("name edits use native signaling, notification controls stay synchronized and unknown stats stay unknown", async ({ page }) => {
  await connect(page);
  await page.getByRole("button", { name: "Edit receiver name" }).click();
  await page.getByRole("textbox", { name: "Receiver name" }).fill("My phone");
  await page.getByRole("textbox", { name: "Receiver name" }).press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-calls", /"command":"rename_native_receiver","payload":\{"name":"My phone"\}/);
  await page.evaluate(() => window.dispatchEvent(new Event("fixture-notification-pause")));
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("fixture-notification-play")));
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("fixture-missing-quality")));
  await expect(page.getByText(/^--\s*(ms|%)$/)).toHaveCount(4);
  await page.evaluate(() => window.dispatchEvent(new Event("fixture-control-error")));
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByText("Could not change playback. Try again.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeEnabled();
});
