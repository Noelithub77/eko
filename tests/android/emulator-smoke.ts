import { spawnSync } from "node:child_process";

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { shell: true, stdio: "inherit" });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
}

run("npm", ["run", "build:mobile"]);

const adbCheck = spawnSync("adb", ["devices"], { shell: true, stdio: "pipe" });

if (adbCheck.status !== 0) {
  console.log("adb not available; mobile build smoke passed, emulator check skipped");
  process.exit(0);
}

console.log(adbCheck.stdout.toString());
console.log("android emulator smoke script ready");
