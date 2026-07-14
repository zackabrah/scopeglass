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
const changelog = await readFile(
  path.join(repositoryRoot, "CHANGELOG.md"),
  "utf8",
);
const expectedTag = `v${packageJson.version}`;

if (
  process.env.GITHUB_ACTIONS !== "true" ||
  process.env.GITHUB_REF_TYPE !== "tag" ||
  process.env.GITHUB_REF_NAME !== expectedTag
) {
  throw new Error(`Release must run from the exact ${expectedTag} tag.`);
}

const headingPrefix = `## [${packageJson.version}] - `;
const matchingHeadings = changelog
  .split(/\r?\n/u)
  .filter((line) => line.startsWith(headingPrefix));
const releaseDate = matchingHeadings[0]?.slice(headingPrefix.length);
const parsedDate = new Date(`${releaseDate ?? ""}T00:00:00.000Z`);
if (
  matchingHeadings.length !== 1 ||
  releaseDate === undefined ||
  !/^\d{4}-\d{2}-\d{2}$/u.test(releaseDate) ||
  Number.isNaN(parsedDate.valueOf()) ||
  parsedDate.toISOString().slice(0, 10) !== releaseDate
) {
  throw new Error(
    `CHANGELOG.md must contain exactly one dated ${packageJson.version} release heading.`,
  );
}

process.stdout.write(
  `Release tag ${expectedTag} and changelog date ${releaseDate} match package.json.\n`,
);
