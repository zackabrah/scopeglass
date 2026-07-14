import { describe, expect, it, vi } from "vitest";

import {
  appendDiagnostic,
  collectInstructionDiagnostics,
  finalizeDiagnostics,
  type DiagnosticCandidate,
} from "../../src/analysis/diagnostics.js";
import { ANALYSIS_LIMITS } from "../../src/constants.js";
import type { InstructionRecord } from "../../src/types.js";

function instruction(
  id: string,
  text: string,
  startLine: number,
): InstructionRecord {
  return {
    id,
    scopeId: "scope:AGENTS.md",
    kind: "paragraph",
    text,
    section: [],
    precedence: 0,
    source: { path: "AGENTS.md", startLine, endLine: startLine },
    tokenEstimate: {
      method: "utf8-bytes-div-3",
      bytes: Buffer.byteLength(text),
      total: Math.ceil(Buffer.byteLength(text) / 3),
    },
  };
}

describe("instruction diagnostics", () => {
  it("normalizes Unicode, punctuation, case, and whitespace for exact duplicates", () => {
    const diagnostics: DiagnosticCandidate[] = [];
    collectInstructionDiagnostics(
      [
        instruction("one", "Use CAFÉ-style checks!", 1),
        instruction("two", "use cafe\u0301 style   checks.", 2),
      ],
      diagnostics,
    );

    expect(finalizeDiagnostics(diagnostics)).toMatchObject([
      {
        id: "diagnostic:duplicate-instruction:0",
        code: "duplicate-instruction",
        severity: "info",
        instructionIds: ["one", "two"],
      },
    ]);
  });

  it("flags only opposite leading polarity with an exact normalized core", () => {
    const diagnostics: DiagnosticCandidate[] = [];
    collectInstructionDiagnostics(
      [
        instruction("positive", "Always use tabs.", 1),
        instruction("negative", "Don't use tabs!", 2),
        instruction("scoped", "Do not use tabs in generated files.", 3),
        instruction("adjacent", "Tabs can improve alignment.", 4),
      ],
      diagnostics,
    );

    expect(finalizeDiagnostics(diagnostics)).toMatchObject([
      {
        code: "possible-conflict",
        severity: "info",
        instructionIds: ["positive", "negative"],
      },
    ]);
  });

  it("emits at most one linear conflict diagnostic per normalized core", () => {
    const diagnostics: DiagnosticCandidate[] = [];
    collectInstructionDiagnostics(
      [
        instruction("positive-1", "Use tabs.", 1),
        instruction("positive-2", "Always use tabs.", 2),
        instruction("negative-1", "Never use tabs.", 3),
        instruction("negative-2", "Avoid tabs.", 4),
      ],
      diagnostics,
    );

    expect(
      diagnostics.filter(({ code }) => code === "possible-conflict"),
    ).toHaveLength(1);
  });

  it("normalizes eligible instructions once and skips oversized heuristic input", () => {
    const normalize = vi.spyOn(String.prototype, "normalize");
    const diagnostics: DiagnosticCandidate[] = [];

    try {
      collectInstructionDiagnostics(
        [
          instruction("short", "Use tabs.", 1),
          instruction(
            "long",
            "ﷺ".repeat(ANALYSIS_LIMITS.maxDiagnosticInstructionCodePoints + 1),
            2,
          ),
        ],
        diagnostics,
      );

      expect(normalize).toHaveBeenCalledTimes(1);
      expect(diagnostics).toEqual([]);
    } finally {
      normalize.mockRestore();
    }
  });

  it("caps aggregate Unicode normalization before indexing later heuristics", () => {
    const diagnostics: DiagnosticCandidate[] = [];
    const exactExpandedForm = `${"ﷺ".repeat(455)}aa`;
    expect([...exactExpandedForm.normalize("NFKC")]).toHaveLength(
      ANALYSIS_LIMITS.maxNormalizedDiagnosticCodePoints,
    );
    const fillerCount =
      ANALYSIS_LIMITS.maxTotalNormalizedDiagnosticCodePoints /
      ANALYSIS_LIMITS.maxNormalizedDiagnosticCodePoints;

    collectInstructionDiagnostics(
      [
        ...Array.from({ length: fillerCount }, (_, index) =>
          instruction(`filler-${index}`, exactExpandedForm, index + 1),
        ),
        instruction("positive-after-budget", "Use tabs.", fillerCount + 1),
        instruction(
          "negative-after-budget",
          "Never use tabs.",
          fillerCount + 2,
        ),
      ],
      diagnostics,
    );

    expect(diagnostics.map(({ code }) => code)).toEqual([
      "duplicate-instruction",
    ]);
    expect(diagnostics[0]?.instructionIds).toHaveLength(fillerCount);
  });

  it("enforces the diagnostic bound before adding another result", () => {
    const diagnostic: DiagnosticCandidate = {
      code: "broken-reference",
      severity: "error",
      message: "Broken.",
      sources: [],
      instructionIds: [],
    };
    const diagnostics = Array.from({ length: 4_096 }, () => diagnostic);

    expect(() => {
      appendDiagnostic(diagnostics, diagnostic);
    }).toThrowError(
      expect.objectContaining({ code: "diagnostic-limit-exceeded" }),
    );
  });
});
