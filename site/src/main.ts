import "./style.css";
import { builds, defaultPlatform, detectDevice, downloadUrl, releaseUrl, type Platform } from "./platform.ts";

const device = detectDevice(navigator.platform, navigator.userAgent, navigator.maxTouchPoints);
const notices = () => import("./toast.tsx");
const isPlatform = (value: string | undefined): value is Platform => value === "windows" || value === "linux" || value === "android";

function setPlatform(card: Element, platform: Platform) {
  for (const tab of card.querySelectorAll<HTMLElement>("[data-platform]")) {
    tab.setAttribute("aria-selected", String(tab.dataset.platform === platform));
  }
  const file = card.querySelector("[data-file]");
  const link = card.querySelector<HTMLAnchorElement>("[data-download]");
  const label = card.querySelector("[data-download-label]");
  if (file) file.textContent = builds[platform].file;
  if (label) label.textContent = builds[platform].label;
  if (link) {
    link.href = downloadUrl(platform);
    link.dataset.for = platform;
  }
}

const cards = [...document.querySelectorAll("[data-getcard]")];
const first = defaultPlatform(device);
for (const card of cards) setPlatform(card, first);
for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-release]")) link.href = releaseUrl;

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const tab = target?.closest<HTMLElement>("[data-platform]");
  if (tab && isPlatform(tab.dataset.platform)) {
    const platform = tab.dataset.platform;
    // Both cards follow one choice so the final card matches the hero.
    for (const card of cards) setPlatform(card, platform);
  }
  const download = target?.closest<HTMLElement>("[data-download]");
  if (download && isPlatform(download.dataset.for)) {
    const platform = download.dataset.for;
    void notices().then((toast) => toast.downloading(platform));
  }
});

// Let the download card paint before requesting the motion libraries.
const idle = (callback: () => void, timeout: number) =>
  "requestIdleCallback" in window ? requestIdleCallback(callback, { timeout }) : setTimeout(callback, 120);
requestAnimationFrame(() => idle(() => void import("./enhance.ts"), 1800));
