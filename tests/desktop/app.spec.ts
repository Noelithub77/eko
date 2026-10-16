import { expect, test } from "@playwright/test";

test("desktop app shows stream controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Restart stream" })).toBeVisible();
  await expect(page.getByText("Pair a phone")).toBeVisible();
});
