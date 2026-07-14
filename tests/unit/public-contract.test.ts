import { describe, expect, expectTypeOf, it } from "vitest";

import {
  ANALYSIS_LIMITS,
  REPORT_SCHEMA_VERSION,
  RULESET_VERSION,
  ScopeglassError,
  TOKEN_ESTIMATE_METHOD,
  analyze,
  type AnalyzeOptions,
  type RootDiscovery,
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
      maxSectionCodePoints: 256,
      maxReferences: 2_048,
      maxReferenceTargetCodePoints: 4_096,
      maxReferencePathInspections: 16_384,
      maxMarkdownSyntaxCharactersPerFile: 16_384,
      maxMarkdownSyntaxCharactersTotal: 32_768,
      maxMarkdownDepth: 128,
      maxDiagnosticInstructionCodePoints: 1_024,
      maxNormalizedDiagnosticCodePoints: 8_192,
      maxTotalNormalizedDiagnosticCodePoints: 4_194_304,
      maxDiagnostics: 4_096,
      maxOutputBytes: 33_554_432,
    });
    expect(Object.isFrozen(ANALYSIS_LIMITS)).toBe(true);
  });

  it("exposes stable typed errors", () => {
    const code: ScopeglassErrorCode = "target-not-found";
    const sectionCode: ScopeglassErrorCode = "section-too-long";
    const referenceCode: ScopeglassErrorCode = "reference-too-long";
    const referenceComplexityCode: ScopeglassErrorCode =
      "reference-complexity-exceeded";
    const complexityCode: ScopeglassErrorCode = "markdown-complexity-exceeded";
    const error = new ScopeglassError(code, "Target does not exist.", {
      path: "src/missing.ts",
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ScopeglassError");
    expect(error.code).toBe(code);
    expect(error.message).toBe("Target does not exist.");
    expect(error.path).toBe("src/missing.ts");
    expect([
      sectionCode,
      referenceCode,
      referenceComplexityCode,
      complexityCode,
    ]).toEqual([
      "section-too-long",
      "reference-too-long",
      "reference-complexity-exceeded",
      "markdown-complexity-exceeded",
    ]);
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

  it("models root-discovery marker invariants as a discriminated union", () => {
    const gitDirectory: RootDiscovery = {
      method: "git-directory",
      marker: ".git",
    };
    const gitFile: RootDiscovery = { method: "git-file", marker: ".git" };
    const explicit: RootDiscovery = { method: "explicit" };
    const fallback: RootDiscovery = { method: "target-fallback" };

    // @ts-expect-error Git discovery always carries the marker that was found.
    const missingGitMarker: RootDiscovery = { method: "git-file" };
    const markerOnExplicitRoot: RootDiscovery = {
      method: "explicit",
      // @ts-expect-error Explicit discovery never carries repository-marker data.
      marker: ".git",
    };
    const markerOnFallbackRoot: RootDiscovery = {
      method: "target-fallback",
      // @ts-expect-error Fallback discovery never carries repository-marker data.
      marker: ".git",
    };

    expect([gitDirectory, gitFile, explicit, fallback]).toHaveLength(4);
    void missingGitMarker;
    void markerOnExplicitRoot;
    void markerOnFallbackRoot;
  });
});
