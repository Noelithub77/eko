// Motion layer, loaded after first paint: smooth scroll, scene mounting, and the controls under each scene.
import { gsap } from "gsap";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import Lenis from "lenis";
import { build as approval } from "./scenes/approval.ts";
import { build as architecture } from "./scenes/architecture.ts";
import { sketchCard } from "./scenes/compare.ts";
import { build as conversations } from "./scenes/conversations.ts";
import type { Build, Scene } from "./scenes/motion.ts";
import { build as name } from "./scenes/name.ts";
import { build as paths } from "./scenes/paths.ts";
import { build as pipeline } from "./scenes/pipeline.ts";
import { build as problem } from "./scenes/problem.ts";
import { build as steps } from "./scenes/steps.ts";

gsap.registerPlugin(ScrollTrigger, SplitText, DrawSVGPlugin);

const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
const scenes = new Map<string, Scene>();
// Every scene is built before ScrollTrigger measures, so pins and starts see final heights.
const builders: Record<string, Build> = { problem, name, steps, conversations, pipeline, approval, paths, architecture };
// Story scenes follow the scroll; the rest play once they come into view.
const scrubbed = new Set(["problem", "name", "steps"]);

if (!calm) {
  const lenis = new Lenis({ autoRaf: false, anchors: true });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

// Header state and reading progress.
const bar = document.querySelector(".bar");
const progress = document.querySelector(".bar-progress");
ScrollTrigger.create({
  start: 0,
  end: "max",
  onUpdate: (self) => {
    bar?.classList.toggle("is-scrolled", self.scroll() > 8);
    document.body.classList.toggle("is-scrolled-past", self.scroll() > 80);
    if (progress) gsap.set(progress, { scaleX: self.progress });
  },
});

if (!calm) {
  // Only hide what is still below the fold, so nothing visible blinks out.
  const below = gsap.utils.toArray<HTMLElement>("[data-reveal]").filter((element) => element.getBoundingClientRect().top > innerHeight);
  gsap.set(below, { opacity: 0, y: 28 });
  ScrollTrigger.batch(below, { start: "top 88%", once: true, onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, duration: 0.9, ease: "power3.out", stagger: 0.08 }) });
  for (const heading of document.querySelectorAll(".section-head h2, .get h2")) {
    SplitText.create(heading, {
      type: "lines",
      mask: "lines",
      autoSplit: true,
      onSplit: (self) => gsap.from(self.lines, { yPercent: 105, duration: 1, stagger: 0.09, ease: "power4.out", scrollTrigger: { trigger: heading, start: "top 88%", once: true } }),
    });
  }
}

// Hero: the field's rings leave from the mark's dots, so the dots pulse with them.
const canvas = document.querySelector<HTMLCanvasElement>("[data-shader]");
const hero = document.querySelector<HTMLElement>(".hero");
const sourceDot = document.querySelector('[data-dot="src"]');
const echoDot = document.querySelector('[data-dot="echo"]');
if (!calm && canvas && hero && sourceDot && echoDot) {
  void import("./shader.ts").then(({ startField }) =>
    startField(canvas, hero, sourceDot, echoDot, (kind) => {
      gsap.fromTo(kind === "source" ? sourceDot : echoDot, { scale: 1.3, transformOrigin: "50% 50%" }, { scale: 1, duration: 1, ease: "elastic.out(1, 0.45)" });
    }),
  );
}

function sceneSvg(element: Element): SVGSVGElement | null {
  return element instanceof SVGSVGElement ? element : element.querySelector("svg");
}

function markSteps(name: string, story: gsap.core.Timeline) {
  const steps = document.querySelectorAll(`[data-story="${name}"] li`);
  if (!steps.length) return;
  let active = 0;
  for (const [label, time] of Object.entries(story.labels)) {
    if (label.startsWith("step") && story.time() >= time - 0.01) active = Number(label.slice(4));
  }
  steps.forEach((step, i) => {
    step.classList.toggle("is-active", i === active);
  });
}

/** Builds one scene and drives it: scrubbed, pinned, or played on view. */
function mount(element: Element, narrow: boolean, pin: boolean) {
  const key = element.getAttribute("data-scene") ?? "";
  const svg = sceneSvg(element);
  const build = builders[key];
  if (!svg || !build) return;
  const scene = build(svg, narrow);
  scenes.set(key, scene);
  let inView = false;
  let finished = false;

  const sync = () => {
    const live = inView && finished && !calm;
    svg.classList.toggle("is-live", live);
    if (live) scene.loop?.play();
    else scene.loop?.pause();
  };
  const scrub = (value: number) => {
    scene.story.progress(value);
    finished = value > 0.98;
    markSteps(key, scene.story);
    sync();
  };

  ScrollTrigger.create({
    trigger: element,
    start: "top bottom",
    end: "bottom top",
    onToggle: (self) => {
      inView = self.isActive;
      sync();
    },
  });
  if (calm) {
    scene.story.progress(1);
    markSteps(key, scene.story);
    return;
  }
  const section = element.closest("section");
  if (!scrubbed.has(key)) {
    scene.story.eventCallback("onComplete", () => {
      finished = true;
      sync();
    });
    ScrollTrigger.create({ trigger: element, start: "top 72%", once: true, onEnter: () => void scene.story.play() });
  } else if (pin && section) {
    ScrollTrigger.create({ trigger: section.querySelector(".wrap") ?? section, start: "center center", end: "+=160%", pin: true, onUpdate: (self) => scrub(self.progress) });
  } else {
    ScrollTrigger.create({ trigger: element, start: "top 85%", end: key === "name" ? "center 35%" : "bottom 60%", onUpdate: (self) => scrub(self.progress) });
  }
}

const media = gsap.matchMedia();
media.add({ narrow: "(max-width: 960px)", tall: "(min-height: 760px)" }, (context) => {
  const narrow = context.conditions?.narrow ?? false;
  const tall = context.conditions?.tall ?? false;
  scenes.clear();
  for (const element of document.querySelectorAll("[data-scene]")) {
    mount(element, narrow, !narrow && tall && Boolean(element.closest("[data-pin-section]")));
  }
});

// Comparison cards draw their sketch when they appear.
for (const svg of document.querySelectorAll<SVGSVGElement>("svg[data-sketch]")) {
  const timeline = sketchCard(svg, svg.dataset.sketch ?? "");
  if (calm) timeline.progress(1);
  else ScrollTrigger.create({ trigger: svg, start: "top 90%", once: true, onEnter: () => void timeline.play() });
}

// The final mark replays the echo: one ring turns around and becomes the other.
const finalEcho = document.querySelector("[data-mark-final] .echo");
const finalSource = document.querySelector("[data-mark-final] .src");
if (!calm && finalEcho && finalSource) {
  const turn = gsap.timeline({ paused: true });
  turn.from(finalSource, { scale: 0.9, opacity: 0, transformOrigin: "50% 50%", duration: 0.7, ease: "power3.out" });
  turn.fromTo(finalEcho, { "--turn": "0deg", color: "#ff6b5b", opacity: 0 }, { "--turn": "180deg", color: "#2ec4b6", opacity: 1, duration: 1.4, ease: "power2.inOut" }, 0.2);
  ScrollTrigger.create({ trigger: "[data-mark-final]", start: "top 85%", once: true, onEnter: () => turn.play() });
}

// Controls under the scenes.
let listeners = 3;
const count = document.querySelector("[data-listener-count]");
const word = document.querySelector("[data-listener-word]");
const less = document.querySelector<HTMLButtonElement>('[data-listeners="-1"]');
const more = document.querySelector<HTMLButtonElement>('[data-listeners="1"]');
document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const step = target?.closest<HTMLElement>("[data-listeners]");
  if (step) {
    listeners = Math.min(6, Math.max(1, listeners + Number(step.dataset.listeners)));
    if (count) count.textContent = String(listeners);
    if (word) word.textContent = listeners === 1 ? "listener" : "listeners";
    if (less) less.disabled = listeners === 1;
    if (more) more.disabled = listeners === 6;
    scenes.get("pipeline")?.act?.(String(listeners));
  }
  const decide = target?.closest<HTMLElement>("[data-decide]");
  if (decide?.dataset.decide) scenes.get("approval")?.act?.(decide.dataset.decide);
  const path = target?.closest<HTMLElement>("[data-path]");
  if (path?.dataset.path) {
    for (const tab of document.querySelectorAll("[data-path]")) tab.setAttribute("aria-selected", String(tab === path));
    scenes.get("paths")?.act?.(path.dataset.path);
  }
});

// A soft spotlight follows the pointer across cards.
document.addEventListener(
  "pointermove",
  (event) => {
    const card = event.target instanceof Element ? event.target.closest<HTMLElement>(".trio article, .compare li") : null;
    if (!card) return;
    const box = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${event.clientX - box.left}px`);
    card.style.setProperty("--my", `${event.clientY - box.top}px`);
  },
  { passive: true },
);

// Type "echo" anywhere: a ring crosses the page, and its echo follows.
let typed = "";
let echoes = 0;
document.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey || event.key.length !== 1) return;
  typed = (typed + event.key.toLowerCase()).slice(-4);
  if (typed !== "echo") return;
  typed = "";
  echoes += 1;
  void import("./toast.tsx").then((toast) => toast.echoed(echoes));
  if (calm) return;
  ["", "is-echo"].forEach((variant, i) => {
    const ring = document.createElement("i");
    ring.className = `ripple ${variant}`.trim();
    document.body.append(ring);
    gsap.fromTo(ring, { scale: 0.05, opacity: 0.9 }, { scale: 3, opacity: 0, duration: 1.8, delay: i * 0.7, ease: "power2.out", onComplete: () => ring.remove() });
  });
});

void document.fonts.ready.then(() => ScrollTrigger.refresh());
