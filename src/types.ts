import type {
  REPORT_SCHEMA_VERSION,
  RULESET_VERSION,
  TOKEN_ESTIMATE_METHOD,
} from "./constants.js";

export interface AnalyzeOptions {
  cwd?: string;
  root?: string;
}

export interface SourceLocation {
  path: string;
  startLine: number;
  endLine: number;
}

export interface TokenEstimate {
  method: typeof TOKEN_ESTIMATE_METHOD;
  bytes: number;
  total: number;
}

export interface RootDiscovery {
  method: "explicit" | "git-directory" | "git-file" | "target-fallback";
  marker?: ".git";
}

export interface ScopeRecord {
  id: string;
  path: string;
  directory: string;
  depth: number;
  precedence: number;
  tokenEstimate: TokenEstimate;
  instructionIds: string[];
}

export type InstructionKind = "paragraph" | "list-item" | "blockquote";

export interface InstructionRecord {
  id: string;
  scopeId: string;
  kind: InstructionKind;
  text: string;
  section: string[];
  precedence: number;
  source: SourceLocation;
  tokenEstimate: TokenEstimate;
}

export type DiagnosticCode =
  | "broken-reference"
  | "unsafe-reference"
  | "duplicate-instruction"
  | "possible-conflict";

export type DiagnosticSeverity = "error" | "warning" | "info";

export interface DiagnosticRecord {
  id: string;
  code: DiagnosticCode;
  severity: DiagnosticSeverity;
  message: string;
  sources: SourceLocation[];
  instructionIds: string[];
}

export interface ScopeglassSummary {
  scopeCount: number;
  instructionCount: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
}

export interface ScopeglassReportV1 {
  kind: "scopeglass-report";
  schemaVersion: typeof REPORT_SCHEMA_VERSION;
  rulesetVersion: typeof RULESET_VERSION;
  root: ".";
  rootDiscovery: RootDiscovery;
  target: string;
  tokenEstimate: TokenEstimate;
  scopes: ScopeRecord[];
  instructions: InstructionRecord[];
  diagnostics: DiagnosticRecord[];
  summary: ScopeglassSummary;
}

export type FailOn = "error" | "warning" | "info" | "never";
export type PolicyFailure = "diagnostics" | "max-tokens";

export interface ScopeglassCheckResultV1 {
  kind: "scopeglass-check";
  schemaVersion: typeof REPORT_SCHEMA_VERSION;
  rulesetVersion: typeof RULESET_VERSION;
  report: ScopeglassReportV1;
  policy: {
    passed: boolean;
    failOn: FailOn;
    maxTokens?: number;
    failures: PolicyFailure[];
  };
}

export type ScopeglassErrorCode =
  | "invalid-option"
  | "invalid-root"
  | "target-not-found"
  | "target-outside-root"
  | "unsafe-symlink"
  | "file-too-large"
  | "total-too-large"
  | "invalid-encoding"
  | "invalid-git-marker"
  | "scope-limit-exceeded"
  | "instruction-limit-exceeded"
  | "instruction-too-long"
  | "reference-limit-exceeded"
  | "markdown-depth-exceeded"
  | "diagnostic-limit-exceeded"
  | "output-too-large"
  | "unreadable-file"
  | "write-failed";
