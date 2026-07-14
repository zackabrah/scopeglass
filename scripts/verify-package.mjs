import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  lstat,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import { fromMarkdown } from "mdast-util-from-markdown";

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

async function markdownFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await markdownFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(entryPath);
    }
  }
  return files;
}

function localMarkdownTargets(markdown) {
  const targets = [];
  const stack = [fromMarkdown(markdown)];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) continue;
    if (
      (node.type === "link" ||
        node.type === "image" ||
        node.type === "definition") &&
      typeof node.url === "string"
    ) {
      const pathEnd = node.url.search(/[?#]/u);
      const target = pathEnd === -1 ? node.url : node.url.slice(0, pathEnd);
      if (
        target !== "" &&
        !target.startsWith("/") &&
        !/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(target)
      ) {
        targets.push(target);
      }
    }
    if (Array.isArray(node.children)) {
      stack.push(...node.children);
    }
  }
  return targets;
}

async function assertPackedMarkdownLinks(installedRoot) {
  for (const markdownPath of await markdownFiles(installedRoot)) {
    const markdown = await readFile(markdownPath, "utf8");
    for (const encodedTarget of localMarkdownTargets(markdown)) {
      let target;
      try {
        target = decodeURIComponent(encodedTarget);
      } catch {
        throw new Error(
          `Packed documentation has an invalid link in ${path.relative(installedRoot, markdownPath)}.`,
        );
      }
      const resolvedTarget = path.resolve(path.dirname(markdownPath), target);
      const relativeTarget = path.relative(installedRoot, resolvedTarget);
      if (
        path.isAbsolute(relativeTarget) ||
        relativeTarget === ".." ||
        relativeTarget.startsWith(`..${path.sep}`)
      ) {
        throw new Error(
          `Packed documentation link escapes the package: ${path.relative(installedRoot, markdownPath)} -> ${encodedTarget}`,
        );
      }
      try {
        await lstat(resolvedTarget);
      } catch {
        throw new Error(
          `Packed documentation link is missing: ${path.relative(installedRoot, markdownPath)} -> ${encodedTarget}`,
        );
      }
    }
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
  await assertPackedMarkdownLinks(installedRoot);

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
  run(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      'const [reportSchema, checkSchema] = await Promise.all([import("scopeglass/schema/report-v1.json", { with: { type: "json" } }), import("scopeglass/schema/check-result-v1.json", { with: { type: "json" } })]); if (reportSchema.default.properties.kind.const !== "scopeglass-report" || checkSchema.default.properties.kind.const !== "scopeglass-check") process.exit(1);',
    ],
    smokeDirectory,
  );

  const installedReportSchema = JSON.parse(
    await readFile(
      path.join(installedRoot, "schemas", "scopeglass-report-v1.schema.json"),
      "utf8",
    ),
  );
  const installedCheckResultSchema = JSON.parse(
    await readFile(
      path.join(
        installedRoot,
        "schemas",
        "scopeglass-check-result-v1.schema.json",
      ),
      "utf8",
    ),
  );
  if (
    installedReportSchema.$schema !==
      "https://json-schema.org/draft/2020-12/schema" ||
    installedCheckResultSchema.$schema !==
      "https://json-schema.org/draft/2020-12/schema"
  ) {
    throw new Error(
      "The clean install is missing a Draft 2020-12 public schema.",
    );
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
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  ajv.addSchema(installedReportSchema);
  const validateReport = ajv.getSchema(installedReportSchema.$id);
  const validateCheckResult = ajv.compile(installedCheckResultSchema);
  if (validateReport === undefined || !validateReport(report)) {
    throw new Error(
      `The installed schema rejected the installed package's golden report:\n${JSON.stringify(validateReport?.errors, undefined, 2)}`,
    );
  }

  const installedCheck = spawnSync(
    process.execPath,
    [
      path.join(installedRoot, "dist", "cli.js"),
      "check",
      path.join(fixtureRoot, "packages", "payments", "src", "charge.ts"),
      "--root",
      fixtureRoot,
      "--format",
      "json",
      "--fail-on",
      "error",
      "--max-tokens",
      "0",
    ],
    {
      cwd: smokeDirectory,
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
    },
  );
  if (installedCheck.error !== undefined) {
    throw installedCheck.error;
  }
  if (installedCheck.status !== 1 || installedCheck.stderr !== "") {
    throw new Error(
      "The installed check command did not produce a clean policy-failure payload.",
    );
  }
  const checkResult = JSON.parse(installedCheck.stdout);
  if (!validateCheckResult(checkResult)) {
    throw new Error(
      `The installed check-result schema rejected installed CLI output:\n${JSON.stringify(validateCheckResult.errors, undefined, 2)}`,
    );
  }
} finally {
  await rm(smokeDirectory, { recursive: true, force: true });
}

await assertArtifactUnchanged();
process.stdout.write(
  `Verified ${manifest.filename} (${manifest.sha256}) without repacking.\n`,
);
