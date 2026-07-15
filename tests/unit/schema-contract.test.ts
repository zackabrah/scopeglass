import { readFile } from "node:fs/promises";

import { Ajv2020, type AnySchemaObject } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import { ANALYSIS_LIMITS } from "../../src/constants.js";
import { createCheckResult } from "../../src/cli/policy.js";
import { createReportFixture } from "../fixtures/report.js";

interface JsonSchema {
  $schema?: unknown;
  additionalProperties?: unknown;
  properties?: Record<string, JsonSchema>;
  required?: unknown;
}

async function readSchema(
  filename: string,
): Promise<JsonSchema & AnySchemaObject> {
  const source = await readFile(
    new URL(`../../schemas/${filename}`, import.meta.url),
    "utf8",
  );
  return JSON.parse(source) as JsonSchema & AnySchemaObject;
}

function readReportSchema(): Promise<JsonSchema & AnySchemaObject> {
  return readSchema("scopeglass-report-v1.schema.json");
}

function readCheckResultSchema(): Promise<JsonSchema & AnySchemaObject> {
  return readSchema("scopeglass-check-result-v1.schema.json");
}

async function compileCheckResultSchema() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  ajv.addSchema(await readReportSchema());
  return ajv.compile(await readCheckResultSchema());
}

describe("report JSON Schema", () => {
  it("is strict, deterministic, and aligned with the published limits", async () => {
    const schema = await readReportSchema();

    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).not.toContain("generatedAt");
    expect(schema.properties?.["schemaVersion"]).toMatchObject({ const: 1 });
    expect(schema.properties?.["rulesetVersion"]).toMatchObject({ const: 2 });
    expect(schema.properties?.["scopes"]).toMatchObject({
      maxItems: ANALYSIS_LIMITS.maxScopes,
    });
    expect(schema.properties?.["instructions"]).toMatchObject({
      maxItems: ANALYSIS_LIMITS.maxInstructions,
    });
    expect(schema.properties?.["diagnostics"]).toMatchObject({
      maxItems: ANALYSIS_LIMITS.maxDiagnostics,
    });
  });

  it("accepts generated POSIX paths that resemble Windows path forms", async () => {
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(
      await readReportSchema(),
    );

    for (const firstComponent of ["C:foo", "\\foo"]) {
      const report = createReportFixture();
      const scopePath = `${firstComponent}/AGENTS.md`;
      const scopeId = `scope:${scopePath}`;
      report.target = `${firstComponent}/src/index.ts`;
      report.scopes[0]!.id = scopeId;
      report.scopes[0]!.path = scopePath;
      report.scopes[0]!.directory = firstComponent;
      report.scopes[0]!.depth = 1;
      report.instructions[0]!.scopeId = scopeId;
      report.instructions[0]!.source.path = scopePath;
      report.diagnostics[0]!.sources[0]!.path = scopePath;

      expect(validate(report), JSON.stringify(validate.errors)).toBe(true);
    }
  });

  it("rejects slash-rooted, dot-segment, and NUL report paths", async () => {
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(
      await readReportSchema(),
    );

    for (const target of [
      "/absolute",
      "../escape",
      "nested/../escape",
      "./relative",
      "nul\0path",
    ]) {
      const report = createReportFixture();
      report.target = target;
      expect(validate(report), target).toBe(false);
    }
  });

  it("matches the exact section-heading length boundary", async () => {
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(
      await readReportSchema(),
    );
    const report = createReportFixture();
    report.instructions[0]!.section = [
      "a".repeat(ANALYSIS_LIMITS.maxSectionCodePoints),
    ];
    expect(validate(report), JSON.stringify(validate.errors)).toBe(true);

    report.instructions[0]!.section = [
      "a".repeat(ANALYSIS_LIMITS.maxSectionCodePoints + 1),
    ];
    expect(validate(report)).toBe(false);
  });
});

describe("check-result JSON Schema", () => {
  it("strictly validates passing and failing policy results", async () => {
    const schema = await readCheckResultSchema();
    const validate = await compileCheckResultSchema();
    const report = createReportFixture();
    const passing = createCheckResult(report, "error");
    const failing = createCheckResult(report, "info", 0);

    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).not.toContain("generatedAt");
    expect(schema.properties?.["schemaVersion"]).toMatchObject({ const: 1 });
    expect(schema.properties?.["rulesetVersion"]).toMatchObject({ const: 2 });
    expect(validate(passing), JSON.stringify(validate.errors)).toBe(true);
    expect(validate(failing), JSON.stringify(validate.errors)).toBe(true);
  });

  it("rejects inconsistent policy state and undeclared fields", async () => {
    const validate = await compileCheckResultSchema();
    const result = createCheckResult(createReportFixture(), "info", 0);
    const inconsistent = structuredClone(result) as typeof result & {
      unexpected?: boolean;
    };

    inconsistent.policy.passed = true;
    expect(validate(inconsistent)).toBe(false);

    inconsistent.policy.passed = false;
    inconsistent.unexpected = true;
    expect(validate(inconsistent)).toBe(false);
  });
});
