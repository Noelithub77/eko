import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const scriptArgs = process.argv.slice(2).filter((arg) => arg !== "--");
const [oldJsonFolder, newJsonFolder, outputPath, publicAssetUrl, ...platformKeys] = scriptArgs;

if (!oldJsonFolder || !newJsonFolder || !outputPath || !publicAssetUrl || platformKeys.length === 0) {
  throw new Error(
    "Usage: node scripts/merge-public-updater-json.mjs <old-json-folder> <new-json-folder> <output-path> <public-asset-url> <platform-key...>",
  );
}

const oldJson = await readOptionalLatestJson(resolve(oldJsonFolder));
const newJson = await readRequiredLatestJson(resolve(newJsonFolder));
const publicJson = withPublicAssetUrls(newJson, publicAssetUrl, platformKeys);
const mergedJson = mergeUpdaterJson(oldJson, publicJson);

await mkdir(dirname(resolve(outputPath)), { recursive: true });
await writeFile(resolve(outputPath), `${JSON.stringify(mergedJson, null, 2)}\n`);

console.log(`Wrote public updater metadata to ${outputPath}.`);

async function readOptionalLatestJson(folderPath) {
  const filePath = await findLatestJson(folderPath);
  if (!filePath) {
    return null;
  }

  return parseUpdaterJson(await readFile(filePath, "utf8"), filePath);
}

async function readRequiredLatestJson(folderPath) {
  const filePath = await findLatestJson(folderPath);
  if (!filePath) {
    throw new Error(`No latest.json file found in ${folderPath}.`);
  }

  return parseUpdaterJson(await readFile(filePath, "utf8"), filePath);
}

async function findLatestJson(folderPath) {
  let entries;
  try {
    entries = await readdir(folderPath, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    const entryPath = join(folderPath, entry.name);
    if (entry.isDirectory()) {
      const nestedPath = await findLatestJson(entryPath);
      if (nestedPath) {
        return nestedPath;
      }
    }
    if (entry.isFile() && entry.name === "latest.json") {
      return entryPath;
    }
  }

  return null;
}

function parseUpdaterJson(rawJson, filePath) {
  const jsonValue = JSON.parse(rawJson);
  if (typeof jsonValue !== "object" || jsonValue === null || Array.isArray(jsonValue)) {
    throw new Error(`${filePath} must contain a JSON object.`);
  }

  if (!("platforms" in jsonValue) || typeof jsonValue.platforms !== "object") {
    throw new Error(`${filePath} must contain updater platforms.`);
  }

  return jsonValue;
}

function withPublicAssetUrls(updaterJson, publicAssetUrl, platformKeys) {
  const platforms = { ...updaterJson.platforms };
  for (const platformKey of platformKeys) {
    const platform = platforms[platformKey];
    if (typeof platform !== "object" || platform === null || Array.isArray(platform)) {
      throw new Error(`No updater platform found for ${platformKey}.`);
    }

    platforms[platformKey] = {
      ...platform,
      url: publicAssetUrl,
    };
  }

  return {
    ...updaterJson,
    platforms,
  };
}

function mergeUpdaterJson(oldJson, newJson) {
  return {
    ...oldJson,
    ...newJson,
    platforms: {
      ...(oldJson?.platforms ?? {}),
      ...newJson.platforms,
    },
  };
}
