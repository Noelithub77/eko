// The name: a ring sends out a sound, turns around, and becomes its own echo.
import { gsap } from "gsap";
import { drawOn, ink, Sketch } from "../sketch.ts";
import type { Build } from "./motion.ts";

const NS = "http://www.w3.org/2000/svg";
// The notes canvas overhangs the 512 mark by 96 units on every side.
const pad = 96;

export const build: Build = (svg) => {
  const figure = svg.closest("[data-name]");
  const story = gsap.timeline({ paused: true });
  if (!figure) return { story };
  const echo = figure.querySelector(".mark .echo");
  const rings = figure.querySelector(".name-rings");
  const eko = figure.querySelector("[data-spelling='eko']");
  const echoWord = figure.querySelector("[data-spelling='echo']");

  const s = new Sketch(svg, 512 + pad * 2, 512 + pad * 2, 41);
  const at = (x: number, y: number): [number, number] => [x + pad, y + pad];
  const sound = s.group(null, () => {
    s.text(...at(-26, 262), "a sound", { size: 30, color: ink.coral });
    s.arrow([at(-12, 232), at(30, 212), at(76, 206)], { stroke: ink.coral });
  });
  const back = s.group(null, () => {
    s.text(...at(524, 400), "its echo", { size: 30, color: ink.teal });
    s.arrow([at(518, 370), at(476, 346), at(434, 338)], { stroke: ink.teal });
  });
  const turn = s.group(null, () => {
    const c = at(256, 256);
    const r = 300;
    const a = (-150 * Math.PI) / 180;
    const b = (-60 * Math.PI) / 180;
    s.arrow([[c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)], [c[0] + r * Math.cos((a + b) / 2), c[1] + r * Math.sin((a + b) / 2)], [c[0] + r * Math.cos(b), c[1] + r * Math.sin(b)]], { stroke: ink.soft, dash: true });
    s.text(c[0] - 150, c[1] - 296, "turned around", { size: 26, color: ink.soft, anchor: "end" });
  });

  const ripples = [ink.coral, ink.coral, ink.teal, ink.teal].map((color) => {
    const circle = document.createElementNS(NS, "circle");
    circle.setAttribute("cx", "256");
    circle.setAttribute("cy", "256");
    circle.setAttribute("r", "160");
    circle.setAttribute("stroke", color);
    circle.setAttribute("opacity", "0");
    rings?.append(circle);
    return circle;
  });
  const ripple = (circle: SVGCircleElement, at: gsap.Position) =>
    story.fromTo(circle, { scale: 0.9, opacity: 0.7, transformOrigin: "50% 50%" }, { scale: 1.65, opacity: 0, duration: 0.9, ease: "power1.out" }, at);

  story.set(echo, { "--turn": "0deg", color: ink.coral }, 0);
  story.set(echoWord, { opacity: 0 }, 0);
  ripple(ripples[0], 0);
  ripple(ripples[1], 0.25);
  drawOn(story, sound, 0.2, 0.6);
  story.to(echo, { "--turn": "180deg", color: ink.teal, duration: 1.2, ease: "power2.inOut" }, 0.6);
  drawOn(story, turn, 0.6, 0.9);
  ripple(ripples[2], 1.5);
  ripple(ripples[3], 1.75);
  story.to(eko, { rotationX: 90, opacity: 0, yPercent: -30, duration: 0.4, ease: "power2.in" }, 1.1);
  story.fromTo(echoWord, { rotationX: -90, opacity: 0, yPercent: 30 }, { rotationX: 0, opacity: 1, yPercent: 0, duration: 0.5, ease: "power2.out" }, 1.45);
  drawOn(story, back, 1.6, 0.6);
  story.to({}, { duration: 0.3 });
  return { story };
};
