// Shared motion for scenes: data dots that ride arrow guides.
import { packet } from "../icons.ts";
import type { Sketch } from "../sketch.ts";

export type Scene = {
  /** Paused. Draws the diagram and walks through it; labels `step0…` mark story beats. */
  story: gsap.core.Timeline;
  /** Paused. Ambient motion once the story has finished. */
  loop?: gsap.core.Timeline;
  /** Responds to the controls under the scene. */
  act?: (value: string) => void;
};

export type Build = (svg: SVGSVGElement, narrow: boolean) => Scene;

function place(dot: SVGCircleElement, guide: SVGPathElement, length: number, progress: number) {
  const point = guide.getPointAtLength(length * progress);
  dot.setAttribute("cx", point.x.toFixed(1));
  dot.setAttribute("cy", point.y.toFixed(1));
  dot.style.opacity = String(Math.min(1, progress * 10, (1 - progress) * 10));
}

/** Endless packets along a guide. They only show while the scene is live. */
export function stream(loop: gsap.core.Timeline, s: Sketch, guide: SVGPathElement, color: string, count = 4, duration = 2.4, r = 6) {
  const length = guide.getTotalLength();
  for (let i = 0; i < count; i += 1) {
    const dot = packet(s, color, r);
    dot.classList.add("ambient");
    const state = { p: i / count };
    loop.to(state, { p: `+=1`, duration, ease: "none", repeat: -1, onUpdate: () => place(dot, guide, length, state.p % 1) }, 0);
  }
}

/** One packet crossing a guide once, as part of a story. */
export function travel(timeline: gsap.core.Timeline, s: Sketch, guide: SVGPathElement, color: string, at: gsap.Position, duration = 0.9, r = 7) {
  const length = guide.getTotalLength();
  const dot = packet(s, color, r);
  const state = { p: 0 };
  timeline.to(state, { p: 1, duration, ease: "power1.inOut", onUpdate: () => place(dot, guide, length, state.p) }, at);
}
