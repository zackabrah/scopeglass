import { describe, expect, it } from "vitest";

import { ANALYSIS_LIMITS } from "../../src/constants.js";
import { renderHtml } from "../../src/formatters/html.js";
import { renderJson } from "../../src/formatters/json.js";
import {
  assertOutputSize,
  describeRootDiscovery,
} from "../../src/formatters/shared.js";
import {
  renderCheckTerminal,
  renderTerminal,
} from "../../src/formatters/terminal.js";
import { createReportFixture } from "../fixtures/report.js";

const csp =
  "default-src 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'; " +
  "connect-src 'none'; img-src data:; script-src 'none'; " +
  "style-src 'unsafe-inline'; form-action 'none'";

describe("trusted formatter descriptions", () => {
  it("describes every root-discovery method without repository data", () => {
    expect(describeRootDiscovery({ method: "explicit" })).toBe(
      "Root discovery: explicit --root directory.",
    );
    expect(
      describeRootDiscovery({ method: "git-directory", marker: ".git" }),
    ).toBe("Root discovery: nearest .git directory.");
    expect(describeRootDiscovery({ method: "git-file", marker: ".git" })).toBe(
      "Root discovery: nearest .git file (worktree marker).",
    );
    expect(describeRootDiscovery({ method: "target-fallback" })).toBe(
      "Root discovery: target directory fallback; no .git marker found. Use --root to include a broader directory.",
    );
  });
});

describe("JSON rendering", () => {
  it("is deterministic, pretty-printed, newline-terminated, and ANSI-free", () => {
    const report = createReportFixture();
    const output = renderJson(report);

    expect(output).toBe(`${JSON.stringify(report, null, 2)}\n`);
    expect(output).not.toContain("\u001b");
    expect(JSON.parse(output)).toEqual(report);
  });

  it("enforces the rendered-output byte ceiling", () => {
    const oversized = "x".repeat(ANALYSIS_LIMITS.maxOutputBytes + 1);

    expect(() => assertOutputSize(oversized)).toThrowError(
      expect.objectContaining({ code: "output-too-large" }),
    );
  });
});

describe("terminal rendering", () => {
  it("visibly escapes hostile controls and gutters every untrusted line", () => {
    const output = renderTerminal(createReportFixture(), { color: false });

    expect(output).toContain("Scopeglass");
    expect(output).toContain("Root discovery: nearest .git directory.");
    expect(output).toContain("1 scope · 1 instruction · 1 diagnostic");
    expect(output).toContain("│ ::error::owned\\u{a}##vso[");
    expect(output).toContain("\\u{1b}");
    expect(output).toContain("\\u{202e}");
    expect(output).not.toContain("\u001b");
    expect(output).not.toContain("\u202e");
    expect(output.endsWith("\n")).toBe(true);

    for (const line of output.split("\n")) {
      if (line.includes("::error::") || line.includes("##vso[")) {
        expect(line.startsWith("│ ")).toBe(true);
      }
    }
  });

  it("uses ANSI only when color is explicitly enabled", () => {
    expect(
      renderTerminal(createReportFixture(), { color: false }),
    ).not.toContain("\u001b[");
    const coloredOutput = renderTerminal(createReportFixture(), {
      color: true,
    });
    expect(coloredOutput).toContain("\u001b[");
    const diagnosticLine = coloredOutput
      .split("\n")
      .find((line) => line.includes("possible-conflict:"));
    expect(diagnosticLine).toContain("\u001b[");
    expect(diagnosticLine).not.toContain("\\u{1b}");
  });

  it("renders empty reports, every severity, and passing check policy", () => {
    const empty = createReportFixture();
    empty.scopes = [];
    empty.instructions = [];
    empty.diagnostics = [];
    empty.summary = {
      scopeCount: 0,
      instructionCount: 0,
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
    };

    const emptyOutput = renderTerminal(empty, { color: false });
    expect(emptyOutput).toContain("No AGENTS.md files apply.");
    expect(emptyOutput).toContain("No prose instructions were extracted.");
    expect(emptyOutput).toContain("No diagnostics.");

    const severities = createReportFixture();
    const baseDiagnostic = severities.diagnostics[0];
    if (baseDiagnostic === undefined) {
      throw new Error("Fixture diagnostic is missing.");
    }
    severities.diagnostics = [
      { ...baseDiagnostic, id: "error", severity: "error" },
      { ...baseDiagnostic, id: "warning", severity: "warning" },
    ];
    const severityOutput = renderTerminal(severities, { color: false });
    expect(severityOutput).toContain("ERROR possible-conflict");
    expect(severityOutput).toContain("WARN possible-conflict");

    const checkOutput = renderCheckTerminal(
      {
        kind: "scopeglass-check",
        schemaVersion: 1,
        rulesetVersion: 1,
        report: empty,
        policy: {
          passed: true,
          failOn: "never",
          failures: [],
        },
      },
      { color: false },
    );
    expect(checkOutput).toContain("Result: PASSED");
    expect(checkOutput).toContain("Token budget: disabled");
    expect(checkOutput).toContain("Failures: none");

    const failedCheckOutput = renderCheckTerminal(
      {
        kind: "scopeglass-check",
        schemaVersion: 1,
        rulesetVersion: 1,
        report: severities,
        policy: {
          passed: false,
          failOn: "warning",
          maxTokens: 10,
          failures: ["diagnostics", "max-tokens"],
        },
      },
      { color: false },
    );
    expect(failedCheckOutput).toContain("Result: FAILED");
    expect(failedCheckOutput).toContain("Token budget: 10");
    expect(failedCheckOutput).toContain("Failures: diagnostics, max-tokens");

    const unsectioned = createReportFixture();
    const firstInstruction = unsectioned.instructions[0];
    if (firstInstruction === undefined) {
      throw new Error("Fixture instruction is missing.");
    }
    firstInstruction.section = [];
    expect(renderTerminal(unsectioned, { color: false })).toContain(
      "[Unsectioned]",
    );
  });
});

describe("HTML rendering", () => {
  it("produces a self-contained semantic report with the exact restrictive CSP", () => {
    const output = renderHtml(createReportFixture());

    expect(output.startsWith("<!doctype html>")).toBe(true);
    expect(output).toContain(
      `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    );
    expect(output).toContain("<main");
    expect(output).toContain("<h1");
    expect(output).toContain("<details");
    expect(output).toContain('<ol class="instruction-list" role="list">');
    expect(output).toContain('<ul class="diagnostic-list" role="list">');
    expect(output).toContain(
      '<section class="metrics-region" aria-label="Analysis summary">',
    );
    expect(output).toContain('<dl class="metrics">');
    expect(output).toContain("<dt>Scopes</dt><dd>1</dd>");
    expect(output).toContain(
      '<span class="scope-instruction-count">1 instruction</span>',
    );
    expect(output).toContain(
      '<span class="scope-count" aria-hidden="true">1</span>',
    );
    expect(output).toContain("Root discovery: nearest .git directory.");
    expect(output).toContain("@media print");
    expect(output).toContain("unicode-bidi: plaintext");
    expect(output).not.toMatch(/<script(?:\s|>)/iu);
    expect(output).not.toMatch(/<[^>]+\son[a-z]+=/iu);
    expect(output).not.toMatch(/https?:\/\//iu);
    expect(output.endsWith("\n")).toBe(true);
  });

  it("pluralizes visible instruction counts and explains target fallback", () => {
    const report = createReportFixture();
    const instruction = report.instructions[0];
    const scope = report.scopes[0];
    if (instruction === undefined || scope === undefined) {
      throw new Error("Fixture instruction or scope is missing.");
    }
    report.rootDiscovery = { method: "target-fallback" };
    report.instructions.push({
      ...instruction,
      id: "instruction:0:5:1",
      source: { ...instruction.source, startLine: 5, endLine: 5 },
    });
    scope.instructionIds.push("instruction:0:5:1");

    const output = renderHtml(report);

    expect(output).toContain(
      '<span class="scope-instruction-count">2 instructions</span>',
    );
    expect(output).toContain(
      "Root discovery: target directory fallback; no .git marker found. Use --root to include a broader directory.",
    );
  });

  it("renders repository-authored markup and links only as escaped text", () => {
    const output = renderHtml(createReportFixture());

    expect(output).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(output).toContain(
      "&lt;/style&gt;&lt;script&gt;alert(1)&lt;/script&gt;",
    );
    expect(output).toContain("src/&lt;hostile&gt;&amp;file.ts");
    expect(output).not.toContain('<img src=x onerror="alert(1)">');
    expect(output).not.toContain("<script>alert(1)</script>");
  });

  it("renders empty scope/diagnostic states and diagnostics without sources", () => {
    const empty = createReportFixture();
    empty.scopes = [];
    empty.instructions = [];
    empty.diagnostics = [];
    empty.summary.scopeCount = 0;
    empty.summary.instructionCount = 0;
    const emptyOutput = renderHtml(empty);
    expect(emptyOutput).toContain("No AGENTS.md files apply to this target.");
    expect(emptyOutput).toContain("No diagnostics.");

    const report = createReportFixture();
    report.instructions = [];
    const scope = report.scopes[0];
    const diagnostic = report.diagnostics[0];
    if (scope === undefined || diagnostic === undefined) {
      throw new Error("Fixture scope or diagnostic is missing.");
    }
    scope.instructionIds = [];
    diagnostic.sources = [];
    const output = renderHtml(report);
    expect(output).toContain(
      "No prose instructions extracted from this scope.",
    );
    expect(output).not.toContain('class="source-list"');

    const singleLine = createReportFixture();
    const instruction = singleLine.instructions[0];
    if (instruction === undefined) {
      throw new Error("Fixture instruction is missing.");
    }
    instruction.source.endLine = instruction.source.startLine;
    expect(renderHtml(singleLine)).toContain("AGENTS.md:3 · precedence");
  });
});
