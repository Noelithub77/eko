import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { summarizeDevice } from "../../frontend/shared/utils/latency-summary.ts";
import { nativeTestArguments } from "./native-test-runner.mjs";

export const latencyHelp = `pnpm ops latency <status|capture|pipeline|media|check> [options] [--json]

  status  Read current session and per-device 30-second summaries (read-only).
          --seconds 0..120 polls live profiles in memory (default 0).
          --max-delay-ms N fails if any current estimated p95 exceeds N.
          Missing connected peers or fresh samples fail, never pass as zero.
  pipeline Run a 3-second real native capture/Opus probe (cached Rust test build).
           Reads monitor audio; no peer or physical output. Needs Cargo/system libs.
           --stall-ms 100..2000 instead tests capture/queue recovery after a stall,
           without Opus or network; reports stale packets and time to fresh audio.
  capture Compare real Linux capture fragments: default, 20 ms, 10 ms.
          Reads monitor audio without playing or saving it; needs python3/libpulse.
  media   Full isolated receiver workflow and real direct/forced TURN media.
          --path direct|turn|both (default both)
          --protocol udp|tcp|tls|all (default udp, TURN only)
          --max-delay-ms N optionally fails observed p95 above a delay budget.
          --sender browser|native (default browser; native uses actual Rust capture)
          --summary-only omits session samples and device identifiers from output.
          --targets 20,40,60 (default 60,40,20)
          --seconds 6..60 (default 9 per run); --runs 1..3 (default 1)
          --relay-url HTTPS_ORIGIN (default https://eko.allpyq.in)
          --client-url HTTP_URL (required: local receiver preview)
          Creates temporary rooms and consumes small TURN traffic; closes each room.
          No live desktop, approval list, microphone or physical speaker is driven.
  check   Run deterministic stats, summary, profiler-delivery and buffer regressions.

Status uses EKO_OPERATOR_URL (default http://127.0.0.1:13370/__eko_operator).
All results are JSON. No profiler files are written. Missing prerequisites fail.
Example: pnpm ops latency media --path turn --protocol all --targets 40 --client-url http://127.0.0.1:5188 --json`;

const sampleSchema = z.object({
  version: z.number(), source: z.string(), kind: z.string(), createdAtMs: z.number().nullable(),
  connectionId: z.string(), deviceId: z.string(), roomId: z.string(), sampleIndex: z.number(),
  latencyMs: z.number().nullable(), roundTripMs: z.number().nullable().optional(), jitterMs: z.number().nullable(),
  bufferMs: z.number().nullable(), packetLossPercent: z.number().nullable(), packetsReceived: z.number().nullable(), packetsLost: z.number().nullable(),
});
const snapshotSchema = z.object({
  processId: z.number(), platform: z.string(),
  session: z.object({ roomId: z.string().nullable(), devices: z.array(z.object({ deviceId: z.string(), state: z.string(), connectionPath: z.string().nullable() })) }),
  webrtc: z.record(z.string(), z.unknown()), profiler: z.array(sampleSchema),
});
const optionsWithValues = new Set(["--seconds", "--max-delay-ms", "--path", "--protocol", "--targets", "--runs", "--relay-url", "--client-url", "--sender", "--stall-ms"]);

export async function latencyOperator(args: string[]): Promise<Record<string, unknown>> {
  const [command = "help", ...flags] = args;
  if (command === "help" || command === "--help" || flags.includes("--help")) return { environment: "local", help: latencyHelp };
  const options = new Map<string, string>();
  for (let index = 0; index < flags.length; index++) {
    const flag = flags[index];
    if (flag === "--json") continue;
    if (flag === "--summary-only") { options.set(flag, "true"); continue; }
    const value = flags[++index];
    if (!optionsWithValues.has(flag) || !value || value.startsWith("--") || options.has(flag)) throw new Error(`Invalid option ${flag}. Use pnpm ops latency --help.`);
    options.set(flag, value);
  }
  const allowed: Record<string, string[]> = { status: ["--seconds", "--max-delay-ms"], capture: [], pipeline: ["--stall-ms"], check: [], media: ["--seconds", "--path", "--protocol", "--targets", "--runs", "--relay-url", "--client-url", "--sender", "--max-delay-ms", "--summary-only"] };
  if (!(command in allowed)) throw new Error(`Unknown latency command: ${command}`);
  for (const key of options.keys()) if (!allowed[command].includes(key)) throw new Error(`${key} does not apply to ${command}`);
  if (command === "status") return status(options);
  if (command === "check") {
    run("pnpm", ["run", "test:latency"]);
    return { environment: "local-tests", success: true };
  }
  if (command === "pipeline") {
    const stallMs = options.has("--stall-ms") ? integer(options, "--stall-ms", 500, 100, 2000) : null;
    const child = spawnSync("cargo", ["test", ...nativeTestArguments(), "--offline", "-j", "2", "--lib", stallMs === null ? "profile_native_audio_pipeline" : "profile_native_capture_recovery", "--", "--ignored", "--nocapture"], { cwd: fileURLToPath(new URL("../../rust", import.meta.url)), env: { ...process.env, CARGO_TARGET_DIR: process.env.CARGO_TARGET_DIR ?? "target/desktop-dev", ...(stallMs === null ? {} : { EKO_BENCH_STALL_MS: String(stallMs) }) }, encoding: "utf8", stdio: ["ignore", "pipe", 2], timeout: 180000, maxBuffer: 1024 * 1024 });
    if (child.error) throw new Error(child.error.message);
    const line = child.stdout.split("\n").find((line) => line.startsWith("EKO_PIPELINE_RESULT="));
    if (!line) throw new Error(`Native probe failed (exit ${child.status})`);
    const result = z.record(z.string(), z.unknown()).parse(JSON.parse(line.slice("EKO_PIPELINE_RESULT=".length)));
    return { ...result, success: child.status === 0 && result.success === true };
  }
  if (command === "capture") return runJson("python3", [fileURLToPath(new URL("./capture.py", import.meta.url))], 30000);
  const path = options.get("--path") ?? "both";
  const protocol = options.get("--protocol") ?? "udp";
  if (!["direct", "turn", "both"].includes(path) || !["udp", "tcp", "tls", "all"].includes(protocol)) throw new Error("Invalid media path or TURN protocol");
  const clientUrl = options.get("--client-url");
  if (!clientUrl) throw new Error("Start a local receiver preview and provide --client-url (see docs/latency.md)");
  const client = new URL(clientUrl);
  if (!["http:", "https:"].includes(client.protocol) || client.username || client.password || client.hash || client.search) throw new Error("Client URL must be an HTTP(S) page without credentials, query or hash");
  const relay = new URL(options.get("--relay-url") ?? "https://eko.allpyq.in");
  if (relay.protocol !== "https:" || relay.username || relay.password || relay.pathname !== "/" || relay.hash || relay.search) throw new Error("Relay URL must be an HTTPS origin");
  const targets = (options.get("--targets") ?? "60,40,20").split(",").map(Number);
  if (!targets.length || targets.length > 3 || targets.some((value) => ![20, 40, 60].includes(value))) throw new Error("Targets must be up to three of 20,40,60");
  const senderType = options.get("--sender") ?? "browser";
  if (!["browser", "native"].includes(senderType)) throw new Error("--sender must be browser or native");
  return runJson(process.execPath, [fileURLToPath(new URL("./media.mjs", import.meta.url)), JSON.stringify({ summaryOnly: options.has("--summary-only"), maxDelayMs: options.has("--max-delay-ms") ? integer(options, "--max-delay-ms", 150, 1, 10000) : null, senderType, relayUrl: relay.origin, clientUrl: client.href, paths: path === "both" ? ["direct", "turn"] : [path], protocols: protocol === "all" ? ["udp", "tcp", "tls"] : [protocol], targets, seconds: integer(options, "--seconds", 9, 6, 60), runs: integer(options, "--runs", 1, 1, 3) })], 3600000);
}

async function status(options: Map<string, string>): Promise<Record<string, unknown>> {
  const seconds = integer(options, "--seconds", 0, 0, 120);
  const threshold = options.has("--max-delay-ms") ? integer(options, "--max-delay-ms", 150, 1, 10000) : null;
  const target = new URL(process.env.EKO_OPERATOR_URL ?? "http://127.0.0.1:13370/__eko_operator");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)) throw new Error("Latency status requires a loopback operator endpoint");
  const started = Date.now();
  let snapshot: z.infer<typeof snapshotSchema> | null = null;
  do {
    const response = await fetch(target, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Operator HTTP ${response.status}`);
    snapshot = snapshotSchema.parse(await response.json());
    if (Date.now() - started >= seconds * 1000) break;
    await delay(Math.min(2000, seconds * 1000 - (Date.now() - started)));
  } while (Date.now() - started < seconds * 1000);
  if (!snapshot) throw new Error("No operator snapshot received");
  const devices = snapshot.session.devices.filter((device) => device.state === "connected").map((device) => ({ ...device, ...summarizeDevice(snapshot.profiler, device.deviceId, snapshot.session.roomId ?? "") }));
  const missing = !devices.length || devices.some((device) => !device.samples || (threshold !== null && device.delay.p95Ms === null));
  const exceeded = threshold !== null && devices.some((device) => device.delay.p95Ms !== null && device.delay.p95Ms > threshold);
  return { environment: "local-running-desktop", success: !missing && !exceeded, processId: snapshot.processId, platform: snapshot.platform, durationMs: Date.now() - started, measurement: "Partial one-way estimate excludes capture, decoding and physical output. Native receivers may report buffer only.", devices, pipeline: snapshot.webrtc, reason: missing ? "No connected receiver with fresh required measurements" : exceeded ? "Estimated p95 exceeded threshold" : null };
}

function integer(options: Map<string, string>, key: string, fallback: number, min: number, max: number): number {
  const value = Number(options.get(key) ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${key} must be an integer from ${min} to ${max}`);
  return value;
}
function run(command: string, args: string[]): void {
  const child = spawnSync(command, args, { stdio: ["ignore", 2, 2] });
  if (child.error || child.status !== 0) throw new Error(child.error?.message ?? "Latency regression check failed");
}
function runJson(command: string, args: string[], timeout: number): Record<string, unknown> {
  const child = spawnSync(command, args, { stdio: ["ignore", "pipe", 2], encoding: "utf8", timeout, maxBuffer: 8 * 1024 * 1024 });
  if (child.error) throw new Error(child.error.message);
  const result: unknown = JSON.parse(child.stdout || "null");
  if (typeof result !== "object" || result === null || Array.isArray(result)) throw new Error(`Invalid latency result (exit ${child.status})`);
  return { ...Object.fromEntries(Object.entries(result)), success: child.status === 0 && Reflect.get(result, "success") === true };
}
