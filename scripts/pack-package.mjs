import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const artifactDirectory = path.join(repositoryRoot, ".artifacts");
const packageJson = JSON.parse(
  await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
);

function runNpm(args) {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath !== undefined) {
    return execFileSync(process.execPath, [npmExecPath, ...args], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });
  }

  return execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
}

await rm(artifactDirectory, { recursive: true, force: true });
await mkdir(artifactDirectory, { recursive: true });

const packed = JSON.parse(
  runNpm([
    "pack",
    ".",
    "--ignore-scripts",
    "--json",
    "--pack-destination",
    artifactDirectory,
  ]),
);

if (!Array.isArray(packed) || packed.length !== 1) {
  throw new Error("npm pack did not produce exactly one package artifact.");
}

const [entry] = packed;
if (
  typeof entry !== "object" ||
  entry === null ||
  entry.name !== packageJson.name ||
  entry.version !== packageJson.version ||
  typeof entry.filename !== "string" ||
  path.basename(entry.filename) !== entry.filename ||
  !entry.filename.endsWith(".tgz")
) {
  throw new Error("npm pack returned an unexpected artifact manifest.");
}

const tarballPath = path.join(artifactDirectory, entry.filename);
const tarball = await readFile(tarballPath);
const manifest = {
  name: entry.name,
  version: entry.version,
  filename: entry.filename,
  size: tarball.byteLength,
  sha256: createHash("sha256").update(tarball).digest("hex"),
};

await writeFile(
  path.join(artifactDirectory, "manifest.json"),
  `${JSON.stringify(manifest, undefined, 2)}\n`,
  { encoding: "utf8", mode: 0o600 },
);

process.stdout.write(
  `Packed ${path.relative(repositoryRoot, tarballPath)} (${manifest.sha256}).\n`,
);
