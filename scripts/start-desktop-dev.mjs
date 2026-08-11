import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import os from "node:os";

const rootPath = resolve(import.meta.dirname, "..");
const targetDir = join(rootPath, "rust", "target", "desktop-dev");

function isPrivateLanAddress(address) {
  const parts = address.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }

  const isPrivate =
    parts[0] === 10 ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31);
  const isVirtualHostOnly =
    (parts[0] === 192 && parts[1] === 168 && parts[2] === 56) ||
    (parts[0] === 172 && (parts[1] === 17 || parts[1] === 18));

  return isPrivate && !isVirtualHostOnly && !address.startsWith("169.254.");
}

function getLanIp() {
  const blockedPattern = /loopback|virtual|vmware|virtualbox|hyper-v|wsl|docker|tailscale|wireguard|zerotier|vpn|tun|tap|utun|veth|br-/i;
  const preferredPattern = /wi-?fi|wlan|ethernet|lan/i;
  const candidates = [];

  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (blockedPattern.test(name)) {
      continue;
    }
    for (const addr of addrs || []) {
      if (
        (addr.family === "IPv4" || addr.family === 4) &&
        !addr.internal &&
        isPrivateLanAddress(addr.address)
      ) {
        candidates.push({ address: addr.address, score: preferredPattern.test(name) ? 100 : 0 });
      }
    }
  }

  candidates.sort((first, second) => second.score - first.score);
  const selected = candidates[0]?.address ?? "127.0.0.1";
  console.log(`[eko] selected LAN dev address: ${selected}`);
  return selected;
}

const lanIp = getLanIp();

if (process.platform === "win32") {
  const { execSync } = await import("node:child_process");
  execSync(
    `powershell -NoProfile -ExecutionPolicy Bypass -File "${join(rootPath, "scripts", "start-desktop-dev.ps1")}"`,
    { cwd: rootPath, stdio: "inherit" },
  );
} else {
  const processes = [];

  function spawnProcess(name, command, args, envOverrides) {
    const proc = spawn(command, args, {
      cwd: rootPath,
      stdio: "inherit",
      env: { ...process.env, ...envOverrides },
      shell: true,
    });
    proc.on("error", (err) => {
      console.error(`[${name}] Failed to start: ${err.message}`);
    });
    processes.push(proc);
    return proc;
  }

  const vite = spawnProcess("web-client", "npx", ["vite"], {
    PLATFORM: "web/client",
    VITE_PORT: "5174",
    WEB_CLIENT_DEV_HOST: lanIp,
  });

  await new Promise((resolve) => setTimeout(resolve, 3000));

  const tauri = spawnProcess("tauri", "npx", ["tauri", "dev"], {
    CARGO_TARGET_DIR: targetDir,
    EKO_WEB_CLIENT_DEV_URL: "http://localhost:5174",
  });

  function cleanup() {
    for (const proc of processes) {
      proc.kill();
    }
  }

  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });

  tauri.on("close", (code) => {
    cleanup();
    process.exit(code ?? 0);
  });

  vite.on("close", () => {
    // Don't exit on Vite close — Tauri dev may still be running
  });
}
