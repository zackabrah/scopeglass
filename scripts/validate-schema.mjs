import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const fixtureRoot = path.join(
  repositoryRoot,
  "tests",
  "fixtures",
  "hero-repository",
);
const reportSchemaPath = path.join(
  repositoryRoot,
  "schemas",
  "scopeglass-report-v1.schema.json",
);
const checkResultSchemaPath = path.join(
  repositoryRoot,
  "schemas",
  "scopeglass-check-result-v1.schema.json",
);
const reportSchema = JSON.parse(await readFile(reportSchemaPath, "utf8"));
const checkResultSchema = JSON.parse(
  await readFile(checkResultSchemaPath, "utf8"),
);

const ajv = new Ajv2020({ allErrors: true, strict: true });
ajv.addSchema(reportSchema);
const validateReport = ajv.getSchema(reportSchema.$id);
const validateCheckResult = ajv.compile(checkResultSchema);
if (validateReport === undefined) {
  throw new Error("The report schema could not be registered by its $id.");
}
const { analyze } = await import(
  pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
);
const fixtureTarget = path.join(
  fixtureRoot,
  "packages",
  "payments",
  "src",
  "charge.ts",
);
const report = await analyze(fixtureTarget, { root: fixtureRoot });

if (!validateReport(report)) {
  throw new Error(
    `Generated golden report does not match the shipped Draft 2020-12 schema:\n${JSON.stringify(validateReport.errors, undefined, 2)}`,
  );
}

const checkExecution = spawnSync(
  process.execPath,
  [
    path.join(repositoryRoot, "dist", "cli.js"),
    "check",
    fixtureTarget,
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
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  },
);
if (checkExecution.error !== undefined) {
  throw checkExecution.error;
}
if (checkExecution.status !== 1 || checkExecution.stderr !== "") {
  throw new Error(
    "The golden check command did not produce a clean policy-failure payload.",
  );
}
const checkResult = JSON.parse(checkExecution.stdout);
if (!validateCheckResult(checkResult)) {
  throw new Error(
    `Generated golden check result does not match the shipped Draft 2020-12 schema:\n${JSON.stringify(validateCheckResult.errors, undefined, 2)}`,
  );
}

process.stdout.write(
  `Validated generated golden report and check result against ${path.relative(repositoryRoot, reportSchemaPath)} and ${path.relative(repositoryRoot, checkResultSchemaPath)}.\n`,
);
