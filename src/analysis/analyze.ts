import {
  ANALYSIS_LIMITS,
  REPORT_SCHEMA_VERSION,
  RULESET_VERSION,
  TOKEN_ESTIMATE_METHOD,
} from "../constants.js";
import { ScopeglassError } from "../error.js";
import type {
  AnalyzeOptions,
  InstructionRecord,
  ScopeglassReportV1,
  ScopeRecord,
  TokenEstimate,
} from "../types.js";
import {
  collectInstructionDiagnostics,
  finalizeDiagnostics,
  summarizeReport,
  type DiagnosticCandidate,
} from "./diagnostics.js";
import { discoverScopeChain } from "./discovery.js";
import { extractMarkdownScope, type ExtractedReference } from "./markdown.js";
import { collectReferenceDiagnostics } from "./references.js";

function tokenEstimate(bytes: number): TokenEstimate {
  return {
    method: TOKEN_ESTIMATE_METHOD,
    bytes,
    total: Math.ceil(bytes / 3),
  };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareInstructions(
  left: InstructionRecord,
  right: InstructionRecord,
): number {
  return (
    left.precedence - right.precedence ||
    left.source.startLine - right.source.startLine ||
    left.source.endLine - right.source.endLine ||
    compareText(left.id, right.id)
  );
}

function enforceReportLimit(
  count: number,
  added: number,
  limit: number,
  code: "instruction-limit-exceeded" | "reference-limit-exceeded",
  path: string,
): void {
  if (added > limit - count) {
    throw new ScopeglassError(
      code,
      code === "instruction-limit-exceeded"
        ? `The report contains more than ${limit} instructions.`
        : `The report contains more than ${limit} local references.`,
      { path },
    );
  }
}

export async function analyzeScope(
  target?: string,
  options?: AnalyzeOptions,
): Promise<ScopeglassReportV1> {
  const discovery = await discoverScopeChain(target, options);
  const scopes: ScopeRecord[] = [];
  const instructions: InstructionRecord[] = [];
  const references: ExtractedReference[] = [];

  for (const discoveredScope of discovery.scopes) {
    const scopeId = `scope:${discoveredScope.path}`;
    const extracted = extractMarkdownScope({
      scopeId,
      path: discoveredScope.path,
      precedence: discoveredScope.precedence,
      text: discoveredScope.text,
    });

    enforceReportLimit(
      instructions.length,
      extracted.instructions.length,
      ANALYSIS_LIMITS.maxInstructions,
      "instruction-limit-exceeded",
      discoveredScope.path,
    );
    enforceReportLimit(
      references.length,
      extracted.references.length,
      ANALYSIS_LIMITS.maxReferences,
      "reference-limit-exceeded",
      discoveredScope.path,
    );

    instructions.push(...extracted.instructions);
    references.push(...extracted.references);
    scopes.push({
      id: scopeId,
      path: discoveredScope.path,
      directory: discoveredScope.directory,
      depth: discoveredScope.depth,
      precedence: discoveredScope.precedence,
      tokenEstimate: tokenEstimate(discoveredScope.bytes),
      instructionIds: extracted.instructions.map(({ id }) => id),
    });
  }

  instructions.sort(compareInstructions);

  const diagnosticCandidates: DiagnosticCandidate[] = [];
  await collectReferenceDiagnostics(
    discovery.rootPath,
    references,
    diagnosticCandidates,
  );
  collectInstructionDiagnostics(instructions, diagnosticCandidates);
  const diagnostics = finalizeDiagnostics(diagnosticCandidates);

  return {
    kind: "scopeglass-report",
    schemaVersion: REPORT_SCHEMA_VERSION,
    rulesetVersion: RULESET_VERSION,
    root: ".",
    rootDiscovery: discovery.rootDiscovery,
    target: discovery.target,
    tokenEstimate: tokenEstimate(discovery.totalBytes),
    scopes,
    instructions,
    diagnostics,
    summary: summarizeReport(scopes.length, instructions.length, diagnostics),
  };
}
