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

function severityLabel(
  severity: DiagnosticSeverity,
  colors: ReturnType<typeof picocolors.createColors>,
): string {
  switch (severity) {
    case "error":
      return colors.red(colors.bold("ERROR"));
    case "warning":
      return colors.yellow(colors.bold("WARN"));
    case "info":
      return colors.cyan(colors.bold("INFO"));
  }
}

function untrusted(value: string): string {
  return `│ ${visibleText(value)}`;
}

function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

export function renderTerminal(
  report: ScopeglassReportV1,
  options: TerminalRenderOptions,
): string {
  const colors = picocolors.createColors(options.color);
  const lines: string[] = [
    colors.bold(colors.cyan("Scopeglass")),
    colors.dim("Effective AGENTS.md instructions, with provenance."),
    "",
    colors.bold("Overview"),
    untrusted(`Target: ${report.target}`),
    untrusted(describeRootDiscovery(report.rootDiscovery)),
    untrusted(
      `Context estimate: ${report.tokenEstimate.total.toLocaleString("en-US")} tokens (${report.tokenEstimate.bytes.toLocaleString("en-US")} UTF-8 bytes, ${report.tokenEstimate.method})`,
    ),
    untrusted(
      `${countLabel(report.summary.scopeCount, "scope")} · ${countLabel(report.summary.instructionCount, "instruction")} · ${countLabel(report.diagnostics.length, "diagnostic")}`,
    ),
    "",
    colors.bold("Scopes · root → target"),
  ];

  if (report.scopes.length === 0) {
    lines.push(untrusted("No AGENTS.md files apply."));
  }

  for (const [index, scope] of report.scopes.entries()) {
    lines.push(
      untrusted(
        `${index + 1}. ${scope.path} · precedence ${scope.precedence} · ~${scope.tokenEstimate.total.toLocaleString("en-US")} tokens`,
      ),
    );
  }

  lines.push("", colors.bold("Instructions"));
  if (report.instructions.length === 0) {
    lines.push(untrusted("No prose instructions were extracted."));
  }

  for (const [index, instruction] of report.instructions.entries()) {
    const section =
      instruction.section.length === 0
        ? "Unsectioned"
        : instruction.section.join(" › ");
    lines.push(
      untrusted(`${index + 1}. [${section}]`),
      untrusted(instruction.text),
      untrusted(
        `   ${instruction.source.path}:${instruction.source.startLine}-${instruction.source.endLine} · ${instruction.kind} · precedence ${instruction.precedence}`,
      ),
    );
  }

  lines.push("", colors.bold("Diagnostics"));
  if (report.diagnostics.length === 0) {
    lines.push(untrusted("No diagnostics."));
  }

  for (const diagnostic of report.diagnostics) {
    lines.push(
      `│ ${severityLabel(diagnostic.severity, colors)} ${diagnostic.code}: ${visibleText(diagnostic.message)}`,
    );
    for (const source of diagnostic.sources) {
      lines.push(
        untrusted(`   ${source.path}:${source.startLine}-${source.endLine}`),
      );
    }
  }

  return assertOutputSize(`${lines.join("\n")}\n`);
}

export function renderCheckTerminal(
  result: ScopeglassCheckResultV1,
  options: TerminalRenderOptions,
): string {
  const reportOutput = renderTerminal(result.report, options);
  const failures =
    result.policy.failures.length === 0
      ? "none"
      : result.policy.failures.join(", ");
  const budget =
    result.policy.maxTokens === undefined
      ? "disabled"
      : result.policy.maxTokens.toLocaleString("en-US");
  const policyOutput = [
    "Policy",
    `│ Result: ${result.policy.passed ? "PASSED" : "FAILED"}`,
    `│ Diagnostic threshold: ${result.policy.failOn}`,
    `│ Token budget: ${budget}`,
    `│ Failures: ${failures}`,
    "",
  ].join("\n");

  return assertOutputSize(`${reportOutput}${policyOutput}`);
}
