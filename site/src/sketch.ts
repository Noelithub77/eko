// Hand-drawn SVG in the Excalidraw style: rough.js strokes, Excalifont labels, seeded so every visit draws the same.
import rough from "roughjs";
import type { Options } from "roughjs/bin/core";
import type { RoughSVG } from "roughjs/bin/svg";

const NS = "http://www.w3.org/2000/svg";

export const ink = {
  line: "#d6d6d6",
  soft: "#8c8c8c",
  faint: "#3a3a3a",
  amber: "#ffc131",
  cyan: "#24c8db",
  red: "#ff7b7b",
  blue: "#8fb4ff",
  bg: "#101010",
  amberFill: "rgba(255, 193, 49, 0.13)",
  cyanFill: "rgba(36, 200, 219, 0.13)",
  redFill: "rgba(255, 123, 123, 0.12)",
  greyFill: "rgba(255, 255, 255, 0.05)",
} as const;

export type Point = readonly [number, number];
export type Style = { stroke?: string; fill?: string; width?: number; dash?: boolean; rough?: number };
export type TextStyle = { size?: number; color?: string; anchor?: "start" | "middle" | "end" };
export type Arrow = { group: SVGGElement; guide: SVGPathElement };

export class Sketch {
  private readonly rc: RoughSVG;
  private seed: number;
  private parent: SVGElement;

  constructor(svg: SVGSVGElement, width: number, height: number, seed = 7) {
    svg.replaceChildren();
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    this.rc = rough.svg(svg);
    this.seed = seed;
    this.parent = svg;
  }

  /** Collects everything drawn inside `draw` into a new group. */
  group(className: string | null, draw: () => void = () => undefined): SVGGElement {
    const group = document.createElementNS(NS, "g");
    if (className) group.setAttribute("class", className);
    this.parent.append(group);
    return this.into(group, draw);
  }

  /** Draws into an existing group, keeping its place in the stacking order. */
  into(group: SVGGElement, draw: () => void): SVGGElement {
    const previous = this.parent;
    this.parent = group;
    try {
      draw();
    } finally {
      this.parent = previous;
    }
    return group;
  }

  rect(x: number, y: number, w: number, h: number, style: Style = {}, radius = 14): SVGGElement {
    const r = Math.min(radius, w / 2, h / 2);
    const d = `M${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`;
    return this.path(d, style);
  }

  circle(cx: number, cy: number, diameter: number, style: Style = {}): SVGGElement {
    return this.add(this.rc.circle(cx, cy, diameter, this.options(style)));
  }

  ellipse(cx: number, cy: number, w: number, h: number, style: Style = {}): SVGGElement {
    return this.add(this.rc.ellipse(cx, cy, w, h, this.options(style)));
  }

  line(a: Point, b: Point, style: Style = {}): SVGGElement {
    return this.add(this.rc.line(a[0], a[1], b[0], b[1], this.options(style)));
  }

  polyline(points: readonly Point[], style: Style = {}): SVGGElement {
    return this.add(this.rc.linearPath(points.map(([x, y]): [number, number] => [x, y]), this.options(style)));
  }

  polygon(points: readonly Point[], style: Style = {}): SVGGElement {
    return this.add(this.rc.polygon(points.map(([x, y]): [number, number] => [x, y]), this.options(style)));
  }

  path(d: string, style: Style = {}): SVGGElement {
    return this.add(this.rc.path(d, this.options(style)));
  }

  /** A straight arrow, or a curve through a middle point, with a matching smooth guide for motion. */
  arrow(points: readonly Point[], style: Style = {}, heads: "end" | "both" | "none" = "end"): Arrow {
    const [start, middle, end] = points.length === 3 ? points : [points[0], null, points[points.length - 1]];
    const control: Point | null = middle ? [2 * middle[0] - (start[0] + end[0]) / 2, 2 * middle[1] - (start[1] + end[1]) / 2] : null;
    const d = control ? `M${start[0]} ${start[1]}Q${control[0]} ${control[1]} ${end[0]} ${end[1]}` : `M${start[0]} ${start[1]}L${end[0]} ${end[1]}`;
    const guide = document.createElementNS(NS, "path");
    guide.setAttribute("d", d);
    guide.setAttribute("fill", "none");
    guide.setAttribute("stroke", "none");
    guide.setAttribute("class", "guide");
    const group = this.group("arrow", () => {
      this.path(d, style);
      const solid = { ...style, dash: false };
      if (heads !== "none") this.head(end, control ?? start, solid);
      if (heads === "both") this.head(start, control ?? end, solid);
    });
    group.append(guide);
    return { group, guide };
  }

  text(x: number, y: number, value: string, style: TextStyle = {}): SVGTextElement {
    const size = style.size ?? 22;
    const text = document.createElementNS(NS, "text");
    text.setAttribute("x", String(x));
    text.setAttribute("y", String(y));
    text.setAttribute("fill", style.color ?? ink.line);
    text.setAttribute("font-size", String(size));
    text.setAttribute("text-anchor", style.anchor ?? "middle");
    text.setAttribute("class", "hand");
    value.split("\n").forEach((line, index) => {
      const span = document.createElementNS(NS, "tspan");
      span.setAttribute("x", String(x));
      if (index) span.setAttribute("dy", String(size * 1.2));
      span.textContent = line;
      text.append(span);
    });
    this.parent.append(text);
    return text;
  }

  /** A crisp element (packets, glows) that should not wobble. */
  shape<K extends "circle" | "rect" | "path">(tag: K, attributes: Record<string, string | number>): SVGElementTagNameMap[K] {
    const element = document.createElementNS(NS, tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
    this.parent.append(element);
    return element;
  }

  private head(tip: Point, from: Point, style: Style) {
    const angle = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
    const size = 13;
    const wing = (side: number): Point => [tip[0] - size * Math.cos(angle + side * 0.5), tip[1] - size * Math.sin(angle + side * 0.5)];
    this.polyline([wing(1), tip, wing(-1)], style);
  }

  private add(node: SVGGElement): SVGGElement {
    this.parent.append(node);
    return node;
  }

  private options(style: Style): Options {
    this.seed += 1;
    const options: Options = {
      seed: this.seed,
      stroke: style.stroke ?? ink.line,
      strokeWidth: style.width ?? 2,
      roughness: style.rough ?? 1,
      bowing: 1,
      preserveVertices: true,
    };
    if (style.fill) {
      options.fill = style.fill;
      options.fillStyle = "solid";
    }
    if (style.dash) {
      options.strokeLineDash = [9, 9];
      options.disableMultiStroke = true;
    }
    return options;
  }
}

const parts = "path, text, circle, rect";

/** Draws rough strokes on, then fades fills and labels, as hand-drawn diagrams appear in Excalidraw. */
export function drawOn(timeline: gsap.core.Timeline, targets: Element | readonly Element[], at: gsap.Position = ">", duration = 0.6): gsap.core.Timeline {
  const list = Array.isArray(targets) ? targets : [targets];
  const nodes = list.flatMap((target) => (target.matches(parts) ? [target] : [...target.querySelectorAll(parts)]));
  const drawn = nodes.filter((node) => !node.matches(".guide, .packet"));
  const strokes = drawn.filter((node) => node.tagName === "path" && node.getAttribute("fill") === "none" && !node.getAttribute("stroke-dasharray"));
  const rest = drawn.filter((node) => !strokes.includes(node));
  timeline.addLabel("draw", at);
  if (strokes.length) timeline.fromTo(strokes, { drawSVG: "0%" }, { drawSVG: "100%", duration, ease: "power1.inOut" }, "draw");
  if (rest.length) timeline.fromTo(rest, { opacity: 0 }, { opacity: 1, duration: duration * 0.8, ease: "power1.out" }, `draw+=${duration * 0.35}`);
  return timeline;
}
