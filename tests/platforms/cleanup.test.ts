import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { cleanupBuildRef, cleanupWorkflowRun, platformCleanupOperator, type CleanupCommand } from "../../scripts/platform-cleanup.ts";
import { platformBuildOperator } from "../../scripts/platform-builds.ts";

const sha = "a".repeat(40);
const movedSha = "b".repeat(40);
const repository = "owner/eko";
const ref = "build/fixture";
const remote = `https://github.com/${repository}.git`;
const successful = { id: 1, name: "Platform builds", head_branch: ref, head_sha: sha, status: "completed", conclusion: "success", html_url: `https://github.com/${repository}/actions/runs/1` };
type Run = typeof successful;
type Branch = { name: string; protected: boolean; commit: { sha: string } };
const branch: Branch = { name: ref, protected: false, commit: { sha } };
const event = { action: "completed", repository: { full_name: repository }, workflow_run: { ...successful, head_repository: { full_name: repository } } };

function fixture(options: {
  branches?: (Branch | null)[]; runs?: Run[][]; total?: number; pushFails?: boolean; readbackFails?: boolean;
  repo?: string; defaultBranch?: string; origin?: string;
} = {}) {
  const calls: { executable: string; args: string[] }[] = [];
  const branches = [...(options.branches ?? [branch, branch, branch, null])];
  let branchReads = 0;
  let runReads = 0;
  let pushed = false;
  function response(body: unknown, status = 200) {
    return { status: status === 200 ? 0 : 1, stdout: `HTTP/2.0 ${status} OK\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(body)}`, stderr: "" };
  }
  const command: CleanupCommand = (executable, args) => {
    calls.push({ executable, args });
    if (executable === "git") {
      if (args[0] === "check-ref-format") return { status: 0, stdout: "", stderr: "" };
      if (args[0] === "remote") return { status: 0, stdout: options.origin ?? remote, stderr: "" };
      assert.equal(args[0], "push", `Unexpected git command ${args}`);
      assert.deepEqual(args, ["push", "--porcelain", `--force-with-lease=refs/heads/${ref}:${sha}`, remote, `:refs/heads/${ref}`]);
      pushed = true;
      return { status: options.pushFails ? 1 : 0, stdout: "", stderr: options.pushFails ? "lease rejected or connection lost" : "" };
    }
    assert.equal(executable, "gh");
    if (args[0] === "repo") {
      assert.deepEqual(args, ["repo", "view", options.origin ?? remote, "--json", "nameWithOwner,defaultBranchRef"]);
      return { status: 0, stdout: JSON.stringify({ nameWithOwner: options.repo ?? repository, defaultBranchRef: { name: options.defaultBranch ?? "main" } }), stderr: "" };
    }
    assert.deepEqual(args.slice(0, 4), ["api", "--include", "--hostname", "github.com"]);
    const path = args[4];
    if (path === `repos/${options.repo ?? repository}/branches/${encodeURIComponent(ref)}`) {
      if (pushed && options.readbackFails) return response({ message: "denied" }, 403);
      const found = branches[Math.min(branchReads++, branches.length - 1)];
      return found ? response(found) : response({ message: "Branch not found" }, 404);
    }
    const url = new URL(`https://api.github.com/${path}`);
    assert.equal(url.pathname, `/repos/${options.repo ?? repository}/actions/runs`);
    assert.equal(url.searchParams.get("branch"), ref);
    assert.equal(url.searchParams.get("per_page"), "100");
    assert.equal(url.searchParams.has("head_sha"), false, "Active runs at older SHAs must also block deletion");
    assert.equal(url.searchParams.has("workflow"), false);
    const page = Number(url.searchParams.get("page"));
    if (page === 1) runReads++;
    const runs = options.runs?.[Math.min(runReads - 1, options.runs.length - 1)] ?? [successful];
    return response({ total_count: options.total ?? runs.length, workflow_runs: runs.slice((page - 1) * 100, page * 100) });
  };
  return { command, calls, pushes: () => calls.filter((call) => call.executable === "git" && call.args[0] === "push") };
}

test("successful automatic cleanup deletes only the leased branch and verifies absence", () => {
  const f = fixture();
  const result = cleanupWorkflowRun(event, repository, f.command);
  assert.equal(result.state, "deleted");
  assert.equal(result.success, true);
  assert.equal(result.repository, repository);
  assert.equal(result.headSha, sha);
  assert.equal(result.readback, "missing");
  assert.equal(f.pushes().length, 1);
  assert.match(f.calls.at(-1)?.args[4] ?? "", /\/branches\/build%2Ffixture$/);
});

for (const status of ["queued", "in_progress", "requested", "waiting", "pending", "unknown_future_status"]) {
  test(`preserves the ref while a sibling Release is ${status}, including at an older SHA`, () => {
    const sibling = { ...successful, id: 2, name: "Release", status, conclusion: "", head_sha: movedSha };
    const f = fixture({ runs: [[successful, sibling]] });
    const result = cleanupBuildRef({ ref }, f.command);
    assert.equal(result.state, "active-runs");
    assert.equal(result.success, false);
    assert.equal(f.pushes().length, 0);
  });
}

test("automatic guarded skips succeed while preserving an active sibling", () => {
  const f = fixture({ runs: [[successful, { ...successful, id: 2, name: "Release", status: "in_progress" }]] });
  const result = cleanupWorkflowRun(event, repository, f.command);
  assert.equal(result.state, "active-runs");
  assert.equal(result.success, true);
  assert.equal(result.skipped, true);
  assert.equal(f.pushes().length, 0);
});

test("a sibling starting between checks blocks deletion", () => {
  const f = fixture({ runs: [[successful], [successful, { ...successful, id: 2, name: "Other workflow", status: "queued" }]] });
  assert.equal(cleanupBuildRef({ ref }, f.command).state, "active-runs");
  assert.equal(f.pushes().length, 0);
});

test("a completed Release can trigger the same cleanup", () => {
  const release = { ...successful, name: "Release" };
  const f = fixture({ runs: [[release]] });
  assert.equal(cleanupWorkflowRun({ ...event, workflow_run: { ...event.workflow_run, name: "Release" } }, repository, f.command).state, "deleted");
});

test("stale automatic run cannot delete a moved branch", () => {
  const f = fixture({ branches: [{ ...branch, commit: { sha: movedSha } }] });
  assert.equal(cleanupWorkflowRun(event, repository, f.command).state, "moved");
  assert.equal(f.pushes().length, 0);
});

for (const position of [1, 2]) {
  test(`a branch moving during check ${position} is preserved`, () => {
    const branches = [branch, branch, branch];
    branches[position] = { ...branch, commit: { sha: movedSha } };
    const f = fixture({ branches });
    const result = cleanupBuildRef({ ref }, f.command);
    assert.equal(result.state, "moved");
    assert.equal(result.currentSha, movedSha);
    assert.equal(f.pushes().length, 0);
  });
}

for (const invalid of ["main", "refs/heads/build/fixture", "refs/tags/build/fixture", "tags/v1", "feature/fixture", "build/", "--all"]) {
  test(`rejects ${invalid} before accessing GitHub`, () => {
    const f = fixture();
    const result = cleanupBuildRef({ ref: invalid }, f.command);
    assert.equal(result.success, false);
    assert.equal(f.calls.length, 0);
  });
}

test("missing branches are idempotent without workflow reads or deletion", () => {
  const f = fixture({ branches: [null] });
  const result = cleanupBuildRef({ ref }, f.command);
  assert.equal(result.state, "missing");
  assert.equal(result.success, true);
  assert.equal(result.headSha, null);
  assert.equal(f.calls.filter((call) => call.args[4]?.includes("actions/runs")).length, 0);
  assert.equal(f.pushes().length, 0);
});

test("dry run returns full eligibility evidence without a deletion", () => {
  const f = fixture();
  const result = platformCleanupOperator(["--ref", ref, "--dry-run", "--json"], f.command);
  assert.equal(result.state, "eligible");
  assert.equal(result.success, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.deletionAttempted, false);
  assert.equal(f.calls.filter((call) => call.args[4]?.includes("actions/runs")).length, 2);
  assert.equal(f.pushes().length, 0);
});

test("protection at initial or final check prevents deletion, even for the default branch", () => {
  for (const options of [{ branches: [{ ...branch, protected: true }] }, { branches: [branch, branch, { ...branch, protected: true }] }, { defaultBranch: ref }]) {
    const f = fixture(options);
    assert.equal(cleanupBuildRef({ ref }, f.command).state, "protected");
    assert.equal(f.pushes().length, 0);
  }
});

test("pagination finds an active run beyond the first page", () => {
  const runs = Array.from({ length: 101 }, (_, index) => ({ ...successful, id: index + 1, status: index === 100 ? "waiting" : "completed" }));
  const f = fixture({ runs: [runs] });
  assert.equal(cleanupBuildRef({ ref }, f.command).state, "active-runs");
  assert.ok(f.calls.some((call) => call.args[4]?.endsWith("page=2")));
  assert.equal(f.pushes().length, 0);
});

test("large or incomplete GitHub history fails closed", () => {
  for (const total of [1000, 1001, 2]) {
    const f = fixture({ total });
    const result = cleanupBuildRef({ ref }, f.command);
    assert.equal(result.state, "error");
    assert.equal(result.success, false);
    assert.equal(f.pushes().length, 0);
  }
});

test("manual cleanup can delete terminal failed runs; automatic cleanup preserves them", () => {
  const failed = { ...successful, id: 2, name: "Release", conclusion: "failure" };
  const manual = fixture({ runs: [[failed]] });
  assert.equal(cleanupBuildRef({ ref }, manual.command).state, "deleted");
  const automatic = fixture({ runs: [[successful, failed]] });
  assert.equal(cleanupWorkflowRun(event, repository, automatic.command).state, "failed-runs");
  assert.equal(automatic.pushes().length, 0);
});

test("failed, foreign, non-build and unexpected automatic triggers never access GitHub", () => {
  const events = [
    { ...event, workflow_run: { ...event.workflow_run, conclusion: "failure" } },
    { ...event, workflow_run: { ...event.workflow_run, head_repository: { full_name: "fork/eko" } } },
    { ...event, repository: { full_name: "fork/eko" } },
    { ...event, workflow_run: { ...event.workflow_run, head_branch: "main" } },
    { ...event, workflow_run: { ...event.workflow_run, name: "Other workflow" } },
    { ...event, action: "requested" },
  ];
  for (const input of events) {
    const f = fixture();
    assert.equal(cleanupWorkflowRun(input, repository, f.command).state, "skipped");
    assert.equal(f.calls.length, 0);
  }
});

test("automatic cleanup validates origin repository and refreshes the trigger status", () => {
  const foreign = fixture({ repo: "other/eko" });
  assert.equal(cleanupWorkflowRun(event, repository, foreign.command).state, "repository-mismatch");
  assert.equal(foreign.pushes().length, 0);
  const rerun = fixture({ runs: [[{ ...successful, status: "in_progress" }]] });
  assert.equal(cleanupWorkflowRun(event, repository, rerun.command).state, "active-runs");
  const missing = fixture({ runs: [[]] });
  assert.equal(cleanupWorkflowRun(event, repository, missing.command).state, "trigger-not-successful");
});

test("a lease rejection preserves a branch moved just before deletion", () => {
  const f = fixture({ branches: [branch, branch, branch, { ...branch, commit: { sha: movedSha } }], pushFails: true });
  const result = cleanupBuildRef({ ref }, f.command);
  assert.equal(result.state, "moved");
  assert.equal(result.success, false);
  assert.equal(f.pushes().length, 1);
});

test("uncertain deletion is resolved by readback and can be retried safely", () => {
  const f = fixture({ pushFails: true });
  const result = cleanupBuildRef({ ref }, f.command);
  assert.equal(result.state, "deleted");
  assert.equal(result.deletionReportedSuccess, false);
  assert.equal(cleanupBuildRef({ ref }, f.command).state, "missing");
  assert.equal(f.pushes().length, 1);
});

test("a successful transport alone is not proof of deletion", () => {
  const f = fixture({ branches: [branch] });
  const result = cleanupBuildRef({ ref }, f.command);
  assert.equal(result.state, "delete-failed");
  assert.equal(result.success, false);
  assert.equal(result.readback, "present");
});

test("failed readback is incomplete, not deletion success", () => {
  const f = fixture({ readbackFails: true });
  const result = cleanupBuildRef({ ref }, f.command);
  assert.equal(result.state, "error");
  assert.equal(result.success, false);
  assert.equal(result.deletionAttempted, true);
  assert.equal(f.pushes().length, 1);
});

test("cleanup rejects unsupported or ambiguous flags", () => {
  for (const flags of [[], ["--ref"], ["--ref", ref, "--all"], ["--ref", ref, "--run", "1"], ["--ref", ref, "--ref", ref]]) {
    const f = fixture();
    assert.throws(() => platformCleanupOperator(flags, f.command));
    assert.equal(f.calls.length, 0);
  }
});

test("operator discovery and cleanup routing are exposed without remote access", async () => {
  const help = await platformBuildOperator(["--help"]);
  assert.match(String(help.help), /cleanup --ref build\/NAME/);
  const result = await platformBuildOperator(["cleanup", "--ref", "main", "--json"]);
  assert.equal(result.success, false);
});

test("automatic workflow runs only trusted code and passes event data through the event file", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/cleanup-build-branches.yml", import.meta.url), "utf8");
  assert.match(workflow, /workflows: \['Platform builds', 'Release'\]/);
  assert.match(workflow, /types: \[completed\]/);
  assert.match(workflow, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /contents: write/);
  assert.match(workflow, /actions: read/);
  assert.match(workflow, /--ignore-scripts/);
  assert.doesNotMatch(workflow, /ref:.*workflow_run|download-artifact|cache:|restore-cache/);
  assert.match(workflow, /run: pnpm exec tsx scripts\/cleanup-build-workflow\.ts/);
  assert.doesNotMatch(workflow, /run:.*\$\{\{/);
});
