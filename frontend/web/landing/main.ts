import "./style.css";
import { celebrate } from "./download-effect.ts";
import { isDownloadShortcut } from "./download-shortcut.ts";
import { builds, defaultPlatform, detectDevice, downloadUrl, releaseUrl, type Platform } from "./platform.ts";

const device = detectDevice(navigator.platform, navigator.userAgent, navigator.maxTouchPoints);
const notices = () => import("./toast.tsx");
const isPlatform = (value: string | undefined): value is Platform => value === "windows" || value === "linux" || value === "macos" || value === "android";

function setPlatform(card: Element, platform: Platform) {
  for (const tab of card.querySelectorAll<HTMLElement>("[data-platform]")) {
    tab.setAttribute("aria-selected", String(tab.dataset.platform === platform));
  }
  const file = card.querySelector("[data-file]");
  const link = card.querySelector<HTMLAnchorElement>("[data-download]");
  const label = card.querySelector("[data-download-label]");
  const copy = card.querySelector<HTMLButtonElement>("[data-copy]");
  const or = card.querySelector<HTMLElement>("[data-or]");
  const { command } = builds[platform];
  if (file) file.textContent = command ?? builds[platform].detail ?? builds[platform].file;
  if (copy) copy.disabled = !command;
  if (or) or.hidden = !command;
  if (label) label.textContent = builds[platform].label;
  if (link) {
    link.href = downloadUrl(platform);
    link.dataset.for = platform;
  }
}

const cards = [...document.querySelectorAll("[data-getcard]")];
const first = defaultPlatform(device);
for (const link of document.querySelectorAll<HTMLElement>("[data-download]")) {
  link.setAttribute("aria-keyshortcuts", "Control+d Meta+d");
  link.title = `${/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+"}D to download`;
}
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
  const copy = target?.closest<HTMLButtonElement>("[data-copy]");
  const command = copy?.textContent;
  if (copy && !copy.disabled && command) {
    void navigator.clipboard.writeText(command).then(() => {
      copy.dataset.copied = "";
      celebrate(copy.querySelector("svg.done") ?? copy);
      setTimeout(() => delete copy.dataset.copied, 1600);
    }, () => {
      // Without clipboard access, select the command so it can be copied by hand.
      const code = copy.querySelector("code");
      if (code) getSelection()?.selectAllChildren(code);
    });
  }
  const download = target?.closest<HTMLAnchorElement>("[data-download]");
  if (download && isPlatform(download.dataset.for)) {
    const platform = download.dataset.for;
    celebrate(download);
    void notices().then((toast) => toast.downloading(platform));
  }
});

document.addEventListener("keydown", (event) => {
  const target = event.target;
  if (!isDownloadShortcut({
    key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey,
    altKey: event.altKey, shiftKey: event.shiftKey, repeat: event.repeat,
    editable: target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select, [role=textbox]") !== null),
  })) return;
  const links = [...document.querySelectorAll<HTMLAnchorElement>("[data-download]")];
  const link = links.reduce<HTMLAnchorElement | undefined>((nearest, candidate) => {
    const distance = (element: HTMLElement) => Math.abs(element.getBoundingClientRect().top - innerHeight / 2);
    return !nearest || distance(candidate) < distance(nearest) ? candidate : nearest;
  }, undefined);
  if (!link) return;
  event.preventDefault();
  link.click();
});

// Let the download card paint before requesting the motion libraries.
const idle = (callback: () => void, timeout: number) =>
  "requestIdleCallback" in window ? requestIdleCallback(callback, { timeout }) : setTimeout(callback, 120);
requestAnimationFrame(() => idle(() => void import("./enhance.ts"), 1800));
