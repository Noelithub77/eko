// Finding a phone is not letting it in: every device waits for the host's decision.
import { gsap } from "gsap";
import { box, phone } from "../icons.ts";
import { drawOn, ink, type Point, Sketch } from "../sketch.ts";
import type { Build } from "./motion.ts";

type State = "pending" | "connecting" | "connected" | "denied";

export const build: Build = (svg, narrow) => {
  const s = new Sketch(svg, narrow ? 420 : 1100, narrow ? 700 : 430, 67);
  const story = gsap.timeline({ paused: true });
  const loop = gsap.timeline({ paused: true });
  const at = (wide: Point, tall: Point): Point => (narrow ? tall : wide);
  const spots: Record<State, Point> = {
    pending: at([400, 215], [210, 250]),
    connecting: at([680, 105], [110, 440]),
    connected: at([940, 105], [110, 610]),
    denied: at([680, 330], [310, 440]),
  };
  const size = { w: narrow ? 150 : 170, h: 64 };
  const colors: Record<State, string> = { pending: ink.coral, connecting: ink.line, connected: ink.teal, denied: ink.red };
  const fills: Record<State, string> = { pending: ink.coralFill, connecting: ink.greyFill, connected: ink.tealFill, denied: ink.redFill };

  const names: readonly State[] = ["pending", "connecting", "connected", "denied"];

  // Lit backgrounds sit under the outlines and show the current state.
  const shade = (state: State) => {
    const [x, y] = spots[state];
    const rect = s.rect(x - size.w / 2, y - size.h / 2, size.w, size.h, { stroke: "none", fill: fills[state] });
    gsap.set(rect, { opacity: 0 });
    return rect;
  };
  const lit: Record<State, SVGGElement> = { pending: shade("pending"), connecting: shade("connecting"), connected: shade("connected"), denied: shade("denied") };

  const entries = s.group(null, () => {
    const ways: [Point, string][] = narrow ? [[[110, 60], "scan QR"], [[310, 60], "nearby list"]] : [[[120, 120], "scan QR"], [[120, 310], "nearby list"]];
    for (const [[x, y], label] of ways) {
      box(s, x, y, 150, 56, label, { stroke: ink.soft }, 19);
      const from: Point = narrow ? [x, y + 30] : [x + 78, y];
      const to: Point = narrow ? [210 + (x - 210) * 0.3, spots.pending[1] - 36] : [spots.pending[0] - 90, spots.pending[1] + (y - spots.pending[1]) * 0.25];
      s.arrow([from, to], { stroke: ink.soft, width: 1.4 });
    }
    const [x, y] = narrow ? [210, 135] : [120, 215];
    s.text(x, y, "only identifies it", { size: 17, color: ink.soft });
  });

  const states = s.group(null, () => {
    for (const state of names) {
      const [x, y] = spots[state];
      box(s, x, y, size.w, size.h, state, { stroke: colors[state] }, 22);
    }
  });

  const route = (from: State, to: State, label: string, color: string, bend: Point, nudge: number) => {
    const a = spots[from];
    const b = spots[to];
    const start: Point = narrow ? [a[0] + (b[0] - a[0]) * 0.32, a[1] + 34] : [a[0] + size.w / 2 + 4, a[1] + (b[1] - a[1]) * 0.18];
    const end: Point = narrow ? [b[0], b[1] - 36] : [b[0] - size.w / 2 - 6, b[1]];
    const arrow = s.arrow([start, bend, end], { stroke: color, width: 1.8 });
    s.into(arrow.group, () => s.text(bend[0] + (narrow ? nudge : -34), bend[1] + (narrow ? -14 : nudge * 0.4), label, { size: 19, color }));
    return arrow;
  };
  const allow = route("pending", "connecting", "allow", ink.teal, at([560, 120], [140, 330]), -42);
  const deny = route("pending", "denied", "deny", ink.red, at([560, 315], [290, 330]), 42);
  const settle = s.arrow(narrow ? [[110, 474], [110, 576]] : [[768, 105], [852, 105]], { stroke: ink.teal, width: 1.8 });

  const token = s.group("token", () => phone(s, 0, 0, 40, { stroke: ink.line, fill: ink.bg }));
  const place = (point: Point) => gsap.set(token, { x: point[0], y: point[1] - size.h / 2 - 30 });
  place(spots.pending);

  story.addLabel("step0", 0);
  drawOn(story, entries, "step0", 0.9);
  drawOn(story, states, "step0+=0.5", 0.9);
  drawOn(story, [allow.group, deny.group, settle.group], ">-0.3", 0.7);
  drawOn(story, token, ">", 0.4);
  story.to(lit.pending, { opacity: 1, duration: 0.3 }, "<");
  story.to({}, { duration: 0.3 });
  loop.to(token, { rotation: 6, transformOrigin: "50% 100%", duration: 0.5, ease: "sine.inOut", repeat: -1, yoyo: true });

  let busy = false;
  const ride = (timeline: gsap.core.Timeline, guide: SVGPathElement, duration: number) => {
    const length = guide.getTotalLength();
    const state = { p: 0 };
    timeline.to(state, {
      p: 1,
      duration,
      ease: "power1.inOut",
      onUpdate: () => {
        const point = guide.getPointAtLength(length * state.p);
        gsap.set(token, { x: point.x, y: point.y - 30 });
      },
    });
  };

  const act = (value: string) => {
    if (busy) return;
    busy = true;
    loop.pause();
    gsap.set(token, { rotation: 0 });
    const run = gsap.timeline({
      onComplete: () => {
        busy = false;
        loop.play();
      },
    });
    run.to(lit.pending, { opacity: 0, duration: 0.3 });
    if (value === "allow") {
      ride(run, allow.guide, 0.7);
      run.to(lit.connecting, { opacity: 1, duration: 0.25 });
      ride(run, settle.guide, 0.6);
      run.to(lit.connecting, { opacity: 0, duration: 0.25 }, "<");
      run.to(lit.connected, { opacity: 1, duration: 0.3 });
      run.to(token, { scale: 1.15, duration: 0.2, yoyo: true, repeat: 1 });
      run.to(lit.connected, { opacity: 0, duration: 0.4 }, "+=1.6");
    } else {
      ride(run, deny.guide, 0.7);
      run.to(lit.denied, { opacity: 1, duration: 0.25 });
      run.to(token, { x: "+=8", duration: 0.06, yoyo: true, repeat: 5 });
      run.to(lit.denied, { opacity: 0, duration: 0.4 }, "+=1.6");
    }
    run.to(token, { opacity: 0, duration: 0.3 }, "<");
    run.add(() => place(spots.pending));
    run.to(token, { opacity: 1, duration: 0.3 });
    run.to(lit.pending, { opacity: 1, duration: 0.3 }, "<");
  };
  return { story, loop, act };
};
