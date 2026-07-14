import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const artifactDirectory = path.join(repositoryRoot, ".artifacts");
const packageJson = JSON.parse(
  await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
);
const manifest = JSON.parse(
  await readFile(path.join(artifactDirectory, "manifest.json"), "utf8"),
);

if (
  manifest.name !== packageJson.name ||
  manifest.version !== packageJson.version ||
  typeof manifest.filename !== "string" ||
  path.basename(manifest.filename) !== manifest.filename ||
  typeof manifest.sha256 !== "string" ||
  !/^[0-9a-f]{64}$/u.test(manifest.sha256) ||
  !Number.isSafeInteger(manifest.size) ||
  manifest.size < 1
) {
  throw new Error("The package artifact manifest is invalid.");
}

const tarballPath = path.join(artifactDirectory, manifest.filename);

function run(command, args, cwd = repositoryRoot) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${path.basename(command)} exited with ${result.status}.`);
  }
}

function localNodeScript(packageName, relativePath) {
  return path.join(repositoryRoot, "node_modules", packageName, relativePath);
}

function runNpm(args, cwd) {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath !== undefined) {
    run(process.execPath, [npmExecPath, ...args], cwd);
    return;
  }
  run(process.platform === "win32" ? "npm.cmd" : "npm", args, cwd);
}

async function assertArtifactUnchanged() {
  const tarball = await readFile(tarballPath);
  const actualHash = createHash("sha256").update(tarball).digest("hex");
  if (actualHash !== manifest.sha256 || tarball.byteLength !== manifest.size) {
    throw new Error("The package artifact changed after it was packed.");
  }
}

await assertArtifactUnchanged();
run(process.execPath, [
  localNodeScript("publint", "src/cli.js"),
  "run",
  tarballPath,
  "--strict",
]);
run(process.execPath, [
  localNodeScript("@arethetypeswrong/cli", "dist/index.js"),
  tarballPath,
  "--profile",
  "esm-only",
  "--no-definitely-typed",
]);

const smokeDirectory = await mkdtemp(
  path.join(os.tmpdir(), "scopeglass-pack-"),
);
try {
  await writeFile(
    path.join(smokeDirectory, "package.json"),
    `${JSON.stringify({ private: true, type: "module" })}\n`,
    "utf8",
  );
  runNpm(
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--no-package-lock",
      tarballPath,
    ],
    smokeDirectory,
  );

  const installedRoot = path.join(
    smokeDirectory,
    "node_modules",
    manifest.name,
  );
  const installedPackage = JSON.parse(
    await readFile(path.join(installedRoot, "package.json"), "utf8"),
  );
  if (installedPackage.version !== manifest.version) {
    throw new Error("The clean install produced the wrong package version.");
  }

  run(
    process.execPath,
    [path.join(installedRoot, "dist", "cli.js"), "--version"],
    smokeDirectory,
  );
  run(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      'import { analyze } from "scopeglass"; const report = await analyze(".", { root: "." }); if (report.kind !== "scopeglass-report") process.exit(1);',
    ],
    smokeDirectory,
  );

  const installedSchema = JSON.parse(
    await readFile(
      path.join(installedRoot, "schemas", "scopeglass-report-v1.schema.json"),
      "utf8",
    ),
  );
  if (
    installedSchema.$schema !== "https://json-schema.org/draft/2020-12/schema"
  ) {
    throw new Error("The clean install is missing the Draft 2020-12 schema.");
  }

  const { analyze } = await import(
    pathToFileURL(path.join(installedRoot, "dist", "index.js")).href
  );
  const fixtureRoot = path.join(
    repositoryRoot,
    "tests",
    "fixtures",
    "hero-repository",
  );
  const report = await analyze(
    path.join(fixtureRoot, "packages", "payments", "src", "charge.ts"),
    { root: fixtureRoot },
  );
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(
    installedSchema,
  );
  if (!validate(report)) {
    throw new Error(
      `The installed schema rejected the installed package's golden report:\n${JSON.stringify(validate.errors, undefined, 2)}`,
    );
  }
} finally {
  await rm(smokeDirectory, { recursive: true, force: true });
}

await assertArtifactUnchanged();
process.stdout.write(
  `Verified ${manifest.filename} (${manifest.sha256}) without repacking.\n`,
);
