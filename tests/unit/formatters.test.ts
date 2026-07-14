import { describe, expect, it } from "vitest";

import { renderHtml } from "../../src/formatters/html.js";
import { renderJson } from "../../src/formatters/json.js";
import { renderTerminal } from "../../src/formatters/terminal.js";
import { createReportFixture } from "../fixtures/report.js";

const csp =
  "default-src 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'; " +
  "connect-src 'none'; img-src data:; script-src 'none'; " +
  "style-src 'unsafe-inline'; form-action 'none'; frame-ancestors 'none'";

describe("JSON rendering", () => {
  it("is deterministic, pretty-printed, newline-terminated, and ANSI-free", () => {
    const report = createReportFixture();
    const output = renderJson(report);

    expect(output).toBe(`${JSON.stringify(report, null, 2)}\n`);
    expect(output).not.toContain("\u001b");
    expect(JSON.parse(output)).toEqual(report);
  });
});

describe("terminal rendering", () => {
  it("visibly escapes hostile controls and gutters every untrusted line", () => {
    const output = renderTerminal(createReportFixture(), { color: false });

    expect(output).toContain("Scopeglass");
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
    expect(renderTerminal(createReportFixture(), { color: true })).toContain(
      "\u001b[",
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
    expect(output).toContain("@media print");
    expect(output).toContain("unicode-bidi: plaintext");
    expect(output).not.toMatch(/<script(?:\s|>)/iu);
    expect(output).not.toMatch(/<[^>]+\son[a-z]+=/iu);
    expect(output).not.toMatch(/https?:\/\//iu);
    expect(output.endsWith("\n")).toBe(true);
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
});
