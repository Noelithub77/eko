import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { platformCleanupOperator } from "./platform-cleanup.ts";

export const platformBuildHelp = `pnpm ops platforms <start|status|cleanup> [options] [--json]

  start --ref build/NAME   Push a snapshot of the clean committed tree to a new
                          isolated build branch and locate its workflow run.
                          Reusing a ref is safe only when its tree is identical.
  status --run RUN_ID     Read jobs and up to 100 artifacts for that build.
  cleanup --ref build/NAME [--dry-run]
                         Delete only this unprotected, idle build branch using
                         its current SHA as a lease, then verify it is absent.
                         Dry run reports eligibility without deleting anything.

Uses the configured origin and authenticated gh CLI. Start leaves the local
branch unchanged, publishes no release, and does not bump the app version.
By default builds Windows, Linux, macOS beta, Android debug APK/AAB and hosted web.
Use build/android/NAME, build/windows/NAME, build/linux/NAME, build/macos/NAME or build/web/NAME
to retry only that target after a failure; other build/ references build all.
Artifacts expire after 14 days; running jobs are not finished builds.
Cleanup preserves tags, releases, artifacts and caches; failed terminal builds
can be removed manually. Automatic cleanup runs only after successful builds.`;

const runSchema = z.object({
  databaseId: z.number(), headSha: z.string(), url: z.string(), status: z.string(),
  conclusion: z.string().nullable(), workflowName: z.string(),
});
const viewSchema = runSchema.extend({ jobs: z.array(z.object({
  databaseId: z.number(), name: z.string(), status: z.string(), conclusion: z.string().nullable(),
  startedAt: z.string(), completedAt: z.string(),
})) });
const artifactsSchema = z.object({ total_count: z.number(), artifacts: z.array(z.object({
  id: z.number(), name: z.string(), size_in_bytes: z.number(), expired: z.boolean(),
})) });

function command(executable: string, args: string[], input?: string): string {
  const child = spawnSync(executable, args, { encoding: "utf8", input, timeout: 120000, maxBuffer: 2 * 1024 * 1024 });
  if (child.error || child.status !== 0) throw new Error(child.error?.message ?? (child.stderr.trim() || `${executable} failed`));
  return child.stdout.trim();
}

function json(executable: string, args: string[]): unknown {
  return JSON.parse(command(executable, args));
}

export async function platformBuildOperator(args: string[]): Promise<Record<string, unknown>> {
  const [action = "help", ...flags] = args;
  if (action === "help" || action === "--help") return { environment: "github-actions", help: platformBuildHelp };
  if (action === "cleanup") return platformCleanupOperator(flags);
  const options = new Map<string, string>();
  for (let index = 0; index < flags.length; index++) {
    const flag = flags[index];
    if (flag === "--json") continue;
    const value = flags[++index];
    if (!["--ref", "--run"].includes(flag) || !value || value.startsWith("--") || options.has(flag)) throw new Error(`Invalid option ${flag}`);
    options.set(flag, value);
  }
  if (!["start", "status"].includes(action)) throw new Error("Use platforms start or status.");
  if (action === "start" && (options.size !== 1 || !options.has("--ref"))) throw new Error("Start requires --ref build/NAME only.");
  if (action === "status" && (options.size !== 1 || !/^\d+$/.test(options.get("--run") ?? ""))) throw new Error("Status requires a numeric --run only.");
  const ref = options.get("--ref") ?? "";
  if (action === "start") {
    if (!/^build\/[a-z0-9][a-z0-9._/-]{0,90}$/.test(ref)) throw new Error("Build references must use build/NAME with lowercase letters, numbers, dots, slashes or dashes.");
    command("git", ["check-ref-format", `refs/heads/${ref}`]);
  }
  const { nameWithOwner: repository } = z.object({ nameWithOwner: z.string() }).parse(json("gh", ["repo", "view", "--json", "nameWithOwner"]));
  if (action === "status") {
    const id = options.get("--run") ?? "";
    const run = viewSchema.parse(json("gh", ["run", "view", id, "--repo", repository, "--json", "databaseId,headSha,url,status,conclusion,workflowName,jobs"]));
    if (run.workflowName !== "Platform builds") throw new Error("This run is not the platform build workflow.");
    const artifacts = artifactsSchema.parse(json("gh", ["api", `repos/${repository}/actions/runs/${id}/artifacts?per_page=100`]));
    const complete = run.status === "completed";
    const failed = run.jobs.some((job) => ["failure", "cancelled", "timed_out", "action_required"].includes(job.conclusion ?? ""));
    return {
      environment: "github-actions", repository, success: !failed && (!complete || run.conclusion === "success"), run,
      buildComplete: complete, buildPassed: failed ? false : complete ? run.conclusion === "success" : null,
      artifacts: artifacts.artifacts, artifactsTruncated: artifacts.total_count > artifacts.artifacts.length,
    };
  }
  if (command("git", ["status", "--porcelain"])) throw new Error("Commit or preserve outstanding work before starting an exact platform build.");
  const sourceSha = command("git", ["rev-parse", "HEAD"]);
  const tree = command("git", ["rev-parse", "HEAD^{tree}"]);
  command("git", ["fetch", "origin", "main"]);
  const parent = command("git", ["rev-parse", "origin/main"]);
  const existing = command("git", ["ls-remote", "origin", `refs/heads/${ref}`]).split(/\s+/)[0];
  let snapshotSha: string;
  if (existing) {
    command("git", ["fetch", "origin", ref]);
    if (command("git", ["rev-parse", "FETCH_HEAD^{tree}"]) !== tree) throw new Error("This build reference has a different tree; choose a new reference.");
    snapshotSha = existing;
  } else {
    snapshotSha = command("git", ["commit-tree", tree, "-p", parent], `Build the committed tree from ${sourceSha}\n\nIsolated artifact build snapshot; local branch history is unchanged.\n`);
    command("git", ["push", "origin", `${snapshotSha}:refs/heads/${ref}`]);
  }
  for (let attempt = 0; attempt < 10; attempt++) {
    const runs = z.array(runSchema).parse(json("gh", ["run", "list", "--repo", repository, "--branch", ref, "--limit", "10", "--json", "databaseId,headSha,url,status,conclusion,workflowName"]));
    const run = runs.find((item) => item.headSha === snapshotSha && item.workflowName === "Platform builds");
    if (run) return { environment: "github-actions", success: true, repository, ref, sourceSha, snapshotSha, run };
    await delay(2000);
  }
  return { environment: "github-actions", success: true, repository, ref, sourceSha, snapshotSha, run: null, state: "awaiting-workflow", message: "The build reference exists; retry start with the same ref to locate the run without another push." };
}
