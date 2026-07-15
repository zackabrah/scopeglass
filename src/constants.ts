export const REPORT_SCHEMA_VERSION = 1 as const;
// Ruleset 2: AGENTS.md symlinks resolving to a regular file inside the root
// are followed, the section stack tracks root-level headings only, and
// same-line instruction ordering ties break on the numeric ordinal.
export const RULESET_VERSION = 2 as const;
export const TOKEN_ESTIMATE_METHOD = "utf8-bytes-div-3" as const;

export const ANALYSIS_LIMITS = Object.freeze({
  maxScopes: 64,
  maxFileBytes: 1_048_576,
  maxTotalBytes: 4_194_304,
  maxInstructions: 4_096,
  maxInstructionCodePoints: 131_072,
  // Section headings are copied into every instruction beneath them. Keep this
  // deliberately tight so small Markdown cannot amplify into enormous output.
  maxSectionCodePoints: 256,
  maxReferences: 2_048,
  // Reference definitions can be reused thousands of times. Bound each target
  // before retaining it to cap repeated validation and diagnostic expansion.
  maxReferenceTargetCodePoints: 4_096,
  maxReferencePathInspections: 16_384,
  // micromark retains parser events for construct markers. Bound both a single
  // scope and the complete chain before parsing so hostile marker runs cannot
  // amplify a one-megabyte file into gigabytes of transient state.
  maxMarkdownSyntaxCharactersPerFile: 16_384,
  maxMarkdownSyntaxCharactersTotal: 32_768,
  maxMarkdownDepth: 128,
  // Duplicate/conflict diagnostics are heuristic. Skip unusually long inputs
  // before Unicode normalization, then reject expanded forms from the
  // diagnostic index while preserving the instruction in the report.
  maxDiagnosticInstructionCodePoints: 1_024,
  maxNormalizedDiagnosticCodePoints: 8_192,
  maxTotalNormalizedDiagnosticCodePoints: 4_194_304,
  maxDiagnostics: 4_096,
  maxOutputBytes: 33_554_432,
});
