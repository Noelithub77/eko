import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readlink, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installLocalBuild, localDeployOperator } from "../../scripts/local-deploy.ts";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "eko-local-install-"));
  const paths = { binary: join(root, "source"), icon: join(root, "icon.png"), binDirectory: join(root, "home with spaces", "bin"), dataDirectory: join(root, "data"), revision: "abc123" };
  await writeFile(paths.binary, "first release fixture");
  await writeFile(paths.icon, "icon fixture");
  return { root, paths };
}

test("installs a verified executable and quoted desktop command without launching it", async () => {
  const { root, paths } = await fixture();
  try {
    const installed = await installLocalBuild(paths);
    assert.equal(await realpath(installed.installed), installed.binary);
    assert.equal(await readFile(installed.binary, "utf8"), "first release fixture");
    assert.equal((await stat(installed.binary)).mode & 0o777, 0o755);
    assert.match(installed.sha256, /^[a-f0-9]{64}$/);
    const desktop = await readFile(installed.desktop, "utf8");
    assert.ok(desktop.includes(`Exec="${installed.installed}"`));
    assert.ok(desktop.includes("X-Eko-Local-Deploy=true"));
    const validation = spawnSync("desktop-file-validate", [installed.desktop], { encoding: "utf8" });
    if (!validation.error) assert.equal(validation.status, 0, validation.stderr);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("replaces the managed link and retains the previous executable", async () => {
  const { root, paths } = await fixture();
  try {
    const first = await installLocalBuild(paths);
    await writeFile(paths.binary, "second release fixture");
    const second = await installLocalBuild(paths);
    assert.notEqual(first.binary, second.binary);
    assert.equal(await readlink(second.installed), second.binary);
    assert.equal(await readFile(first.binary, "utf8"), "first release fixture");
    assert.equal(await readFile(second.binary, "utf8"), "second release fixture");
  } finally { await rm(root, { recursive: true, force: true }); }
});

for (const kind of ["file", "symlink", "desktop"] as const) {
  test(`preserves an unrelated ${kind}`, async () => {
    const { root, paths } = await fixture();
    try {
      await mkdir(paths.binDirectory, { recursive: true });
      const command = join(paths.binDirectory, "eko");
      const desktop = join(paths.dataDirectory, "applications", "eko.desktop");
      if (kind === "file") await writeFile(command, "unrelated command");
      if (kind === "symlink") await symlink(paths.binary, command);
      if (kind === "desktop") {
        await mkdir(join(paths.dataDirectory, "applications"), { recursive: true });
        await writeFile(desktop, "unrelated launcher");
      }
      await assert.rejects(installLocalBuild(paths), /Preserving an unrelated/);
      if (kind === "file") assert.equal(await readFile(command, "utf8"), "unrelated command");
      if (kind === "symlink") assert.equal(await readlink(command), paths.binary);
      if (kind === "desktop") assert.equal(await readFile(desktop, "utf8"), "unrelated launcher");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}

test("a missing build leaves the current install intact", async () => {
  const { root, paths } = await fixture();
  try {
    const installed = await installLocalBuild(paths);
    await rm(paths.binary);
    await assert.rejects(installLocalBuild(paths), /ENOENT/);
    assert.equal(await readlink(installed.installed), installed.binary);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("help is read-only and unknown options fail", async () => {
  assert.equal((await localDeployOperator(["--help"])).environment, "local");
  await assert.rejects(localDeployOperator(["--unknown"]), /supported options/);
});


test("replaces the existing AppImage launcher and saves its previous contents", async () => {
  const { root, paths } = await fixture();
  try {
    const applications = join(paths.dataDirectory, "applications");
    await mkdir(applications, { recursive: true });
    const previous = "[Desktop Entry]\nType=Application\nName=eko\nExec=/old/eko.appimage\nIcon=/old/eko.png\n";
    await writeFile(join(applications, "eko.desktop"), previous);
    const installed = await installLocalBuild(paths);
    const desktop = await readFile(installed.desktop, "utf8");
    assert.ok(desktop.includes(`Exec="${installed.installed}"`));
    assert.ok(desktop.includes("StartupWMClass=eko"));
    assert.ok(!desktop.includes("/old/eko.appimage"));
    assert.ok(installed.previousDesktop);
    assert.equal(await readFile(installed.previousDesktop, "utf8"), previous);
    assert.ok(["updated", "unavailable"].includes(installed.desktopDatabase));
  } finally { await rm(root, { recursive: true, force: true }); }
});
