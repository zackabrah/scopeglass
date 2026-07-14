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
const schemaPath = path.join(
  repositoryRoot,
  "schemas",
  "scopeglass-report-v1.schema.json",
);
const schema = JSON.parse(await readFile(schemaPath, "utf8"));

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(schema);
const { analyze } = await import(
  pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
);
const report = await analyze(
  path.join(fixtureRoot, "packages", "payments", "src", "charge.ts"),
  { root: fixtureRoot },
);

if (!validate(report)) {
  throw new Error(
    `Generated golden report does not match the shipped Draft 2020-12 schema:\n${JSON.stringify(validate.errors, undefined, 2)}`,
  );
}

process.stdout.write(
  `Validated generated golden report against ${path.relative(repositoryRoot, schemaPath)}.\n`,
);
