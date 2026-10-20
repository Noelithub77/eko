import { readFileSync } from "node:fs";
import { cleanupWorkflowRun } from "./platform-cleanup.ts";

try {
  const path = process.env.GITHUB_EVENT_PATH;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!path || !repository || process.env.GITHUB_EVENT_NAME !== "workflow_run") throw new Error("Requires a GitHub workflow_run event and repository.");
  const event: unknown = JSON.parse(readFileSync(path, "utf8"));
  const result = cleanupWorkflowRun(event, repository);
  console.log(JSON.stringify(result));
  if (result.success !== true) process.exitCode = 1;
} catch (error) {
  console.log(JSON.stringify({ environment: "github-actions", operation: "cleanup-build-ref", success: false, error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
}
