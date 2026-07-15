import picocolors from "picocolors";

import type {
  DiagnosticSeverity,
  ScopeglassCheckResultV1,
  ScopeglassReportV1,
} from "../types.js";
import {
  assertOutputSize,
  describeRootDiscovery,
  visibleText,
} from "./shared.js";

export interface TerminalRenderOptions {
  color: boolean;
}

type Colors = ReturnType<typeof picocolors.createColors>;

function severityLabel(severity: DiagnosticSeverity, colors: Colors): string {
  switch (severity) {
    case "error":
      return colors.red(colors.bold("ERROR"));
    case "warning":
      return colors.yellow(colors.bold("WARN"));
    case "info":
      return colors.cyan(colors.bold("INFO"));
  }
}

function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

/**
 * Terminal lines follow one rule: repository-controlled text is escaped with
 * `visibleText` and never wrapped in ANSI styling; color applies only to
 * Scopeglass-owned structure (gutter, labels, ordinals, metadata). With color
 * disabled every helper degrades to the exact plain string.
 */
function createLineHelpers(colors: Colors) {
  const gutter = (value: string) => `${colors.dim("│")} ${value}`;
  return {
    gutter,
    /** Owned label followed by untrusted repository text. */
    labeled: (label: string, value: string) =>
      gutter(`${colors.dim(label)} ${visibleText(value)}`),
    /** Entirely Scopeglass-owned informational line. */
    owned: (value: string) => gutter(colors.dim(value)),
    /** Entirely untrusted repository text. */
    untrusted: (value: string) => gutter(visibleText(value)),
  };
}

function ordinalPrefix(index: number, total: number): string {
  return `${String(index + 1).padStart(String(total).length)}.`;
}

export function renderTerminal(
  report: ScopeglassReportV1,
  options: TerminalRenderOptions,
): string {
  const colors = picocolors.createColors(options.color);
  const { gutter, labeled, owned } = createLineHelpers(colors);
  const separator = colors.dim("│");
  const lines: string[] = [
    `${options.color ? colors.green("◎") : "◎"} ${colors.bold("Scopeglass")}`,
    colors.dim("Effective AGENTS.md instructions, with provenance."),
    "",
    colors.bold("Overview"),
    labeled("Target:", report.target),
    owned(describeRootDiscovery(report.rootDiscovery)),
    gutter(
      `${colors.dim("Context estimate:")} ${report.tokenEstimate.total.toLocaleString("en-US")} tokens ${colors.dim(`(${report.tokenEstimate.bytes.toLocaleString("en-US")} UTF-8 bytes, ${report.tokenEstimate.method})`)}`,
    ),
    gutter(
      `${countLabel(report.summary.scopeCount, "scope")} · ${countLabel(report.summary.instructionCount, "instruction")} · ${countLabel(report.diagnostics.length, "diagnostic")}`,
    ),
    "",
    colors.bold("Scopes · root → target"),
  ];

  if (report.scopes.length === 0) {
    lines.push(owned("No AGENTS.md files apply."));
  }

  for (const [index, scope] of report.scopes.entries()) {
    const ordinal = ordinalPrefix(index, report.scopes.length);
    lines.push(
      gutter(
        `${colors.dim(ordinal)} ${visibleText(scope.path)}${colors.dim(` · precedence ${scope.precedence} · ~${scope.tokenEstimate.total.toLocaleString("en-US")} tokens`)}`,
      ),
    );
  }

  lines.push("", colors.bold("Instructions"));
  if (report.instructions.length === 0) {
    lines.push(owned("No prose instructions were extracted."));
  }

  for (const [index, instruction] of report.instructions.entries()) {
    const section =
      instruction.section.length === 0
        ? "Unsectioned"
        : instruction.section.join(" › ");
    const ordinal = ordinalPrefix(index, report.instructions.length);
    const metaIndent = " ".repeat(ordinal.length + 1);
    if (index > 0) {
      lines.push(separator);
    }
    lines.push(
      gutter(`${colors.dim(ordinal)} ${visibleText(instruction.text)}`),
      gutter(
        `${metaIndent}${visibleText(`[${section}]`)}${colors.dim(" · ")}${visibleText(`${instruction.source.path}:${instruction.source.startLine}-${instruction.source.endLine}`)}${colors.dim(` · ${instruction.kind} · precedence ${instruction.precedence}`)}`,
      ),
    );
  }

  lines.push("", colors.bold("Diagnostics"));
  if (report.diagnostics.length === 0) {
    lines.push(owned("No diagnostics."));
  }

  for (const diagnostic of report.diagnostics) {
    lines.push(
      `${colors.dim("│")} ${severityLabel(diagnostic.severity, colors)} ${diagnostic.code}: ${visibleText(diagnostic.message)}`,
    );
    for (const source of diagnostic.sources) {
      lines.push(
        gutter(
          `  ${colors.dim("└")} ${visibleText(`${source.path}:${source.startLine}-${source.endLine}`)}`,
        ),
      );
    }
  }

  return assertOutputSize(`${lines.join("\n")}\n`);
}

export function renderCheckTerminal(
  result: ScopeglassCheckResultV1,
  options: TerminalRenderOptions,
): string {
  const colors = picocolors.createColors(options.color);
  const { gutter } = createLineHelpers(colors);
  const reportOutput = renderTerminal(result.report, options);
  const failures =
    result.policy.failures.length === 0
      ? "none"
      : result.policy.failures.join(", ");
  const budget =
    result.policy.maxTokens === undefined
      ? "disabled"
      : result.policy.maxTokens.toLocaleString("en-US");
  const resultLabel = result.policy.passed
    ? colors.green(colors.bold("PASSED"))
    : colors.red(colors.bold("FAILED"));
  const policyOutput = [
    "",
    colors.bold("Policy"),
    gutter(`${colors.dim("Result:")} ${resultLabel}`),
    gutter(`${colors.dim("Diagnostic threshold:")} ${result.policy.failOn}`),
    gutter(`${colors.dim("Token budget:")} ${budget}`),
    gutter(`${colors.dim("Failures:")} ${failures}`),
    "",
  ].join("\n");

  return assertOutputSize(`${reportOutput}${policyOutput}`);
}
