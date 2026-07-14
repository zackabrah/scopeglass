import { ANALYSIS_LIMITS } from "../constants.js";
import { ScopeglassError } from "../error.js";
import type {
  DiagnosticRecord,
  DiagnosticSeverity,
  InstructionRecord,
  ScopeglassSummary,
} from "../types.js";

export type DiagnosticCandidate = Omit<DiagnosticRecord, "id">;

const severityRank: Record<DiagnosticSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

const negativePrefixes = [
  ["do", "not"],
  ["don", "t"],
  ["must", "not"],
  ["should", "not"],
  ["never"],
  ["avoid"],
  ["forbid"],
  ["disallow"],
] as const;

const positivePrefixes = [
  ["always"],
  ["must"],
  ["should"],
  ["use"],
  ["prefer"],
  ["require"],
  ["allow"],
] as const;

type Polarity = "negative" | "positive";

interface PolarizedInstruction {
  instruction: InstructionRecord;
  order: number;
  polarity: Polarity;
  core: string;
}

function boundedCodePointCount(
  text: string,
  limit: number,
): number | undefined {
  let codePoints = 0;
  let offset = 0;
  while (offset < text.length) {
    const codePoint = text.codePointAt(offset);
    offset += codePoint !== undefined && codePoint > 0xffff ? 2 : 1;
    codePoints += 1;
    if (codePoints > limit) {
      return undefined;
    }
  }
  return codePoints;
}

interface NormalizedInstruction {
  codePoints: number;
  text: string;
}

function normalizeInstruction(text: string): NormalizedInstruction | undefined {
  if (
    boundedCodePointCount(
      text,
      ANALYSIS_LIMITS.maxDiagnosticInstructionCodePoints,
    ) === undefined
  ) {
    return undefined;
  }

  const compatibilityNormalized = text.normalize("NFKC");
  const compatibilityCodePoints = boundedCodePointCount(
    compatibilityNormalized,
    ANALYSIS_LIMITS.maxNormalizedDiagnosticCodePoints,
  );
  if (compatibilityCodePoints === undefined) {
    return undefined;
  }

  const lowerCased = compatibilityNormalized.toLowerCase();
  const lowerCasedCodePoints = boundedCodePointCount(
    lowerCased,
    ANALYSIS_LIMITS.maxNormalizedDiagnosticCodePoints,
  );
  if (lowerCasedCodePoints === undefined) {
    return undefined;
  }

  return {
    codePoints: lowerCasedCodePoints,
    text: lowerCased
      .replace(/\p{P}+/gu, " ")
      .replace(/\s+/gu, " ")
      .trim(),
  };
}

function matchingPrefixLength(
  tokens: readonly string[],
  offset: number,
  prefixes: readonly (readonly string[])[],
): number {
  for (const prefix of prefixes) {
    if (prefix.every((token, index) => tokens[offset + index] === token)) {
      return prefix.length;
    }
  }
  return 0;
}

function polarize(
  instruction: InstructionRecord,
  order: number,
  normalized: string,
): PolarizedInstruction | undefined {
  const tokens = normalized.split(" ");
  const negativeLength = matchingPrefixLength(tokens, 0, negativePrefixes);
  const positiveLength = matchingPrefixLength(tokens, 0, positivePrefixes);
  const polarity: Polarity | undefined =
    negativeLength > 0
      ? "negative"
      : positiveLength > 0
        ? "positive"
        : undefined;

  if (polarity === undefined) {
    return undefined;
  }

  let offset = polarity === "negative" ? negativeLength : positiveLength;
  let actionLength = matchingPrefixLength(tokens, offset, positivePrefixes);
  while (actionLength > 0) {
    offset += actionLength;
    actionLength = matchingPrefixLength(tokens, offset, positivePrefixes);
  }

  const core = tokens.slice(offset).join(" ");
  return core === "" ? undefined : { instruction, order, polarity, core };
}

export function appendDiagnostic(
  diagnostics: DiagnosticCandidate[],
  diagnostic: DiagnosticCandidate,
): void {
  if (diagnostics.length === ANALYSIS_LIMITS.maxDiagnostics) {
    throw new ScopeglassError(
      "diagnostic-limit-exceeded",
      "The diagnostic limit was exceeded.",
    );
  }
  diagnostics.push(diagnostic);
}

export function collectInstructionDiagnostics(
  instructions: readonly InstructionRecord[],
  diagnostics: DiagnosticCandidate[],
): void {
  const duplicateGroups = new Map<string, InstructionRecord[]>();
  const conflictGroups = new Map<
    string,
    Partial<Record<Polarity, PolarizedInstruction>>
  >();
  let normalizedCodePoints = 0;

  instructions.forEach((instruction, order) => {
    const normalization = normalizeInstruction(instruction.text);
    if (
      normalization === undefined ||
      normalization.codePoints >
        ANALYSIS_LIMITS.maxTotalNormalizedDiagnosticCodePoints -
          normalizedCodePoints
    ) {
      return;
    }
    normalizedCodePoints += normalization.codePoints;
    const normalized = normalization.text;
    if (normalized !== "") {
      const duplicateGroup = duplicateGroups.get(normalized);
      if (duplicateGroup === undefined) {
        duplicateGroups.set(normalized, [instruction]);
      } else {
        duplicateGroup.push(instruction);
      }
    }

    const polarized = polarize(instruction, order, normalized);
    if (polarized === undefined) {
      return;
    }

    const conflictGroup = conflictGroups.get(polarized.core) ?? {};
    conflictGroup[polarized.polarity] ??= polarized;
    conflictGroups.set(polarized.core, conflictGroup);
  });

  for (const duplicateGroup of duplicateGroups.values()) {
    if (duplicateGroup.length < 2) {
      continue;
    }
    appendDiagnostic(diagnostics, {
      code: "duplicate-instruction",
      severity: "info",
      message: "The same normalized instruction appears more than once.",
      sources: duplicateGroup.map(({ source }) => source),
      instructionIds: duplicateGroup.map(({ id }) => id),
    });
  }

  for (const conflictGroup of conflictGroups.values()) {
    const positive = conflictGroup.positive;
    const negative = conflictGroup.negative;
    if (positive === undefined || negative === undefined) {
      continue;
    }

    const pair =
      positive.order < negative.order
        ? [positive, negative]
        : [negative, positive];
    appendDiagnostic(diagnostics, {
      code: "possible-conflict",
      severity: "info",
      message:
        "Opposite leading polarity was found for the same normalized rule.",
      sources: pair.map(({ instruction }) => instruction.source),
      instructionIds: pair.map(({ instruction }) => instruction.id),
    });
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareDiagnostics(
  left: DiagnosticCandidate,
  right: DiagnosticCandidate,
): number {
  const leftSource = left.sources[0];
  const rightSource = right.sources[0];

  return (
    severityRank[left.severity] - severityRank[right.severity] ||
    compareText(left.code, right.code) ||
    compareText(leftSource?.path ?? "", rightSource?.path ?? "") ||
    (leftSource?.startLine ?? 0) - (rightSource?.startLine ?? 0) ||
    (leftSource?.endLine ?? 0) - (rightSource?.endLine ?? 0) ||
    compareText(
      left.instructionIds.join("\0"),
      right.instructionIds.join("\0"),
    ) ||
    compareText(left.message, right.message)
  );
}

export function finalizeDiagnostics(
  candidates: readonly DiagnosticCandidate[],
): DiagnosticRecord[] {
  return [...candidates]
    .sort(compareDiagnostics)
    .map((diagnostic, ordinal) => ({
      id: `diagnostic:${diagnostic.code}:${ordinal}`,
      ...diagnostic,
    }));
}

export function summarizeReport(
  scopeCount: number,
  instructionCount: number,
  diagnostics: readonly DiagnosticRecord[],
): ScopeglassSummary {
  const summary: ScopeglassSummary = {
    scopeCount,
    instructionCount,
    errorCount: 0,
    warningCount: 0,
    infoCount: 0,
  };

  for (const diagnostic of diagnostics) {
    if (diagnostic.severity === "error") {
      summary.errorCount += 1;
    } else if (diagnostic.severity === "warning") {
      summary.warningCount += 1;
    } else {
      summary.infoCount += 1;
    }
  }

  return summary;
}
