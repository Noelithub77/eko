import { expect, test } from "@playwright/test";

test("desktop app shows stream controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /start/i })).toBeVisible();
  await expect(page.getByText("QR Pairing")).toBeVisible();
});
