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

    for (const scope of report.scopes) {
      expect(terminal).toContain(scope.path);
      expect(html).toContain(scope.path);
    }
    for (const diagnostic of report.diagnostics) {
      expect(terminal).toContain(diagnostic.code);
      expect(html).toContain(diagnostic.code);
    }
  });
});
