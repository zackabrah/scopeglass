import { describe, expect, it } from "vitest";

import { compareInstructions } from "../../src/analysis/analyze.js";
import type { InstructionRecord } from "../../src/types.js";

function instruction(
  ordinal: number,
  overrides: Partial<InstructionRecord> = {},
): InstructionRecord {
  return {
    id: `instruction:0:1:${ordinal}`,
    scopeId: "scope:AGENTS.md",
    kind: "paragraph",
    text: `Rule ${ordinal}.`,
    section: [],
    precedence: 0,
    source: { path: "AGENTS.md", startLine: 1, endLine: 1 },
    tokenEstimate: { method: "utf8-bytes-div-3", bytes: 8, total: 3 },
    ...overrides,
  };
}

describe("instruction ordering", () => {
  it("breaks same-line ties by numeric ordinal, not lexicographic ID", () => {
    const records = [instruction(10), instruction(2)];

    records.sort(compareInstructions);

    expect(records.map(({ id }) => id)).toEqual([
      "instruction:0:1:2",
      "instruction:0:1:10",
    ]);
  });

  it("orders by precedence, then source lines, before any ID tiebreak", () => {
    const later = instruction(0, {
      id: "instruction:1:1:0",
      precedence: 1,
    });
    const lower = instruction(0, {
      id: "instruction:0:9:0",
      source: { path: "AGENTS.md", startLine: 9, endLine: 9 },
    });
    const records = [later, lower, instruction(0)];

    records.sort(compareInstructions);

    expect(records.map(({ id }) => id)).toEqual([
      "instruction:0:1:0",
      "instruction:0:9:0",
      "instruction:1:1:0",
    ]);
  });
});
