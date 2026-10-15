// Signaling over a WebSocket, then audio over WebRTC: two separate conversations.
import { gsap } from "gsap";
import { laptop, phone } from "../icons.ts";
import { drawOn, ink, type Point, Sketch } from "../sketch.ts";
import { type Build, stream, travel } from "./motion.ts";

type Message = { text: string; from: "desktop" | "phone" };

const messages: readonly Message[] = [
  { text: "hi, I'm Pixel 8", from: "phone" },
  { text: "approved · offer", from: "desktop" },
  { text: "answer", from: "phone" },
  { text: "reach me here", from: "desktop" },
];

export const build: Build = (svg, narrow) => {
  const s = new Sketch(svg, narrow ? 420 : 1100, narrow ? 780 : 470, 31);
  const story = gsap.timeline({ paused: true });
  const loop = gsap.timeline({ paused: true });
  // Each lane runs from the desktop side to the phone side.
  const desk: Point = narrow ? [210, 92] : [130, 240];
  const hand: Point = narrow ? [210, 690] : [970, 240];
  const signal: [Point, Point] = narrow ? [[110, 210], [110, 590]] : [[250, 130], [880, 130]];
  const media: [Point, Point] = narrow ? [[310, 210], [310, 590]] : [[250, 350], [880, 350]];

  const ends = s.group(null, () => {
    laptop(s, desk[0], desk[1], narrow ? 120 : 150);
    s.text(desk[0], desk[1] + (narrow ? -58 : 92), "desktop", { size: 22, color: ink.soft });
    phone(s, hand[0], hand[1], narrow ? 110 : 150);
    s.text(hand[0] + (narrow ? 70 : 0), hand[1] + (narrow ? 8 : 104), "phone", { size: 22, color: ink.soft, anchor: narrow ? "start" : "middle" });
  });

  const labelAt = (lane: [Point, Point], dy: number): Point => (narrow ? [lane[0][0], lane[0][1] - 44] : [(lane[0][0] + lane[1][0]) / 2, lane[0][1] + dy]);
  const talk = s.group(null, () => {
    s.line(signal[0], signal[1], { stroke: ink.amber, width: 1.6 });
    const [x, y] = labelAt(signal, -48);
    s.text(x, y, "WebSocket", { size: 24, color: ink.amber });
    s.text(x, y + 26, narrow ? "who and how" : "who is joining, and how to reach them", { size: narrow ? 15 : 18, color: ink.soft });
  });
  const wire = s.group(null, () => {
    s.line(media[0], media[1], { stroke: ink.faint, dash: true });
    const [x, y] = labelAt(media, 58);
    s.text(x, y, "WebRTC", { size: 24, color: ink.cyan });
    s.text(x, y + 26, narrow ? "the music" : "the music: Opus, encrypted", { size: narrow ? 15 : 18, color: ink.soft });
  });
  const music = s.arrow(media, { stroke: ink.cyan, width: 2.6 }, "none");

  const bubbles = messages.map((message) => {
    const width = message.text.length * 9.5 + 34;
    const color = message.from === "desktop" ? ink.amber : ink.line;
    const group = s.group("bubble", () => {
      s.rect(-width / 2, -18, width, 36, { stroke: color, fill: ink.bg }, 16);
      s.text(0, 6, message.text, { size: 17, color });
    });
    gsap.set(group, { opacity: 0 });
    return { group, message };
  });

  story.addLabel("step0", 0);
  drawOn(story, ends, "step0", 0.8);
  drawOn(story, talk, "step0+=0.4", 0.8);
  drawOn(story, wire, "step0+=0.6", 0.6);
  story.addLabel("step1", ">");
  bubbles.forEach(({ group, message }, i) => {
    const [start, end] = message.from === "phone" ? [signal[1], signal[0]] : signal;
    const at = `step1+=${i * 0.75}`;
    story.fromTo(group, { x: start[0], y: start[1], opacity: 0 }, { x: end[0], y: end[1], duration: 0.9, ease: "power1.inOut" }, at);
    story.to(group, { opacity: 1, duration: 0.15 }, at);
    story.to(group, { opacity: 0, duration: 0.15 }, `${at}+=0.75`);
  });
  story.addLabel("step2", ">");
  drawOn(story, music.group, "step2", 0.8);
  travel(story, s, music.guide, ink.cyan, "step2+=0.5", 0.8);
  story.to({}, { duration: 0.3 });

  stream(loop, s, music.guide, ink.cyan, 6, 2.2, 6);
  return { story, loop };
};
