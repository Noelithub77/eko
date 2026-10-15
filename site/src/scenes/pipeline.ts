// Capture once, encode once, fan the same packets out to every listener.
import { gsap } from "gsap";
import { box, phone, speaker, waves } from "../icons.ts";
import { drawOn, ink, type Point, Sketch } from "../sketch.ts";
import { type Build, stream, travel } from "./motion.ts";

// Chain packets arrive at the track every 0.5 s, exactly when a fan packet leaves.
const chain = { count: 6, duration: 3 };
const fan = { count: 3, duration: 1.5 };

export const build: Build = (svg, narrow) => {
  const s = new Sketch(svg, narrow ? 420 : 1150, narrow ? 860 : 420, 53);
  const story = gsap.timeline({ paused: true });
  const loop = gsap.timeline({ paused: true });
  const along = (wide: Point, tall: Point): Point => (narrow ? tall : wide);
  const source = along([70, 170], [210, 52]);
  const stages = [along([270, 170], [210, 168]), along([465, 170], [210, 284]), along([670, 170], [210, 408])];
  const track = along([860, 170], [210, 535]);

  const chainPackets = s.group(null);
  const flow = s.arrow([source, track], { stroke: ink.faint, width: 1.4 }, "none");
  const parts = s.group(null, () => {
    speaker(s, source[0] - 10, source[1], 40);
    waves(s, source[0] - 4, source[1], 14, 2, 0, ink.amber, 0.7);
    s.text(source[0] + (narrow ? 50 : 0), source[1] + (narrow ? 8 : 56), "system audio", { size: 18, color: ink.soft, anchor: narrow ? "start" : "middle" });
    box(s, stages[0][0], stages[0][1], 150, 76, "WASAPI\nloopback", { fill: ink.bg }, 19);
    box(s, stages[1][0], stages[1][1], 140, 76, "20 ms\nslices", { fill: ink.bg }, 19);
    box(s, stages[2][0], stages[2][1], 170, 86, "Opus encoder\n× 1", { stroke: ink.amber, fill: "#1f1a0c" }, 20);
    s.text(stages[2][0] + (narrow ? 104 : 0), stages[2][1] + (narrow ? -6 : 72), narrow ? "48 kHz\nstereo" : "48 kHz stereo", { size: 17, color: ink.soft, anchor: narrow ? "start" : "middle" });
    s.circle(track[0], track[1], 26, { stroke: ink.cyan, fill: ink.bg });
    s.text(track[0] + (narrow ? 26 : 0), track[1] + (narrow ? 6 : -30), "one shared track", { size: 17, color: ink.cyan, anchor: narrow ? "start" : "middle" });
  });

  let fanGroup = s.group(null);
  const fanPackets = s.group(null);
  const drawFan = (count: number) => {
    const guides: SVGPathElement[] = [];
    fanGroup.remove();
    fanGroup = s.group(null, () => {
      for (let i = 0; i < count; i += 1) {
        const offset = (i - (count - 1) / 2) * (narrow ? 64 : 62);
        const end = along([1080, 170 + offset], [210 + offset, 760]);
        const from = along([track[0] + 16, track[1]], [track[0], track[1] + 16]);
        const bend = along([980, (track[1] + end[1]) / 2 + offset * 0.1], [(track[0] + end[0]) / 2 + offset * 0.1, 660]);
        const tip = along([end[0] - 26, end[1]], [end[0], end[1] - 34]);
        guides.push(s.arrow([from, bend, tip], { stroke: ink.cyan, width: 1.4 }).guide);
        phone(s, end[0] + (narrow ? 0 : 6), end[1] + (narrow ? 10 : 0), 44, { stroke: ink.cyan });
      }
      s.text(narrow ? 210 : 1010, narrow ? 836 : 404, "the same packets, to everyone", { size: 17, color: ink.soft });
    });
    return guides;
  };

  const fill = (guides: readonly SVGPathElement[]) => {
    loop.clear();
    chainPackets.replaceChildren();
    fanPackets.replaceChildren();
    s.into(chainPackets, () => stream(loop, s, flow.guide, ink.amber, chain.count, chain.duration, 6));
    s.into(fanPackets, () => {
      for (const guide of guides) stream(loop, s, guide, ink.cyan, fan.count, fan.duration, 5);
    });
  };

  const guides = drawFan(3);
  story.addLabel("step0", 0);
  drawOn(story, [flow.group, parts], "step0", 1.2);
  story.addLabel("step1", ">");
  drawOn(story, fanGroup, "step1", 0.9);
  travel(story, s, flow.guide, ink.amber, "step1", 1.2);
  for (const guide of guides) travel(story, s, guide, ink.cyan, ">-0.05", 0.5);
  story.to({}, { duration: 0.3 });
  fill(guides);

  const act = (value: string) => {
    const count = Math.min(6, Math.max(1, Number(value) || 1));
    const next = drawFan(count);
    fill(next);
    drawOn(gsap.timeline(), fanGroup, 0, 0.5);
  };
  return { story, loop, act };
};
