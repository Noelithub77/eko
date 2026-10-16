import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// The child's protocol includes SDP/ICE and must stay in memory, not console logs.
export async function startNativeSender({ iceServers, deviceId, forceRelay, sendSignal }) {
  const child = spawn("cargo", ["test", "--offline", "-j", "2", "--lib", "serve_native_benchmark_sender", "--", "--ignored", "--nocapture"], {
    cwd: fileURLToPath(new URL("../../rust", import.meta.url)),
    env: { ...process.env, CARGO_TARGET_DIR: "target/desktop-dev", EKO_BENCH_ICE_SERVERS: JSON.stringify(iceServers), EKO_BENCH_DEVICE_ID: deviceId, EKO_BENCH_FORCE_RELAY: forceRelay ? "1" : "0" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let pending = "";
  let latest = null;
  let exited = false;
  let failure = null;
  const started = Date.now();
  let resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  child.on("error", (error) => { failure = error; rejectReady(error); });
  child.on("exit", (code) => { exited = true; if (code !== 0) { failure = new Error(`Native sender exited (${code})`); rejectReady(failure); } });
  let diagnostics = "";
  child.stderr.on("data", (chunk) => {
    diagnostics = (diagnostics + chunk.toString()).slice(-8192);
    if (diagnostics.includes("Could not automatically determine the process-level CryptoProvider")) {
      failure = new Error("Rustls has ambiguous crypto providers; initialize one explicitly before native WebRTC");
      rejectReady(failure);
    }
    process.stderr.write(chunk);
  });
  child.stdout.on("data", (chunk) => {
    pending += chunk.toString();
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("EKO_NATIVE_EVENT=")) continue;
      const event = JSON.parse(line.slice("EKO_NATIVE_EVENT=".length));
      if (event.kind === "offer") { sendSignal({ kind: "hostOffer", description: event.description }); resolveReady(); }
      else if (event.kind === "candidate") sendSignal({ kind: "hostIceCandidate", candidate: event.candidate });
      else if (event.kind === "stats") latest = event.status;
    }
  });
  const write = (value) => { if (!exited) child.stdin.write(`${JSON.stringify(value)}\n`); };
  const stats = async () => {
    latest = null; write({ op: "stats" });
    const deadline = Date.now() + 5000;
    while (!latest && !failure && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
    if (failure) throw failure;
    if (!latest) throw new Error("Native sender stats timed out");
    return latest;
  };
  const close = async () => {
    write({ op: "stop" });
    const deadline = Date.now() + 5000;
    while (!exited && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
    if (!exited) child.kill("SIGTERM");
  };
  let timer;
  try {
    await Promise.race([ready, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Native sender build/start timed out")), 120000); })]);
  } catch (error) { await close(); throw error; }
  finally { clearTimeout(timer); }
  return { startupMs: Date.now() - started, answer: (description) => write({ op: "answer", description }), candidate: (candidate) => write({ op: "candidate", candidate }), stats, close };
}
