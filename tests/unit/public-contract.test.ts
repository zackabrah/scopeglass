import { describe, expect, expectTypeOf, it } from "vitest";

import {
  ANALYSIS_LIMITS,
  REPORT_SCHEMA_VERSION,
  RULESET_VERSION,
  ScopeglassError,
  TOKEN_ESTIMATE_METHOD,
  analyze,
  type AnalyzeOptions,
  type ScopeglassErrorCode,
  type ScopeglassReportV1,
} from "../../src/index.js";

describe("public contract", () => {
  it("publishes stable versions and hard limits", () => {
    expect(REPORT_SCHEMA_VERSION).toBe(1);
    expect(RULESET_VERSION).toBe(1);
    expect(TOKEN_ESTIMATE_METHOD).toBe("utf8-bytes-div-3");
    expect(ANALYSIS_LIMITS).toEqual({
      maxScopes: 64,
      maxFileBytes: 1_048_576,
      maxTotalBytes: 4_194_304,
      maxInstructions: 4_096,
      maxInstructionCodePoints: 131_072,
      maxReferences: 2_048,
      maxMarkdownDepth: 128,
      maxDiagnostics: 4_096,
      maxOutputBytes: 33_554_432,
    });
    expect(Object.isFrozen(ANALYSIS_LIMITS)).toBe(true);
  });

  it("exposes stable typed errors", () => {
    const code: ScopeglassErrorCode = "target-not-found";
    const error = new ScopeglassError(code, "Target does not exist.", {
      path: "src/missing.ts",
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ScopeglassError");
    expect(error.code).toBe(code);
    expect(error.message).toBe("Target does not exist.");
    expect(error.path).toBe("src/missing.ts");
  });

  it("never exposes absolute paths or invisible controls in typed errors", () => {
    const error = new ScopeglassError("unreadable-file", "Unreadable.", {
      path: "/Users/alice/private\u001b\u202e.md",
    });

    expect(error.path).toBe("private\\u{1b}\\u{202e}.md");
  });

  it("keeps analyze's supported signature small", () => {
    expectTypeOf(analyze).toEqualTypeOf<
      (target?: string, options?: AnalyzeOptions) => Promise<ScopeglassReportV1>
    >();
  });
});
