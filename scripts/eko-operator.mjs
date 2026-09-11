import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_OPERATOR_URL = "http://127.0.0.1:13370/__eko_operator";
const DEFAULT_LINES = 120;
const operatorUrl = process.env.EKO_OPERATOR_URL ?? DEFAULT_OPERATOR_URL;

const [command = "help", ...args] = process.argv.slice(2);

if (command === "help" || command === "--help" || command === "-h") {
  printHelp();
} else if (command === "status") {
  printJson(await readOperatorSnapshot());
} else if (command === "profiler") {
  const snapshot = await readOperatorSnapshot();
  printJson(snapshot.profiler);
} else if (command === "logs") {
  await runLogs(args);
} else if (command === "diagnostics") {
  printJson(await collectDiagnostics());
} else if (command === "watch") {
  await watchRuntime(args);
} else {
  console.error(`Unknown operator command: ${command}`);
  printHelp();
  process.exitCode = 2;
}

function printHelp() {
  console.log(`Eko Linux operator

Commands:
  status                  Read the running app session, audio, WebRTC, and profiler status.
  profiler                Read the in-memory profiler samples from the running app.
  logs [--lines N]        Read the Tauri log file.
  logs --follow           Follow new log lines until Ctrl+C.
  diagnostics             Collect app, logs, PipeWire/PulseAudio, network, journal, and crash data.
  watch                   Poll app status and print JSON changes until Ctrl+C.

Environment:
  EKO_OPERATOR_URL        Override the localhost operator endpoint.
  EKO_LOG_PATH            Override the Tauri log path.

All commands are read-only. JSON output is intended for agents and scripts.
`);
}

async function readOperatorSnapshot() {
  const response = await fetch(operatorUrl, {
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    throw new Error(`Operator endpoint returned HTTP ${response.status}`);
  }
  return await response.json();
}

async function runLogs(logArgs) {
  const follow = logArgs.includes("--follow");
  const asJson = logArgs.includes("--json");
  const lines = readNumberOption(logArgs, "--lines", DEFAULT_LINES);
  const path = logPath();

  if (follow) {
    await followLog(path, asJson);
    return;
  }

  const content = await readLog(path);
  const selected = content.split("\n").filter(Boolean).slice(-lines);
  if (asJson) {
    printJson({ path, lines: selected });
  } else {
    console.log(selected.join("\n"));
  }
}

async function collectDiagnostics() {
  const [app, log, system] = await Promise.all([
    readOperatorSnapshot().catch((error) => ({ error: errorMessage(error) })),
    readLog(logPath())
      .then((content) => ({ path: logPath(), lines: content.split("\n").filter(Boolean).slice(-DEFAULT_LINES) }))
      .catch((error) => ({ path: logPath(), error: errorMessage(error) })),
    collectSystemDiagnostics(),
  ]);

  return {
    collectedAt: new Date().toISOString(),
    operatorUrl,
    app,
    log,
    system,
  };
}

async function collectSystemDiagnostics() {
  const commands = [
    ["pactl-info", "pactl", ["info"]],
    ["pactl-default-sink", "pactl", ["get-default-sink"]],
    ["pactl-sinks", "pactl", ["list", "sinks", "short"]],
    ["pactl-sources", "pactl", ["list", "sources", "short"]],
    ["network-addresses", "ip", ["-4", "-brief", "addr"]],
    ["network-routes", "ip", ["-4", "route"]],
    ["listeners", "ss", ["-ltnup"]],
    ["user-journal", "journalctl", ["--user", "--since", "24 hours ago", "--no-pager", "-o", "short-precise"]],
    ["coredumps", "coredumpctl", ["list", "--no-pager", "--reverse", "-n", "10", "eko"]],
  ];

  const results = await Promise.all(
    commands.map(async ([name, executable, executableArgs]) => [
      name,
      await runSystemCommand(executable, executableArgs),
    ]),
  );
  return Object.fromEntries(results);
}

async function runSystemCommand(executable, executableArgs) {
  try {
    const result = await execFileAsync(executable, executableArgs, {
      timeout: 10_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      ok: false,
      code: typeof error?.code === "number" || typeof error?.code === "string" ? error.code : null,
      stdout: typeof error?.stdout === "string" ? error.stdout : "",
      stderr: typeof error?.stderr === "string" ? error.stderr : errorMessage(error),
    };
  }
}

async function watchRuntime(watchArgs) {
  const includeLogs = watchArgs.includes("--logs");
  const intervalMs = readNumberOption(watchArgs, "--interval", 2_000);
  let lastStatus = "";
  let lastLogSize = includeLogs ? await readLog(logPath()).then((content) => content.length).catch(() => 0) : 0;
  let running = false;

  const emit = async () => {
    if (running) {
      return;
    }
    running = true;
    const status = await readOperatorSnapshot().catch((error) => ({ error: errorMessage(error) }));
    const statusText = JSON.stringify(status);
    if (statusText !== lastStatus) {
      printJson({ type: "status", collectedAt: new Date().toISOString(), status });
      lastStatus = statusText;
    }

    if (includeLogs) {
      const content = await readLog(logPath()).catch(() => "");
      if (content.length < lastLogSize) {
        lastLogSize = 0;
      }
      if (content.length > lastLogSize) {
        const appended = content.slice(lastLogSize).split("\n").filter(Boolean);
        if (appended.length > 0) {
          printJson({ type: "logs", collectedAt: new Date().toISOString(), lines: appended });
        }
        lastLogSize = content.length;
      }
    }
    running = false;
  };

  await emit();
  const timer = setInterval(() => void emit(), intervalMs);
  await waitForInterrupt();
  clearInterval(timer);
}

async function followLog(path, asJson) {
  let offset = await readLog(path).then((content) => content.length).catch(() => 0);
  const emit = async () => {
    const content = await readLog(path).catch(() => "");
    if (content.length < offset) {
      offset = 0;
    }
    if (content.length > offset) {
      const lines = content.slice(offset).split("\n").filter(Boolean);
      if (asJson) {
        for (const line of lines) {
          printJson({ path, line });
        }
      } else if (lines.length > 0) {
        console.log(lines.join("\n"));
      }
      offset = content.length;
    }
  };

  await emit();
  const timer = setInterval(() => void emit(), 500);
  await waitForInterrupt();
  clearInterval(timer);
}

function logPath() {
  if (process.env.EKO_LOG_PATH) {
    return process.env.EKO_LOG_PATH;
  }
  const dataHome = process.env.XDG_DATA_HOME ?? join(os.homedir(), ".local", "share");
  return join(dataHome, "com.codialo.eko", "logs", "eko.log");
}

async function readLog(path) {
  return await fs.readFile(path, "utf8");
}

function readNumberOption(values, option, fallback) {
  const index = values.indexOf(option);
  if (index === -1) {
    return fallback;
  }
  const value = Number(values[index + 1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function waitForInterrupt() {
  return new Promise((resolve) => {
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });
}
