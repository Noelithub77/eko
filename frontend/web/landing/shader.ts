// Hero field: the coral dot sends a ring, the teal dot answers with its echo, and quiet listeners light up as rings pass.
import { Mesh, Program, Renderer, Triangle } from "ogl";

export const period = 3.2;
export const echoDelay = 0.7;

const vertex = /* glsl */ `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

const fragment = /* glsl */ `
precision highp float;
uniform float uTime;
uniform vec2 uRes;
uniform vec2 uSource;
uniform vec2 uEcho;
uniform vec3 uPointer;
const vec3 coral = vec3(1.0, 0.420, 0.357);
const vec3 teal = vec3(0.180, 0.769, 0.714);
const float period = ${period.toFixed(2)};
const float speed = 0.55;

// Brightness of the ring front from a source, for a point at distance d.
float ring(float d, float t) {
  float since = t - d / speed;
  if (since < 0.0) return 0.0;
  float age = mod(since, period);
  return exp(-age * 9.0) * smoothstep(1.6, 0.0, d);
}

float hash(float n) { return fract(sin(n * 91.345) * 47453.21); }

void main() {
  float scale = min(uRes.x, uRes.y);
  vec2 p = gl_FragCoord.xy / scale;
  float a = ring(distance(p, uSource / scale), uTime);
  float c = ring(distance(p, uEcho / scale), uTime - ${echoDelay.toFixed(2)});
  vec3 color = coral * a * 0.16 + teal * c * 0.2;
  float alpha = a * 0.16 + c * 0.2;

  // Listeners: scattered dots that glow when a ring reaches them.
  for (int i = 0; i < 18; i++) {
    float n = float(i);
    vec2 spot = vec2(hash(n + 1.0), hash(n + 7.3)) * uRes / scale;
    float d = distance(p, spot) * scale;
    float core = smoothstep(3.2, 1.6, d);
    float glow = smoothstep(26.0, 0.0, d) * 0.5;
    float la = ring(distance(spot, uSource / scale), uTime);
    float lc = ring(distance(spot, uEcho / scale), uTime - ${echoDelay.toFixed(2)});
    vec3 lit = coral * la + teal * lc;
    color += vec3(0.16) * core + lit * (core + glow) * 1.4;
    alpha += 0.16 * core + (la + lc) * (core + glow) * 1.4;
  }

  // The pointer listens too.
  float pd = distance(gl_FragCoord.xy, uPointer.xy);
  float pa = ring(distance(uPointer.xy / scale, uSource / scale), uTime);
  float pc = ring(distance(uPointer.xy / scale, uEcho / scale), uTime - ${echoDelay.toFixed(2)});
  float halo = smoothstep(46.0, 0.0, pd) * uPointer.z;
  color += (coral * pa + teal * pc) * halo;
  alpha += (pa + pc) * halo;

  gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
}
`;

type Field = { stop: () => void };

/** Starts the field behind `host`. Ring sources follow the elements `source` and `echo`. */
export function startField(canvas: HTMLCanvasElement, host: HTMLElement, source: Element, echo: Element, onPulse: (kind: "source" | "echo") => void): Field | null {
  const dpr = Math.min(window.devicePixelRatio || 1, 2) * 0.5;
  let renderer: Renderer;
  try {
    renderer = new Renderer({ canvas, dpr, alpha: true, premultipliedAlpha: false, antialias: false });
  } catch {
    return null;
  }
  const gl = renderer.gl;
  const uniforms = {
    uTime: { value: 0 },
    uRes: { value: [1, 1] },
    uSource: { value: [0, 0] },
    uEcho: { value: [0, 0] },
    uPointer: { value: [0, 0, 0] },
  };
  const program = new Program(gl, { vertex, fragment, uniforms, transparent: true });
  const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

  // Shader coordinates are in device pixels with y up.
  const toField = (x: number, y: number, box: DOMRect) => [(x - box.left) * dpr, (box.bottom - y) * dpr];
  const measure = () => {
    const box = host.getBoundingClientRect();
    renderer.setSize(box.width, box.height);
    uniforms.uRes.value = [box.width * dpr, box.height * dpr];
    const a = source.getBoundingClientRect();
    const c = echo.getBoundingClientRect();
    uniforms.uSource.value = toField(a.left + a.width / 2, a.top + a.height / 2, box);
    uniforms.uEcho.value = toField(c.left + c.width / 2, c.top + c.height / 2, box);
  };
  const pointer = (event: PointerEvent) => {
    const box = host.getBoundingClientRect();
    uniforms.uPointer.value = [...toField(event.clientX, event.clientY, box), event.pointerType === "mouse" ? 1 : 0];
  };

  let frame = 0;
  let visible = true;
  let beat = -1;
  let echoBeat = -1;
  const start = performance.now();
  const render = (now: number) => {
    frame = requestAnimationFrame(render);
    const t = (now - start) / 1000;
    uniforms.uTime.value = t;
    // Fire once per ring so the DOM dots pulse with the field.
    const nextBeat = Math.floor(t / period);
    const nextEcho = Math.floor((t - echoDelay) / period);
    if (nextBeat !== beat) onPulse("source");
    if (nextEcho !== echoBeat && nextEcho >= 0) onPulse("echo");
    beat = nextBeat;
    echoBeat = nextEcho;
    renderer.render({ scene: mesh });
  };

  const resize = new ResizeObserver(measure);
  resize.observe(host);
  const view = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? false;
    cancelAnimationFrame(frame);
    if (visible && !document.hidden) frame = requestAnimationFrame(render);
  });
  view.observe(host);
  const visibility = () => {
    cancelAnimationFrame(frame);
    if (visible && !document.hidden) frame = requestAnimationFrame(render);
  };
  document.addEventListener("visibilitychange", visibility);
  host.addEventListener("pointermove", pointer, { passive: true });
  measure();
  // The echo dot settles after the CSS intro; measure again once it has.
  window.setTimeout(measure, 2100);
  canvas.classList.add("is-live");

  return {
    stop: () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      view.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      host.removeEventListener("pointermove", pointer);
    },
  };
}
