// Why eko exists: out loud bothers everyone, Bluetooth reaches one person, eko reaches everyone.
import { gsap } from "gsap";
import { bluetooth, laptop, type Mood, person, phone, waves, wifi } from "../icons.ts";
import { drawOn, ink, type Point, Sketch } from "../sketch.ts";
import { type Build, stream, travel } from "./motion.ts";

const seats: readonly Point[] = [[-132, 62], [-46, 84], [46, 84], [132, 62]];

export const build: Build = (svg, narrow) => {
  const s = new Sketch(svg, narrow ? 420 : 1200, narrow ? 1110 : 380, 11);
  const centers: readonly Point[] = narrow ? [[210, 185], [210, 555], [210, 925]] : [[200, 190], [600, 190], [1000, 190]];
  const story = gsap.timeline({ paused: true });
  const loop = gsap.timeline({ paused: true });

  const panel = (index: number, title: string, color: string, caption: string, draw: (x: number, y: number) => void) =>
    s.group("panel", () => {
      const [x, y] = centers[index];
      s.text(x, y - 140, title, { size: 28, color });
      draw(x, y);
      s.text(x, y + 168, caption, { size: 21, color });
    });

  const crowd = (x: number, y: number, moods: readonly Mood[], phones: readonly (string | undefined)[]) =>
    seats.map(([dx, dy], i) => person(s, x + dx, y + dy, 19, moods[i], phones[i]));

  // 1. Out loud
  const loud = panel(0, "out loud", ink.red, "everyone hears it", (x, y) => {
    laptop(s, x, y - 40, 104);
    waves(s, x - 58, y - 40, 22, 3, Math.PI, ink.red, 0.6);
    waves(s, x + 58, y - 40, 22, 3, 0, ink.red, 0.6);
    crowd(x, y, ["sleep", "frown", "frown", "sleep"], []);
  });

  // 2. Bluetooth reaches one pair of headphones.
  const blue: SVGPathElement[] = [];
  const bt = panel(1, "bluetooth", ink.blue, "one pair of headphones", (x, y) => {
    laptop(s, x, y - 40, 104);
    bluetooth(s, x, y - 112, 26, ink.blue);
    blue.push(s.arrow([[x + 50, y - 12], [x + 112, y + 8], [x + 128, y + 30]], { stroke: ink.blue, dash: true }).guide);
    crowd(x, y, ["plain", "plain", "plain", "smile"], [undefined, undefined, undefined, ink.blue]);
    s.text(x - 132, y + 26, "?", { size: 24, color: ink.soft });
    s.text(x - 46, y + 48, "?", { size: 24, color: ink.soft });
    s.text(x + 46, y + 48, "?", { size: 24, color: ink.soft });
  });

  // 3. eko reaches every phone in the room.
  const guides: SVGPathElement[] = [];
  const eko = panel(2, "eko", ink.teal, "everyone, on their own headphones", (x, y) => {
    laptop(s, x, y - 40, 104, { stroke: ink.coral });
    wifi(s, x, y - 100, 36, ink.coral);
    for (const [dx, dy] of seats) {
      const tip: Point = [x + dx * 0.92 + (dx > 0 ? 24 : -24) * 0.2, y + dy - 30];
      guides.push(s.arrow([[x + dx * 0.3, y - 2], tip], { stroke: ink.teal, width: 1.6 }).guide);
    }
    crowd(x, y, ["smile", "smile", "smile", "smile"], [ink.teal, ink.teal, ink.teal, ink.teal]);
    for (const [dx, dy] of seats) phone(s, x + dx + 27, y + dy + 34, 30, { stroke: ink.teal });
  });

  story.addLabel("step0", 0);
  drawOn(story, loud, "step0", 1);
  story.fromTo(loud.querySelectorAll(".waves"), { scale: 0.85, transformOrigin: "50% 50%" }, { scale: 1.08, duration: 0.3, repeat: 3, yoyo: true, ease: "sine.inOut" }, "step0+=0.7");
  story.addLabel("step1", ">+=0.3");
  story.to(loud, { opacity: 0.35, duration: 0.4 }, "step1");
  drawOn(story, bt, "step1", 1);
  travel(story, s, blue[0], ink.blue, "step1+=0.9", 0.7);
  story.addLabel("step2", ">+=0.3");
  story.to(bt, { opacity: 0.35, duration: 0.4 }, "step2");
  drawOn(story, eko, "step2", 1);
  guides.forEach((guide, i) => {
    travel(story, s, guide, ink.coral, `step2+=${0.9 + i * 0.08}`, 0.7);
  });
  story.to({}, { duration: 0.4 });

  for (const guide of guides) stream(loop, s, guide, ink.coral, 2, 1.6, 5);
  return { story, loop };
};
