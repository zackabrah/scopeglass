import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
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
const manifest = JSON.parse(
  await readFile(
    path.join(repositoryRoot, ".artifacts", "manifest.json"),
    "utf8",
  ),
);

if (
  process.env.GITHUB_ACTIONS !== "true" ||
  process.env.GITHUB_REF_TYPE !== "tag" ||
  process.env.GITHUB_REF_NAME !== `v${packageJson.version}`
) {
  throw new Error(
    "Publishing requires the matching v<package-version> GitHub tag.",
  );
}
if (
  process.env.ACTIONS_ID_TOKEN_REQUEST_URL === undefined ||
  process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN === undefined
) {
  throw new Error("Publishing requires GitHub Actions OIDC permissions.");
}
const expectedRepositoryUrl = `git+${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}.git`;
if (packageJson.repository?.url !== expectedRepositoryUrl) {
  throw new Error(
    "package.json repository.url must match the trusted GitHub repository.",
  );
}
if (
  packageJson.publishConfig?.access !== "public" ||
  packageJson.publishConfig?.provenance !== true
) {
  throw new Error("Publishing requires public access and provenance metadata.");
}
if (
  manifest.name !== packageJson.name ||
  manifest.version !== packageJson.version ||
  typeof manifest.filename !== "string" ||
  path.basename(manifest.filename) !== manifest.filename ||
  typeof manifest.sha256 !== "string"
) {
  throw new Error("The verified package artifact manifest is invalid.");
}

const tarballPath = path.join(repositoryRoot, ".artifacts", manifest.filename);
const tarball = await readFile(tarballPath);
const actualHash = createHash("sha256").update(tarball).digest("hex");
if (actualHash !== manifest.sha256 || tarball.byteLength !== manifest.size) {
  throw new Error("The package artifact changed after verification.");
}

const npmVersion = process.env.npm_config_user_agent?.match(
  /npm\/(\d+)\.(\d+)\.(\d+)/u,
);
const npmMajor = Number(npmVersion?.[1]);
const npmMinor = Number(npmVersion?.[2]);
const npmPatch = Number(npmVersion?.[3]);
const supportsTrustedPublishing =
  npmMajor > 11 ||
  (npmMajor === 11 && (npmMinor > 5 || (npmMinor === 5 && npmPatch >= 1)));
if (!supportsTrustedPublishing) {
  throw new Error("npm trusted publishing requires npm 11.5.1 or newer.");
}

const npmExecPath = process.env.npm_execpath;
if (npmExecPath === undefined) {
  throw new Error("The publish script must be run through npm.");
}

execFileSync(
  process.execPath,
  [
    npmExecPath,
    "publish",
    tarballPath,
    "--access",
    "public",
    "--provenance",
    "--ignore-scripts",
  ],
  { cwd: repositoryRoot, stdio: "inherit" },
);
