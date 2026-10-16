// Operator entry for eko: `pnpm ops --help`.
import { latencyOperator, latencyHelp } from "./scripts/latency/operator.ts";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { builds, downloadUrl, type Platform } from "./frontend/web/landing/platform.ts";

const help = `pnpm ops <command> [--json]

  latency  Profile audio delay, compare capture and test real direct/TURN media.
           Run pnpm ops latency --help for options.
  check    Run tests and the type-checked build, then confirm the release downloads exist.
  build    Build landing and receiver into dist/hosted/.
  assets   Confirm every download link on the page resolves on GitHub.
  deploy   Build and deploy the landing, receiver, and signaling Worker (production).
  domain   Inspect the domain and Worker routes.
  status   Show Worker routes and live landing, receiver, and relay responses.

Cloudflare commands use CLOUDFLARE_API_TOKEN; the Worker is configured in relay/wrangler.jsonc.
Results are printed as JSON on stdout; progress goes to stderr.`;

const root = import.meta.dirname;
// The landing and receiver share the existing relay account.
const account = "75bb6d35925d6493575a3e2d6deac186";
const domain = "eko.allpyq.in";
const zone = "allpyq.in";

type Result = Record<string, unknown>;

// Cloudflare JSON arrives as unknown; these read it without trusting its shape.
function read(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null && key in value ? Object.getOwnPropertyDescriptor(value, key)?.value : undefined;
}
function text(value: unknown, key: string): string {
  const found = read(value, key);
  return typeof found === "string" ? found : "";
}
function items(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readWorkerConfig(): { name: string } {
  // The Worker config uses JSON with optional whole-line comments.
  const text = readFileSync(join(root, "relay", "wrangler.jsonc"), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  const parsed: unknown = JSON.parse(text);
  const name = read(parsed, "name");
  if (typeof name !== "string") throw new Error("wrangler.jsonc needs a name");
  return { name };
}

const config = readWorkerConfig();

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { cwd: root, stdio: ["ignore", 2, 2], env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: account } });
  if (result.error || result.status !== 0) throw new Error(result.error?.message ?? `${command} ${args.join(" ")} failed`);
}

async function cloudflare(path: string, init: { method?: string; body?: object } = {}): Promise<unknown> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error("CLOUDFLARE_API_TOKEN is not set");
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method: init.method ?? "GET",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const json: unknown = await response.json();
  if (read(json, "success") !== true) {
    const reasons = items(read(json, "errors")).map((error) => text(error, "message"));
    throw new Error(`${init.method ?? "GET"} ${path}: ${reasons.join("; ") || response.statusText}`);
  }
  return read(json, "result");
}

async function assets(): Promise<Result> {
  const platforms: Platform[] = ["windows", "linux", "android"];
  const checks = await Promise.all(
    platforms.map(async (platform) => {
      const response = await fetch(downloadUrl(platform), { method: "HEAD", redirect: "follow" });
      return { platform, file: builds[platform].file, status: response.status };
    }),
  );
  const missing = checks.filter((check) => check.status !== 200);
  if (missing.length) throw new Error(`Missing downloads: ${missing.map((check) => `${check.file} (${check.status})`).join(", ")}`);
  return { downloads: checks };
}

async function deploy(): Promise<Result> {
  run("pnpm", ["run", "build:web"]);
  run(join(root, "node_modules", ".bin", "wrangler"), ["deploy", "--config", "relay/wrangler.jsonc"]);
  for (let attempt = 0; ; attempt += 1) {
    try {
      return { worker: config.name, domain, ...(await status()) };
    } catch (error) {
      if (attempt === 5) throw error;
      console.error("Waiting for the production route to serve the new deployment…");
      await delay(2000);
    }
  }
}

async function status(): Promise<Result> {
  const [found] = items(await cloudflare(`/zones?name=${zone}`));
  const zoneId = text(found, "id");
  if (!zoneId) throw new Error(`Zone ${zone} is not in this account`);
  const routes = items(await cloudflare(`/zones/${zoneId}/workers/routes`))
    .filter((route) => text(route, "script") === config.name)
    .map((route) => ({ pattern: text(route, "pattern"), script: text(route, "script") }));
  const live = await Promise.all(["/", "/client/", "/health"].map(async (path) => {
    const response = await fetch(`https://${domain}${path}`);
    const contentType = response.headers.get("content-type");
    const body = await response.text();
    const matches = path === "/health" ? contentType?.includes("application/json") && body.includes('"eko-relay"')
      : path === "/client/" ? body.includes('id="root"') && !body.includes('class="hero"')
      : body.includes('class="hero"');
    return { path, status: response.status, contentType, matches };
  }));
  if (live.some((entry) => entry.status !== 200 || !entry.matches)) throw new Error(`Live verification failed: ${JSON.stringify(live)}`);
  return { routes, live };
}

const [command = "--help", ...flags] = process.argv.slice(2);
const commands: Record<string, () => Promise<Result>> = {
  check: async () => {
    run("pnpm", ["run", "test:web"]);
    run("pnpm", ["run", "build:web"]);
    return assets();
  },
  build: async () => {
    run("pnpm", ["run", "build:web"]);
    return {};
  },
  assets,
  deploy,
  domain: status,
  status,
};

const action = command === "latency" ? () => latencyOperator(flags) : commands[command];
if (command === "--help" || command === "help") console.log(`${help}\n\n${latencyHelp}`);
else if (!action || (command !== "latency" && flags.some((flag) => flag !== "--json"))) {
  console.error(`Unknown command or flag.\n\n${help}`);
  process.exitCode = 1;
} else {
  try {
    const result = await action();
    if (result.success === false) process.exitCode = 1;
    console.log(JSON.stringify({ command, environment: command === "build" || command === "check" ? "local" : "cloudflare-production", success: true, ...result }));
  } catch (error) {
    console.log(JSON.stringify({ command, success: false, error: error instanceof Error ? error.message : String(error) }));
    process.exitCode = 1;
  }
}
