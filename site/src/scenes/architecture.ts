// The whole system: a React face on a Rust core, two kinds of listener, and Cloudflare on standby.
import { gsap } from "gsap";
import { box, cloud } from "../icons.ts";
import { drawOn, ink, type Point, Sketch } from "../sketch.ts";
import { type Build, stream, travel } from "./motion.ts";

type Frame = { cx: number; cy: number; w: number; h: number };

export const build: Build = (svg, narrow) => {
  const s = new Sketch(svg, narrow ? 420 : 1150, narrow ? 830 : 620, 97);
  const story = gsap.timeline({ paused: true });
  const loop = gsap.timeline({ paused: true });
  const frame = (wide: Frame, tall: Frame) => (narrow ? tall : wide);
  const desktop = frame({ cx: 265, cy: 295, w: 410, h: 350 }, { cx: 210, cy: 185, w: 370, h: 320 });
  const ui = frame({ cx: 265, cy: 210, w: 330, h: 64 }, { cx: 210, cy: 115, w: 310, h: 56 });
  const core = frame({ cx: 265, cy: 365, w: 330, h: 140 }, { cx: 210, cy: 250, w: 310, h: 128 });
  const android = frame({ cx: 905, cy: 195, w: 360, h: 130 }, { cx: 108, cy: 565, w: 184, h: 140 });
  const browser = frame({ cx: 905, cy: 410, w: 360, h: 130 }, { cx: 312, cy: 565, w: 184, h: 140 });
  const sky: Point = narrow ? [210, 765] : [905, 568];

  const host = s.group(null, () => {
    s.rect(desktop.cx - desktop.w / 2, desktop.cy - desktop.h / 2, desktop.w, desktop.h, { stroke: ink.soft }, 22);
    s.text(desktop.cx, desktop.cy - desktop.h / 2 - 16, "desktop app · Tauri", { size: 22, color: ink.soft });
    box(s, ui.cx, ui.cy, ui.w, ui.h, "React: buttons, QR, devices", { stroke: ink.blue }, narrow ? 17 : 19);
    s.rect(core.cx - core.w / 2, core.cy - core.h / 2, core.w, core.h, { stroke: ink.amber, fill: ink.amberFill });
    s.text(core.cx, core.cy - core.h / 2 + 34, "Rust core", { size: 24, color: ink.amber });
    s.text(core.cx, core.cy + 6, "capture · Opus · WebRTC", { size: narrow ? 17 : 19 });
    s.text(core.cx, core.cy + 36, "approval · sessions · signaling", { size: narrow ? 17 : 19 });
    s.arrow([[ui.cx, ui.cy + ui.h / 2 + 4], [core.cx, core.cy - core.h / 2 - 4]], { stroke: ink.soft, width: 1.4 }, "both");
  });

  const listener = (f: Frame, title: string, line: string, color: string) =>
    s.group(null, () => {
      s.rect(f.cx - f.w / 2, f.cy - f.h / 2, f.w, f.h, { stroke: color, fill: ink.bg });
      s.text(f.cx, f.cy - 12, title, { size: 22, color });
      s.text(f.cx, f.cy + 22, line, { size: narrow ? 15 : 18, color: ink.soft });
    });
  const phones = listener(android, "Android app", narrow ? "Rust → Oboe" : "native Rust → Oboe", ink.cyan);
  const web = listener(browser, narrow ? "browser" : "browser · iPhone", narrow ? "Safari WebRTC" : "Safari WebRTC from the QR", ink.blue);

  const send = (to: Frame, lean: number) => {
    const start: Point = narrow ? [core.cx + lean * 0.4, core.cy + core.h / 2 + 4] : [core.cx + core.w / 2 + 4, core.cy + lean * 0.25];
    const end: Point = narrow ? [to.cx, to.cy - to.h / 2 - 6] : [to.cx - to.w / 2 - 6, to.cy];
    const bend: Point = [(start[0] + end[0]) / 2 + (narrow ? lean * 0.2 : 0), (start[1] + end[1]) / 2 + (narrow ? 0 : lean * 0.3)];
    return s.arrow([start, bend, end], { stroke: ink.cyan, width: 2 });
  };
  const toAndroid = send(android, narrow ? -100 : -80);
  const toBrowser = send(browser, narrow ? 100 : 80);
  const label = s.text(narrow ? 210 : 590, narrow ? 445 : 330, "signaling + audio", { size: 18, color: ink.cyan });

  const standby = s.group(null, () => {
    cloud(s, sky[0], sky[1], narrow ? 180 : 190, { stroke: ink.soft });
    s.text(sky[0], sky[1] + 6, "Cloudflare", { size: 20, color: ink.soft });
    const from: Point = narrow ? [sky[0] + 60, sky[1] - 36] : [sky[0], sky[1] - 42];
    const to: Point = [browser.cx, browser.cy + browser.h / 2 + 6];
    s.arrow([from, to], { stroke: ink.soft, dash: true, width: 1.4 });
    s.text(narrow ? 95 : 700, narrow ? 700 : 574, "only when needed", { size: 17, color: ink.soft });
  });

  story.addLabel("step0", 0);
  drawOn(story, host, "step0", 1.1);
  story.addLabel("step1", ">-0.2");
  drawOn(story, [toAndroid.group, toBrowser.group, label], "step1", 0.7);
  drawOn(story, [phones, web], ">-0.3", 0.7);
  travel(story, s, toAndroid.guide, ink.amber, "<", 0.7);
  travel(story, s, toBrowser.guide, ink.amber, "<", 0.7);
  story.addLabel("step2", ">");
  drawOn(story, standby, "step2", 0.8);
  story.to({}, { duration: 0.3 });

  stream(loop, s, toAndroid.guide, ink.amber, 3, 1.8, 5);
  stream(loop, s, toBrowser.guide, ink.amber, 3, 1.8, 5);
  return { story, loop };
};
