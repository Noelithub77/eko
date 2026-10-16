import { expect, test } from "@playwright/test";

test("monitor is available only while dev mode is enabled in settings", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Monitor", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const devMode = page.getByRole("switch", { name: "Dev mode" });
  await expect(devMode).not.toBeChecked();
  await devMode.click();
  await expect(devMode).toBeChecked();
  await page.getByRole("button", { name: "Monitor", exact: true }).click();
  await expect(page.getByText("Monitor", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("switch", { name: "Dev mode" }).click();
  await expect(page.getByRole("button", { name: "Monitor", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Main view", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Close settings", exact: true }).click();
  await expect(page.getByText("Scan to listen", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("switch", { name: "Dev mode" }).click();
  await expect(page.getByRole("button", { name: "Monitor", exact: true })).toBeVisible();
  await expect(page.getByText("Test controls", { exact: true })).toHaveCount(0);
});
