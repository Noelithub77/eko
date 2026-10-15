// Operator entry for the eko website: `pnpm ops --help`.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { builds, downloadUrl, type Platform } from "./src/platform.ts";

const help = `pnpm ops <command> [--json]

  check    Run tests and the type-checked build, then confirm the release downloads exist.
  build    Production build into dist/.
  assets   Confirm every download link on the page resolves on GitHub.
  deploy   Build and upload dist/ to the Cloudflare Pages project (production).
  domain   Make sure eko.allpyq.in points at the Pages project (custom domain + proxied CNAME).
  status   Show the Pages project, its domains, and the live site response.

Cloudflare commands use CLOUDFLARE_API_TOKEN; the project name comes from wrangler.jsonc.
Results are printed as JSON on stdout; progress goes to stderr.`;

const root = import.meta.dirname;
// Pages configs cannot hold an account, so it lives here; the relay uses the same one.
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

function readPagesConfig(): { name: string } {
  // wrangler.jsonc only uses whole-line comments.
  const text = readFileSync(join(root, "wrangler.jsonc"), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  const parsed: unknown = JSON.parse(text);
  const name = read(parsed, "name");
  if (typeof name !== "string") throw new Error("wrangler.jsonc needs a name");
  return { name };
}

const config = readPagesConfig();

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

async function ensureProject(): Promise<boolean> {
  const projects = items(await cloudflare(`/accounts/${account}/pages/projects`));
  if (projects.some((project) => text(project, "name") === config.name)) return false;
  await cloudflare(`/accounts/${account}/pages/projects`, { method: "POST", body: { name: config.name, production_branch: "main" } });
  return true;
}

async function deploy(): Promise<Result> {
  run("pnpm", ["run", "build"]);
  const created = await ensureProject();
  const wrangler = join(root, "..", "node_modules", ".bin", "wrangler");
  run(wrangler, ["pages", "deploy", "dist", "--project-name", config.name, "--branch", "main", "--commit-dirty=true"]);
  const [latest] = items(await cloudflare(`/accounts/${account}/pages/projects/${config.name}/deployments`));
  return { project: config.name, created, deployment: latest ? { id: text(latest, "id"), url: text(latest, "url"), createdOn: text(latest, "created_on") } : null };
}

async function ensureDomain(): Promise<Result> {
  const base = `/accounts/${account}/pages/projects/${config.name}/domains`;
  const domains = items(await cloudflare(base));
  const attached = domains.some((entry) => text(entry, "name") === domain);
  if (!attached) await cloudflare(base, { method: "POST", body: { name: domain } });

  const [found] = items(await cloudflare(`/zones?name=${zone}`));
  const zoneId = text(found, "id");
  if (!zoneId) throw new Error(`Zone ${zone} is not in this account`);
  const records = items(await cloudflare(`/zones/${zoneId}/dns_records?name=${domain}`));
  const target = text(await cloudflare(`/accounts/${account}/pages/projects/${config.name}`), "subdomain");
  if (!target) throw new Error(`Pages project ${config.name} has no subdomain yet`);
  const record = records.find((entry) => text(entry, "type") === "CNAME");
  if (records.length && !record) throw new Error(`${domain} already has non-CNAME records; resolve them by hand`);
  if (!record) await cloudflare(`/zones/${zoneId}/dns_records`, { method: "POST", body: { type: "CNAME", name: domain, content: target, proxied: true } });
  else if (text(record, "content") !== target) throw new Error(`${domain} points at ${text(record, "content")}, not ${target}`);
  return { domain, target, pagesDomainCreated: !attached, dnsRecordCreated: !record };
}

async function status(): Promise<Result> {
  const project = await cloudflare(`/accounts/${account}/pages/projects/${config.name}`);
  const domains = items(await cloudflare(`/accounts/${account}/pages/projects/${config.name}/domains`));
  const live = await fetch(`https://${domain}/`, { redirect: "manual" }).then(
    (response) => ({ status: response.status }),
    (error: unknown) => ({ error: error instanceof Error ? error.message : String(error) }),
  );
  return { project: config.name, subdomain: text(project, "subdomain"), domains: domains.map((entry) => ({ name: text(entry, "name"), status: text(entry, "status") })), live };
}

const [command = "--help", ...flags] = process.argv.slice(2);
const commands: Record<string, () => Promise<Result>> = {
  check: async () => {
    run("pnpm", ["run", "test"]);
    run("pnpm", ["run", "build"]);
    return assets();
  },
  build: async () => {
    run("pnpm", ["run", "build"]);
    return {};
  },
  assets,
  deploy,
  domain: ensureDomain,
  status,
};

const action = commands[command];
if (command === "--help" || command === "help") console.log(help);
else if (!action || flags.some((flag) => flag !== "--json")) {
  console.error(`Unknown command or flag.\n\n${help}`);
  process.exitCode = 1;
} else {
  try {
    const result = await action();
    console.log(JSON.stringify({ command, environment: command === "build" || command === "check" ? "local" : "cloudflare-production", success: true, ...result }));
  } catch (error) {
    console.error(JSON.stringify({ command, success: false, error: error instanceof Error ? error.message : String(error) }));
    process.exitCode = 1;
  }
}
