import { expect, test } from "@playwright/test";

test("pairing starts with a blurred dummy QR and keeps the spinner until the real QR renders", async ({ page }) => {
  await page.goto(`/@fs/${process.cwd()}/tests/desktop/receiver-fixture.html?mode=qr`);
  await expect(page.getByRole("status", { name: "Preparing secure pairing" })).toBeVisible();
  await expect(page.locator("[aria-hidden=true] canvas")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy link" })).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event("fixture-qr-ready")));
  await expect(page.getByRole("status", { name: "Preparing secure pairing" })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("fixture-qr-rendered")));
  await expect(page.getByRole("status", { name: "Preparing secure pairing" })).toHaveCount(0);
  await expect(page.getByRole("img", { name: "eko pairing QR code" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy link" })).toBeVisible();
});

test("startup failure replaces the spinner with a useful error", async ({ page }) => {
  await page.goto(`/@fs/${process.cwd()}/tests/desktop/receiver-fixture.html?mode=qr`);
  await page.evaluate(() => window.dispatchEvent(new Event("fixture-qr-error")));
  await expect(page.getByRole("alert")).toHaveText("Fixture startup failed");
  await expect(page.getByRole("status")).toHaveCount(0);
});
