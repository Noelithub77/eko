import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const rootPath = resolve(import.meta.dirname, "..");
const packageJsonPath = resolve(rootPath, "package.json");
const tauriConfigPath = resolve(rootPath, "rust", "tauri.conf.json");
const cargoTomlPath = resolve(rootPath, "rust", "Cargo.toml");

const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
const version = getVersion(packageJson);

await updateJsonVersion(tauriConfigPath, version);
await updateCargoVersion(cargoTomlPath, version);

console.log(`Synced Eko release version to ${version}.`);

function getVersion(packageJsonValue) {
  if (
    typeof packageJsonValue !== "object" ||
    packageJsonValue === null ||
    !("version" in packageJsonValue) ||
    typeof packageJsonValue.version !== "string"
  ) {
    throw new Error("package.json must contain a string version.");
  }

  return packageJsonValue.version;
}

async function updateJsonVersion(filePath, nextVersion) {
  const rawJson = await readFile(filePath, "utf8");
  const jsonValue = JSON.parse(rawJson);

  if (typeof jsonValue !== "object" || jsonValue === null || Array.isArray(jsonValue)) {
    throw new Error(`${filePath} must contain a JSON object.`);
  }

  jsonValue.version = nextVersion;
  await writeFile(filePath, `${JSON.stringify(jsonValue, null, 2)}\n`);
}

async function updateCargoVersion(filePath, nextVersion) {
  const cargoToml = await readFile(filePath, "utf8");
  if (!/^version = "([^"]+)"$/m.test(cargoToml)) {
    throw new Error("Could not find the Cargo package version line.");
  }

  const updatedCargoToml = cargoToml.replace(
    /^version = "([^"]+)"$/m,
    `version = "${nextVersion}"`,
  );

  await writeFile(filePath, updatedCargoToml);
}
