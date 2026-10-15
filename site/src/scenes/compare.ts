// Small sketches for the comparison cards, drawn on when each card appears.
import { gsap } from "gsap";
import { bluetooth, cloud, headphones, laptop, phone, speaker, waves } from "../icons.ts";
import { drawOn, ink, Sketch } from "../sketch.ts";

const drawings: Record<string, (s: Sketch) => void> = {
  speaker: (s) => {
    speaker(s, 62, 50, 34, ink.red);
    waves(s, 70, 50, 14, 3, 0, ink.red, 0.7);
  },
  bluetooth: (s) => {
    laptop(s, 46, 48, 52);
    bluetooth(s, 84, 30, 16, ink.blue);
    s.arrow([[78, 52], [118, 52]], { stroke: ink.blue, dash: true, width: 1.4 });
    headphones(s, 132, 54, 12, ink.blue);
  },
  auracast: (s) => {
    laptop(s, 40, 48, 50);
    for (const [y, ok] of [[24, true], [52, false], [80, false]] as const) {
      s.arrow([[72, 48], [110, y]], { stroke: ok ? ink.blue : ink.faint, width: 1.3 });
      s.text(130, y + 6, ok ? "LE" : "?", { size: 16, color: ok ? ink.blue : ink.soft });
    }
  },
  call: (s) => {
    laptop(s, 34, 60, 42);
    cloud(s, 80, 30, 54, { stroke: ink.soft });
    phone(s, 128, 62, 38);
    s.arrow([[52, 46], [62, 36]], { stroke: ink.soft, width: 1.3 });
    s.arrow([[100, 36], [118, 46]], { stroke: ink.soft, width: 1.3 });
  },
  eko: (s) => {
    laptop(s, 34, 52, 46, { stroke: ink.amber });
    for (const y of [20, 52, 84]) {
      s.arrow([[64, 52], [112, y]], { stroke: ink.cyan, width: 1.4 });
      phone(s, 128, y, 26, { stroke: ink.cyan });
    }
  },
};

export function sketchCard(svg: SVGSVGElement, kind: string): gsap.core.Timeline {
  const timeline = gsap.timeline({ paused: true });
  const draw = drawings[kind];
  if (!draw) return timeline;
  const s = new Sketch(svg, 160, 100, kind.length * 13);
  return drawOn(timeline, s.group(null, () => draw(s)), 0, 0.9);
}
