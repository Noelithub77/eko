// The recurring characters of every diagram, drawn around a center point.
import { ink, type Sketch, type Style } from "./sketch.ts";

export type Mood = "smile" | "frown" | "sleep" | "plain";

/** Screen centered on (cx, cy); the keyboard base hangs below it. */
export function laptop(s: Sketch, cx: number, cy: number, w: number, style: Style = {}): SVGGElement {
  const h = w * 0.62;
  return s.group("laptop", () => {
    s.rect(cx - w / 2, cy - h / 2, w, h, { fill: ink.greyFill, ...style }, 8);
    const top = cy + h / 2 + 3;
    s.polygon([[cx - w / 2 - w * 0.09, top + w * 0.09], [cx + w / 2 + w * 0.09, top + w * 0.09], [cx + w / 2, top], [cx - w / 2, top]], { fill: ink.greyFill, ...style });
  });
}

export function phone(s: Sketch, cx: number, cy: number, h: number, style: Style = {}): SVGGElement {
  const w = h * 0.52;
  return s.group("phone", () => {
    s.rect(cx - w / 2, cy - h / 2, w, h, { fill: ink.greyFill, ...style }, Math.max(6, w * 0.18));
    s.line([cx - w * 0.15, cy - h / 2 + h * 0.08], [cx + w * 0.15, cy - h / 2 + h * 0.08], { ...style, width: 2, rough: 0.5 });
  });
}

/** A face; `phones` puts headphones on it in that color. */
export function person(s: Sketch, cx: number, cy: number, r: number, mood: Mood = "plain", phones?: string): SVGGElement {
  return s.group("person", () => {
    s.circle(cx, cy, r * 2, { fill: ink.bg, stroke: ink.line });
    s.path(`M${cx - r * 1.5} ${cy + r * 2.7}Q${cx - r * 1.4} ${cy + r * 1.25} ${cx} ${cy + r * 1.25}Q${cx + r * 1.4} ${cy + r * 1.25} ${cx + r * 1.5} ${cy + r * 2.7}`, { stroke: ink.line });
    const eye = r * 0.32;
    if (mood === "sleep") {
      s.line([cx - eye - r * 0.14, cy - r * 0.12], [cx - eye + r * 0.14, cy - r * 0.12], { width: 2, rough: 0.4 });
      s.line([cx + eye - r * 0.14, cy - r * 0.12], [cx + eye + r * 0.14, cy - r * 0.12], { width: 2, rough: 0.4 });
      s.text(cx + r * 1.15, cy - r * 0.9, "z z", { size: r * 0.7, color: ink.soft, anchor: "start" });
    } else {
      s.shape("circle", { cx: cx - eye, cy: cy - r * 0.15, r: Math.max(1.6, r * 0.09), fill: ink.line });
      s.shape("circle", { cx: cx + eye, cy: cy - r * 0.15, r: Math.max(1.6, r * 0.09), fill: ink.line });
    }
    const mouth = r * 0.42;
    const y = cy + r * 0.38;
    if (mood === "smile") s.path(`M${cx - mouth} ${y - r * 0.05}Q${cx} ${y + r * 0.4} ${cx + mouth} ${y - r * 0.05}`, { width: 2, rough: 0.5 });
    else if (mood === "frown") s.path(`M${cx - mouth} ${y + r * 0.2}Q${cx} ${y - r * 0.2} ${cx + mouth} ${y + r * 0.2}`, { width: 2, rough: 0.5 });
    else s.line([cx - mouth * 0.6, y + r * 0.05], [cx + mouth * 0.6, y + r * 0.05], { width: 2, rough: 0.4 });
    if (phones) headphones(s, cx, cy, r, phones);
  });
}

export function headphones(s: Sketch, cx: number, cy: number, r: number, color: string): SVGGElement {
  return s.group("headphones", () => {
    s.path(`M${cx - r * 1.12} ${cy + r * 0.1}C${cx - r * 1.2} ${cy - r * 1.6} ${cx + r * 1.2} ${cy - r * 1.6} ${cx + r * 1.12} ${cy + r * 0.1}`, { stroke: color, width: 3 });
    s.rect(cx - r * 1.32, cy - r * 0.15, r * 0.42, r * 0.75, { stroke: color, fill: color }, r * 0.18);
    s.rect(cx + r * 0.9, cy - r * 0.15, r * 0.42, r * 0.75, { stroke: color, fill: color }, r * 0.18);
  });
}

/** Sound arcs opening toward `angle` (radians, 0 points right). */
export function waves(s: Sketch, cx: number, cy: number, r: number, count: number, angle: number, color: string, spread = 0.75): SVGGElement {
  return s.group("waves", () => {
    for (let i = 1; i <= count; i += 1) {
      const radius = r * i;
      const a = angle - spread;
      const b = angle + spread;
      s.path(`M${cx + radius * Math.cos(a)} ${cy + radius * Math.sin(a)}A${radius} ${radius} 0 0 1 ${cx + radius * Math.cos(b)} ${cy + radius * Math.sin(b)}`, { stroke: color, width: 2.4 });
    }
  });
}

export function wifi(s: Sketch, cx: number, cy: number, size: number, color: string): SVGGElement {
  return s.group("wifi", () => {
    waves(s, cx, cy, size / 3, 3, -Math.PI / 2, color, 0.8);
    s.shape("circle", { cx, cy, r: size * 0.07, fill: color });
  });
}

export function cloud(s: Sketch, cx: number, cy: number, w: number, style: Style = {}): SVGGElement {
  const h = w * 0.5;
  const d = `M${cx - w * 0.36} ${cy + h * 0.42}C${cx - w * 0.56} ${cy + h * 0.42} ${cx - w * 0.56} ${cy - h * 0.1} ${cx - w * 0.33} ${cy - h * 0.06}C${cx - w * 0.3} ${cy - h * 0.6} ${cx + w * 0.1} ${cy - h * 0.66} ${cx + w * 0.14} ${cy - h * 0.2}C${cx + w * 0.4} ${cy - h * 0.38} ${cx + w * 0.58} ${cy - h * 0.02} ${cx + w * 0.4} ${cy + h * 0.42}Z`;
  return s.path(d, { fill: ink.greyFill, ...style });
}

export function qr(s: Sketch, cx: number, cy: number, size: number, color: string = ink.line): SVGGElement {
  const x = cx - size / 2;
  const y = cy - size / 2;
  const f = size * 0.3;
  return s.group("qr", () => {
    s.rect(x, y, size, size, { stroke: color, rough: 0.6 }, 4);
    for (const [fx, fy] of [[x + 4, y + 4], [x + size - f - 4, y + 4], [x + 4, y + size - f - 4]]) {
      s.rect(fx, fy, f, f, { stroke: color, rough: 0.4 }, 2);
      s.shape("rect", { x: fx + f * 0.3, y: fy + f * 0.3, width: f * 0.4, height: f * 0.4, fill: color, rx: 1 });
    }
    const cell = size * 0.1;
    for (const [i, j] of [[5, 5], [6, 7], [7, 5], [5, 8], [8, 8], [7, 6], [4, 6]]) {
      s.shape("rect", { x: x + i * cell, y: y + j * cell - cell * 0.6, width: cell * 0.8, height: cell * 0.8, fill: color, rx: 1 });
    }
  });
}

export function note(s: Sketch, x: number, y: number, size: number, color: string): SVGGElement {
  return s.group("note", () => {
    s.ellipse(x, y, size * 0.55, size * 0.4, { stroke: color, fill: color, rough: 0.5 });
    s.path(`M${x + size * 0.26} ${y}V${y - size}Q${x + size * 0.55} ${y - size * 0.75} ${x + size * 0.62} ${y - size * 0.5}`, { stroke: color, width: 2.4, rough: 0.6 });
  });
}

export function bluetooth(s: Sketch, cx: number, cy: number, size: number, color: string): SVGGElement {
  const h = size / 2;
  const w = size * 0.28;
  return s.polyline([[cx - w, cy - h * 0.45], [cx + w, cy + h * 0.45], [cx, cy + h], [cx, cy - h], [cx + w, cy - h * 0.45], [cx - w, cy + h * 0.45]], { stroke: color, width: 2.6, rough: 0.6 });
}

export function speaker(s: Sketch, cx: number, cy: number, size: number, color: string = ink.line): SVGGElement {
  const u = size / 2;
  return s.polygon([[cx - u, cy - u * 0.4], [cx - u * 0.35, cy - u * 0.4], [cx + u * 0.3, cy - u], [cx + u * 0.3, cy + u], [cx - u * 0.35, cy + u * 0.4], [cx - u, cy + u * 0.4]], { stroke: color, fill: ink.greyFill });
}

/** A labeled box; text is centered unless the box is tall enough for a title row. */
export function box(s: Sketch, cx: number, cy: number, w: number, h: number, label: string, style: Style = {}, size = 20): SVGGElement {
  return s.group("box", () => {
    s.rect(cx - w / 2, cy - h / 2, w, h, style);
    const lines = label.split("\n").length;
    s.text(cx, cy + size * 0.35 - ((lines - 1) * size * 1.2) / 2, label, { size, color: style.stroke ?? ink.line });
  });
}

/** A small filled dot that travels along guides: crisp, so it reads as data, not ink. */
export function packet(s: Sketch, color: string, r = 6): SVGCircleElement {
  return s.shape("circle", { cx: 0, cy: 0, r, fill: color, opacity: 0, class: "packet" });
}
