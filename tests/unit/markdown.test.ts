import { describe, expect, it } from "vitest";

import { ScopeglassError } from "../../src/error.js";
import { extractMarkdownScope } from "../../src/analysis/markdown.js";

const baseInput = {
  scopeId: "scope:AGENTS.md",
  path: "AGENTS.md",
  precedence: 0,
};

describe("Markdown extraction", () => {
  it("extracts semantic instructions once with section and line provenance", () => {
    const text = [
      "# Repository",
      "",
      "Use **strict** TypeScript with `noUncheckedIndexedAccess`.",
      "",
      "- Keep modules focused.",
      "  - Test nested behavior.",
      "",
      "  Explain surprising tradeoffs.",
      "",
      "> Review security boundaries.",
      ">",
      "> - Treat input as hostile.",
      "",
      "Build",
      "-----",
      "",
      "Run the complete verification command.",
      "",
      "```sh",
      "never execute this",
      "```",
      "",
      "<div>Never an instruction.</div>",
      "",
    ].join("\n");

    const result = extractMarkdownScope({ ...baseInput, text });

    expect(
      result.instructions.map(
        ({ kind, text: instruction, section, source }) => ({
          kind,
          text: instruction,
          section,
          lines: [source.startLine, source.endLine],
        }),
      ),
    ).toEqual([
      {
        kind: "paragraph",
        text: "Use strict TypeScript with noUncheckedIndexedAccess.",
        section: ["Repository"],
        lines: [3, 3],
      },
      {
        kind: "list-item",
        text: "Keep modules focused.",
        section: ["Repository"],
        lines: [5, 5],
      },
      {
        kind: "list-item",
        text: "Test nested behavior.",
        section: ["Repository"],
        lines: [6, 6],
      },
      {
        kind: "list-item",
        text: "Explain surprising tradeoffs.",
        section: ["Repository"],
        lines: [8, 8],
      },
      {
        kind: "blockquote",
        text: "Review security boundaries.",
        section: ["Repository"],
        lines: [10, 10],
      },
      {
        kind: "blockquote",
        text: "Treat input as hostile.",
        section: ["Repository"],
        lines: [12, 12],
      },
      {
        kind: "paragraph",
        text: "Run the complete verification command.",
        section: ["Repository", "Build"],
        lines: [17, 17],
      },
    ]);
  });

  it("extracts eligible inline and reference-style links but leaves inert links out", () => {
    const text = [
      "Read [the guide](docs/guide.md?mode=full#setup).",
      "Read [the policy][policy].",
      "Ignore ![an image](images/diagram.svg).",
      "Ignore [the web](https://example.com/rules).",
      "Ignore [mail](mailto:security@example.com) and [a fragment](#local).",
      "Ignore <https://example.com/autolink> and [absolute](/etc/passwd).",
      "Flag [a Windows path](C:\\private\\rules.md).",
      "",
      "[policy]: ../POLICY.md#agents",
      "",
    ].join("\n");

    const result = extractMarkdownScope({ ...baseInput, text });

    expect(result.references).toEqual([
      {
        target: "docs/guide.md?mode=full#setup",
        source: { path: "AGENTS.md", startLine: 1, endLine: 1 },
      },
      {
        target: "../POLICY.md#agents",
        source: { path: "AGENTS.md", startLine: 2, endLine: 2 },
      },
      {
        target: "C:\\private\\rules.md",
        source: { path: "AGENTS.md", startLine: 7, endLine: 7 },
      },
    ]);
  });

  it("enforces instruction, instruction-length, reference, and AST-depth bounds", () => {
    const tooManyInstructions = Array.from(
      { length: 4_097 },
      (_, index) => `- Rule ${index}`,
    ).join("\n");
    expect(() =>
      extractMarkdownScope({ ...baseInput, text: tooManyInstructions }),
    ).toThrowError(
      expect.objectContaining({ code: "instruction-limit-exceeded" }),
    );

    const tooLongInstruction = `a${"😀".repeat(131_072)}`;
    expect(() =>
      extractMarkdownScope({ ...baseInput, text: tooLongInstruction }),
    ).toThrowError(expect.objectContaining({ code: "instruction-too-long" }));

    const tooManyReferences = Array.from(
      { length: 2_049 },
      (_, index) => `[Rule ${index}](docs/${index}.md)`,
    ).join("\n\n");
    expect(() =>
      extractMarkdownScope({ ...baseInput, text: tooManyReferences }),
    ).toThrowError(
      expect.objectContaining({ code: "reference-limit-exceeded" }),
    );

    const tooDeep = `${"> ".repeat(129)}Deep rule.`;
    expect(() =>
      extractMarkdownScope({ ...baseInput, text: tooDeep }),
    ).toThrowError(
      expect.objectContaining({ code: "markdown-depth-exceeded" }),
    );
  });

  it("throws only ScopeglassError for expected parsing limits", () => {
    try {
      extractMarkdownScope({
        ...baseInput,
        text: `a${"b".repeat(131_072)}`,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ScopeglassError);
      return;
    }

    throw new Error("Expected extraction to fail.");
  });
});
