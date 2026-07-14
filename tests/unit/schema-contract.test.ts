import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { ANALYSIS_LIMITS } from "../../src/constants.js";

interface JsonSchema {
  $schema?: unknown;
  additionalProperties?: unknown;
  properties?: Record<string, JsonSchema>;
  required?: unknown;
}

describe("report JSON Schema", () => {
  it("is strict, deterministic, and aligned with the published limits", async () => {
    const source = await readFile(
      new URL(
        "../../schemas/scopeglass-report-v1.schema.json",
        import.meta.url,
      ),
      "utf8",
    );
    const schema = JSON.parse(source) as JsonSchema;

    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).not.toContain("generatedAt");
    expect(schema.properties?.schemaVersion).toMatchObject({ const: 1 });
    expect(schema.properties?.rulesetVersion).toMatchObject({ const: 1 });
    expect(schema.properties?.scopes).toMatchObject({
      maxItems: ANALYSIS_LIMITS.maxScopes,
    });
    expect(schema.properties?.instructions).toMatchObject({
      maxItems: ANALYSIS_LIMITS.maxInstructions,
    });
    expect(schema.properties?.diagnostics).toMatchObject({
      maxItems: ANALYSIS_LIMITS.maxDiagnostics,
    });
  });
});
