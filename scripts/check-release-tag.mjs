import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const packageJson = JSON.parse(
  await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
);
const expectedTag = `v${packageJson.version}`;

if (
  process.env.GITHUB_ACTIONS !== "true" ||
  process.env.GITHUB_REF_TYPE !== "tag" ||
  process.env.GITHUB_REF_NAME !== expectedTag
) {
  throw new Error(`Release must run from the exact ${expectedTag} tag.`);
}

process.stdout.write(`Release tag ${expectedTag} matches package.json.\n`);
