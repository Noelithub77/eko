// Direct WebRTC on friendly networks; an encrypted TURN relay only when the network blocks it.
import { gsap } from "gsap";
import { cloud, laptop, phone } from "../icons.ts";
import { drawOn, ink, type Point, Sketch } from "../sketch.ts";
import { type Build, stream, travel } from "./motion.ts";

export const build: Build = (svg, narrow) => {
  const s = new Sketch(svg, narrow ? 420 : 1000, narrow ? 540 : 440, 79);
  const story = gsap.timeline({ paused: true });
  const loop = gsap.timeline({ paused: true });
  const at = (wide: Point, tall: Point): Point => (narrow ? tall : wide);
  const desk = at([140, 310], [80, 420]);
  const hand = at([860, 310], [340, 420]);
  const sky = at([500, 100], [210, 110]);
  const mid = (desk[0] + hand[0]) / 2;

  const relayPackets = s.group(null);
  const directPackets = s.group(null);
  const relay = s.arrow([at([210, 262], [110, 368]), [sky[0], sky[1] + 30], at([800, 262], [318, 368])], { stroke: ink.teal, width: 2 });
  const direct = s.arrow([at([225, 318], [128, 420]), [mid, desk[1] + (narrow ? 8 : 12)], at([815, 318], [308, 420])], { stroke: ink.teal, width: 2.4 });

  const ends = s.group(null, () => {
    laptop(s, desk[0], desk[1], narrow ? 96 : 140, { stroke: ink.coral });
    phone(s, hand[0], hand[1], narrow ? 84 : 120);
  });
  const turn = s.group(null, () => {
    cloud(s, sky[0], sky[1], narrow ? 180 : 270);
    s.text(sky[0], sky[1] - 2, narrow ? "TURN" : "Cloudflare TURN", { size: narrow ? 19 : 21, color: ink.soft });
  });
  const directLabel = s.text(mid, desk[1] + (narrow ? 92 : 70), narrow ? "direct" : "direct, on the same network", { size: 20, color: ink.teal });
  const relayLabel = s.text(narrow ? sky[0] : sky[0] + 150, narrow ? 250 : 82, narrow ? "relay" : "encrypted relay", { size: 20, color: ink.teal, anchor: narrow ? "middle" : "start" });

  const wall = s.group(null, () => {
    const w = narrow ? 34 : 46;
    const top = desk[1] - (narrow ? 60 : 90);
    const height = narrow ? 120 : 170;
    s.rect(mid - w / 2, top, w, height, { stroke: ink.red, fill: ink.redFill }, 4);
    for (let y = top + 22; y < top + height; y += 22) s.line([mid - w / 2, y], [mid + w / 2, y], { stroke: ink.red, width: 1.2, rough: 0.6 });
    const x = mid;
    const y = desk[1] + (narrow ? 8 : 12);
    s.line([x - 16, y - 16], [x + 16, y + 16], { stroke: ink.red, width: 3 });
    s.line([x + 16, y - 16], [x - 16, y + 16], { stroke: ink.red, width: 3 });
    s.text(x, top - 14, "blocked", { size: 18, color: ink.red });
  });
  gsap.set([wall, relay.group, relayLabel, relayPackets], { opacity: 0 });
  gsap.set(turn, { opacity: 0.35 });

  story.addLabel("step0", 0);
  drawOn(story, ends, "step0", 0.8);
  drawOn(story, turn, "step0+=0.3", 0.8);
  drawOn(story, [direct.group, directLabel], ">-0.2", 0.8);
  travel(story, s, direct.guide, ink.coral, ">-0.2", 0.9);
  story.to({}, { duration: 0.3 });

  s.into(directPackets, () => stream(loop, s, direct.guide, ink.coral, 5, 2, 6));
  s.into(relayPackets, () => stream(loop, s, relay.guide, ink.coral, 6, 3, 6));

  let current = "direct";
  const act = (value: string) => {
    if (value === current) return;
    current = value;
    const blocked = value === "relay";
    const swap = gsap.timeline({ defaults: { duration: 0.45, ease: "power2.out" } });
    swap.to([direct.group, directLabel], { opacity: blocked ? 0.18 : 1 }, 0);
    swap.to(directPackets, { opacity: blocked ? 0 : 1 }, 0);
    swap.to(turn, { opacity: blocked ? 1 : 0.35 }, 0);
    if (blocked) {
      swap.set(wall, { opacity: 1 }, 0);
      drawOn(swap, wall, 0, 0.5);
      swap.set(relay.group, { opacity: 1 }, 0.2);
      drawOn(swap, [relay.group, relayLabel], 0.2, 0.7);
      swap.to(relayPackets, { opacity: 1 }, 0.7);
    } else {
      swap.to([wall, relay.group, relayLabel, relayPackets], { opacity: 0 }, 0);
    }
  };
  return { story, loop, act };
};
