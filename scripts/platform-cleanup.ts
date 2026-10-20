import { spawnSync } from "node:child_process";
import { z } from "zod";

type CommandResult = { status: number | null; stdout: string; stderr: string; error?: Error };
export type CleanupCommand = (executable: string, args: string[]) => CommandResult;
const execute: CleanupCommand = (executable, args) => spawnSync(executable, args, {
  encoding: "utf8", timeout: 120000, maxBuffer: 8 * 1024 * 1024,
  env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GH_PROMPT_DISABLED: "1" },
});

const shaSchema = z.string().regex(/^[a-f0-9]{40}$/);
const repositorySchema = z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/);
const branchSchema = z.object({ name: z.string(), protected: z.boolean(), commit: z.object({ sha: shaSchema }) });
const runSchema = z.object({
  id: z.number().int().positive(), name: z.string().nullable(), head_branch: z.string().nullable(),
  head_sha: shaSchema, status: z.string(), conclusion: z.string().nullable(), html_url: z.string(),
});
const pageSchema = z.object({ total_count: z.number().int().nonnegative(), workflow_runs: z.array(runSchema) });
const eventSchema = z.object({
  action: z.string(), repository: z.object({ full_name: repositorySchema }),
  workflow_run: runSchema.extend({ head_repository: z.object({ full_name: repositorySchema }).nullable() }),
});
type Run = z.infer<typeof runSchema>;
type Branch = z.infer<typeof branchSchema>;
type Trigger = { id: number; headSha: string; repository: string };
type CleanupOptions = { ref: string; dryRun?: boolean; trigger?: Trigger };

function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }

function checked(command: CleanupCommand, executable: string, args: string[]): string {
  const result = command(executable, args);
  if (result.error || result.status !== 0) throw new Error(result.error?.message ?? (result.stderr.trim() || `${executable} failed`));
  return result.stdout.trim();
}

function validateRef(ref: string, command: CleanupCommand): void {
  if (!/^build\/[a-z0-9][a-z0-9._/-]{0,90}$/.test(ref)) throw new Error("Cleanup requires an explicit build/NAME branch; main, tags and other references are forbidden.");
  checked(command, "git", ["check-ref-format", `refs/heads/${ref}`]);
}

// GitHub's ref DELETE API has no expected-SHA parameter. Git's explicit lease
// makes the deletion conditional on the observed SHA, even after a concurrent push.
export function cleanupBuildRef(options: CleanupOptions, command: CleanupCommand = execute): Record<string, unknown> {
  const { ref, dryRun = false, trigger } = options;
  const evidence: { runChecks: { total: number; runs: Run[] }[]; branchChecks: (Branch | null)[] } = { runChecks: [], branchChecks: [] };
  const base = {
    environment: "github-actions", operation: "cleanup-build-ref", ref, dryRun,
    checkedAt: new Date().toISOString(), trigger: trigger ?? null, evidence,
  };
  let repository: string | null = null;
  let headSha: string | null = null;
  let deletionAttempted = false;
  const outcome = (state: string, success: boolean, extra: Record<string, unknown> = {}) => ({
    ...base, repository, headSha, deletionAttempted, state, success, ...extra,
  });
  try {
    validateRef(ref, command);
    const remote = checked(command, "git", ["remote", "get-url", "origin"]);
    if (!/^(https:\/\/github\.com\/|git@github\.com:)[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+(?:\.git)?$/.test(remote)) {
      throw new Error("Cleanup requires an origin on github.com without embedded credentials.");
    }
    const repo = z.object({ nameWithOwner: repositorySchema, defaultBranchRef: z.object({ name: z.string() }) })
      .parse(JSON.parse(checked(command, "gh", ["repo", "view", remote, "--json", "nameWithOwner,defaultBranchRef"])));
    repository = repo.nameWithOwner;
    if (trigger && repository.toLowerCase() !== trigger.repository.toLowerCase()) return outcome("repository-mismatch", false);
    if (ref === repo.defaultBranchRef.name) return outcome("protected", false, { reason: "default-branch" });

    function api(path: string, allowMissing = false): unknown {
      const result = command("gh", ["api", "--include", "--hostname", "github.com", `repos/${repository}/${path}`]);
      const response = /^HTTP\/\S+ (\d{3})[^\r\n]*\r?\n[\s\S]*?\r?\n\r?\n([\s\S]*)$/.exec(result.stdout);
      if (!response) throw new Error(result.error?.message ?? (result.stderr.trim() || "Missing GitHub HTTP response"));
      const status = Number(response[1]);
      if (allowMissing && status === 404) return null;
      if (result.error || result.status !== 0 || status !== 200) throw new Error(`GitHub read failed (${status}): ${path}`);
      return JSON.parse(response[2]);
    }

    function branch() {
      const body = api(`branches/${encodeURIComponent(ref)}`, true);
      const found = body === null ? null : branchSchema.parse(body);
      if (found && found.name !== ref) throw new Error("GitHub returned a different branch");
      evidence.branchChecks.push(found);
      return found;
    }

    function runs(): Run[] {
      const found = new Map<number, Run>();
      let total = 0;
      for (let page = 1; page <= 10; page++) {
        const result = pageSchema.parse(api(`actions/runs?branch=${encodeURIComponent(ref)}&per_page=100&page=${page}`));
        total = Math.max(total, result.total_count);
        if (total >= 1000) throw new Error("Workflow history reaches GitHub's 1000-result search cap; refusing incomplete evidence.");
        for (const run of result.workflow_runs) {
          if (run.head_branch !== ref) throw new Error("GitHub returned a run for a different branch");
          found.set(run.id, run);
        }
        if (result.workflow_runs.length < 100) {
          if (found.size < total) throw new Error("Workflow pagination was incomplete or changed; retry cleanup.");
          const all = [...found.values()];
          evidence.runChecks.push({ total, runs: all });
          return all;
        }
      }
      throw new Error("Workflow pagination did not finish; refusing incomplete evidence.");
    }

    const initial = branch();
    if (!initial) return outcome("missing", true);
    headSha = initial.commit.sha;
    if (initial.protected) return outcome("protected", false);
    if (trigger && trigger.headSha !== headSha) return outcome("moved", false);

    // Recheck both the complete workflow list and the live branch before mutation.
    for (let check = 0; check < 2; check++) {
      const all = runs();
      const active = all.filter((run) => run.status !== "completed");
      if (active.length) return outcome("active-runs", false, { activeRuns: active });
      if (trigger) {
        const completed = all.find((run) => run.id === trigger.id);
        if (!completed || completed.head_sha !== headSha || completed.conclusion !== "success") return outcome("trigger-not-successful", false);
        const failed = all.filter((run) => run.head_sha === headSha && !["success", "skipped", "neutral"].includes(run.conclusion ?? ""));
        if (failed.length) return outcome("failed-runs", false, { failedRuns: failed });
      }
      const latest = branch();
      if (!latest) return outcome("missing", true);
      if (latest.protected) return outcome("protected", false);
      if (latest.commit.sha !== headSha) return outcome("moved", false, { currentSha: latest.commit.sha });
    }
    if (dryRun) return outcome("eligible", true);

    const fullRef = `refs/heads/${ref}`;
    deletionAttempted = true;
    const deletion = command("git", ["push", "--porcelain", `--force-with-lease=${fullRef}:${headSha}`, remote, `:${fullRef}`]);
    // Read back even after a transport failure: deletion may already have succeeded.
    const remaining = branch();
    if (!remaining) return outcome("deleted", true, { readback: "missing", deletionReportedSuccess: !deletion.error && deletion.status === 0 });
    if (remaining.commit.sha !== headSha) return outcome("moved", false, { currentSha: remaining.commit.sha });
    return outcome("delete-failed", false, { readback: "present", error: deletion.error?.message ?? (deletion.stderr.trim() || "Branch still exists after deletion") });
  } catch (error) { return outcome("error", false, { error: message(error) }); }
}

export function platformCleanupOperator(flags: string[], command: CleanupCommand = execute): Record<string, unknown> {
  let ref: string | undefined;
  let dryRun = false;
  for (let index = 0; index < flags.length; index++) {
    const flag = flags[index];
    if (flag === "--json") continue;
    if (flag === "--dry-run" && !dryRun) { dryRun = true; continue; }
    if (flag === "--ref" && ref === undefined && flags[index + 1] && !flags[index + 1].startsWith("--")) { ref = flags[++index]; continue; }
    throw new Error(`Invalid cleanup option ${flag}; use --ref build/NAME [--dry-run] [--json].`);
  }
  if (!ref) throw new Error("Cleanup requires --ref build/NAME.");
  return cleanupBuildRef({ ref, dryRun }, command);
}

export function cleanupWorkflowRun(event: unknown, repository: string, command: CleanupCommand = execute): Record<string, unknown> {
  const parsed = eventSchema.parse(event);
  repositorySchema.parse(repository);
  const run = parsed.workflow_run;
  const base = { environment: "github-actions", operation: "cleanup-build-ref", repository, ref: run.head_branch, triggerRun: run.id };
  if (parsed.repository.full_name !== repository || run.head_repository?.full_name !== repository) return { ...base, success: true, state: "skipped", reason: "different-repository" };
  if (parsed.action !== "completed" || run.status !== "completed" || run.conclusion !== "success" || !["Platform builds", "Release"].includes(run.name ?? "")) {
    return { ...base, success: true, state: "skipped", reason: "trigger-not-successful" };
  }
  if (!run.head_branch?.startsWith("build/")) return { ...base, success: true, state: "skipped", reason: "not-build-branch" };
  const result = cleanupBuildRef({ ref: run.head_branch, trigger: { id: run.id, headSha: run.head_sha, repository } }, command);
  // Guarded skips are expected when sibling workflows or contributors still own it.
  if (["active-runs", "failed-runs", "moved", "protected", "trigger-not-successful"].includes(String(result.state))) return { ...result, success: true, skipped: true };
  return result;
}
