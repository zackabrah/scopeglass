import { fileURLToPath } from "node:url";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { analyze } from "../../src/index.js";
import { renderHtml } from "../../src/formatters/html.js";
import { renderJson } from "../../src/formatters/json.js";
import { renderTerminal } from "../../src/formatters/terminal.js";

const root = fileURLToPath(
  new URL("../fixtures/hero-repository", import.meta.url),
);
const target = path.join(root, "packages/payments/src/charge.ts");

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

describe("golden hero repository", () => {
  it("shows the complete three-scope value proposition in every format", async () => {
    const report = await analyze(target, { root });
    const jsonReport = JSON.parse(renderJson(report)) as typeof report;
    const terminal = renderTerminal(report, { color: false });
    const html = renderHtml(report);

    expect(report.summary).toEqual({
      scopeCount: 3,
      instructionCount: 7,
      errorCount: 1,
      warningCount: 0,
      infoCount: 2,
    });
    expect(report.scopes.map(({ path: scopePath }) => scopePath)).toEqual([
      "AGENTS.md",
      "packages/AGENTS.md",
      "packages/payments/AGENTS.md",
    ]);
    expect(report.diagnostics.map(({ code }) => code)).toEqual([
      "broken-reference",
      "duplicate-instruction",
      "possible-conflict",
    ]);
    expect(jsonReport).toEqual(report);

    expect(terminal).toContain(`Target: ${report.target}`);
    expect(terminal).toContain(
      `Context estimate: ${report.tokenEstimate.total.toLocaleString("en-US")} tokens (${report.tokenEstimate.bytes.toLocaleString("en-US")} UTF-8 bytes, ${report.tokenEstimate.method})`,
    );
    expect(terminal).toContain(
      `${report.summary.scopeCount} scopes · ${report.summary.instructionCount} instructions · ${report.diagnostics.length} diagnostics`,
    );
    expect(html).toContain(`<p class="target untrusted">${report.target}</p>`);
    expect(html).toContain(
      `<dt>Scopes</dt><dd>${report.summary.scopeCount}</dd>`,
    );
    expect(html).toContain(
      `<dt>Instructions</dt><dd>${report.summary.instructionCount}</dd>`,
    );
    expect(html).toContain(
      `<dt>Est. tokens</dt><dd>${report.tokenEstimate.total.toLocaleString("en-US")}</dd>`,
    );
    expect(html).toContain(
      `<dt>Diagnostics</dt><dd>${report.diagnostics.length}</dd>`,
    );

    for (const scope of report.scopes) {
      expect(terminal).toContain(scope.path);
      expect(html).toContain(scope.path);
    }
    for (const instruction of report.instructions) {
      expect(terminal).toContain(instruction.text);
      expect(terminal).toContain(
        `${instruction.source.path}:${instruction.source.startLine}-${instruction.source.endLine} · ${instruction.kind} · precedence ${instruction.precedence}`,
      );
      expect(html).toContain(instruction.text);
      expect(html).toContain(
        `${instruction.source.path}:${instruction.source.startLine} · precedence ${instruction.precedence} · ~${instruction.tokenEstimate.total.toLocaleString("en-US")} tokens`,
      );
    }
    for (const diagnostic of report.diagnostics) {
      expect(terminal).toContain(
        `${diagnostic.severity === "warning" ? "WARN" : diagnostic.severity.toUpperCase()} ${diagnostic.code}: ${diagnostic.message}`,
      );
      expect(html).toContain(
        `<span class="severity">${diagnostic.severity.toUpperCase()}</span><code>${diagnostic.code}</code>`,
      );
      expect(html).toContain(
        `<p class="untrusted">${escapeHtml(diagnostic.message)}</p>`,
      );
      for (const source of diagnostic.sources) {
        expect(terminal).toContain(
          `${source.path}:${source.startLine}-${source.endLine}`,
        );
        expect(html).toContain(
          source.startLine === source.endLine
            ? `${source.path}:${source.startLine}`
            : `${source.path}:${source.startLine}–${source.endLine}`,
        );
      }
    }
  });
});
