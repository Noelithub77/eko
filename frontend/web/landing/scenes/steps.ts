// Start, scan, approve, listen: the whole flow in four drawings.
import { gsap } from "gsap";
import { laptop, note, person, phone, qr, wifi } from "../icons.ts";
import { drawOn, ink, type Point, Sketch } from "../sketch.ts";
import { type Build, travel } from "./motion.ts";

export const build: Build = (svg, narrow) => {
  const s = new Sketch(svg, narrow ? 420 : 1200, narrow ? 1220 : 400, 23);
  const centers: readonly Point[] = narrow ? [0, 1, 2, 3].map((i) => [210, 160 + i * 300]) : [0, 1, 2, 3].map((i) => [150 + i * 300, 200]);
  const story = gsap.timeline({ paused: true });
  const loop = gsap.timeline({ paused: true });
  const notes: SVGGElement[] = [];

  const cell = (index: number, title: string, color: string, draw: (x: number, y: number) => void) =>
    s.group(null, () => {
      const [x, y] = centers[index];
      s.circle(x, y - 138, 34, { stroke: color, fill: ink.bg });
      s.text(x, y - 130, String(index + 1), { size: 20, color });
      draw(x, y);
      s.text(x, y + 126, title, { size: 24 });
    });

  const cells = [
    cell(0, "start eko", ink.coral, (x, y) => {
      laptop(s, x, y - 10, 150, { stroke: ink.coral });
      qr(s, x, y - 10, 58, ink.coral);
      wifi(s, x + 92, y - 78, 30, ink.coral);
    }),
    cell(1, "scan the QR", ink.teal, (x, y) => {
      phone(s, x, y, 140, { stroke: ink.teal });
      qr(s, x, y - 4, 44);
      for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const cx = x + dx * 30;
        const cy = y - 4 + dy * 30;
        s.polyline([[cx, cy - dy * 10], [cx, cy], [cx - dx * 10, cy]], { stroke: ink.teal, width: 2.4, rough: 0.4 });
      }
    }),
    cell(2, "approve it", ink.coral, (x, y) => {
      laptop(s, x, y - 10, 150, { stroke: ink.coral });
      s.text(x, y - 34, "Pixel 8 wants in", { size: 15 });
      s.rect(x - 52, y - 20, 50, 24, { stroke: ink.teal, fill: ink.tealFill }, 7);
      s.text(x - 27, y - 3, "allow", { size: 14, color: ink.teal });
      s.rect(x + 4, y - 20, 50, 24, { stroke: ink.soft }, 7);
      s.text(x + 29, y - 3, "deny", { size: 14, color: ink.soft });
      s.polygon([[x - 22, y - 4], [x - 22, y + 22], [x - 15, y + 15], [x - 9, y + 26], [x - 5, y + 24], [x - 11, y + 13], [x - 2, y + 13]], { fill: ink.line, stroke: ink.bg, width: 1.5, rough: 0.3 });
    }),
    cell(3, "listen", ink.teal, (x, y) => {
      person(s, x, y - 26, 34, "smile", ink.teal);
      phone(s, x + 58, y + 46, 46, { stroke: ink.teal });
      notes.push(note(s, x - 74, y - 42, 24, ink.coral), note(s, x + 70, y - 70, 20, ink.teal), note(s, x - 58, y + 34, 18, ink.teal));
    }),
  ];

  const links = centers.slice(1).map((to, i) => {
    const from = centers[i];
    const color = i % 2 ? ink.coral : ink.teal;
    const points: Point[] = narrow ? [[from[0] + 120, from[1] + 70], [to[0] + 150, (from[1] + to[1]) / 2], [to[0] + 120, to[1] - 100]] : [[from[0] + 92, from[1] - 50], [(from[0] + to[0]) / 2, from[1] - 72], [to[0] - 92, to[1] - 50]];
    return s.arrow(points, { stroke: color, dash: true, width: 1.6 });
  });

  cells.forEach((group, i) => {
    story.addLabel(`step${i}`, i ? ">-0.1" : 0);
    drawOn(story, group, `step${i}`, 0.9);
    const link = links[i];
    if (link) {
      drawOn(story, link.group, ">-0.2", 0.5);
      travel(story, s, link.guide, i % 2 ? ink.coral : ink.teal, ">-0.2", 0.6);
    }
  });
  story.to({}, { duration: 0.3 });

  notes.forEach((group, i) => {
    loop.to(group, { y: -10 - i * 3, rotation: i % 2 ? 8 : -8, transformOrigin: "50% 100%", duration: 1.4 + i * 0.3, ease: "sine.inOut", repeat: -1, yoyo: true }, i * 0.2);
  });
  return { story, loop };
};
