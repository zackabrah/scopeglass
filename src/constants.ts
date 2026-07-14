export const REPORT_SCHEMA_VERSION = 1 as const;
export const RULESET_VERSION = 1 as const;
export const TOKEN_ESTIMATE_METHOD = "utf8-bytes-div-3" as const;

export const ANALYSIS_LIMITS = Object.freeze({
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
