import { InvalidArgumentError } from "commander";

import type {
  FailOn,
  PolicyFailure,
  ScopeglassCheckResultV1,
  ScopeglassReportV1,
} from "../types.js";

const SEVERITY_RANK = Object.freeze({
  info: 0,
  warning: 1,
  error: 2,
});

const DECIMAL_INTEGER = /^\d+$/u;

export function parseMaxTokens(value: string): number {
  if (!DECIMAL_INTEGER.test(value)) {
    throw new InvalidArgumentError(
      "max-tokens must be a non-negative safe integer.",
    );
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new InvalidArgumentError(
      "max-tokens must be a non-negative safe integer.",
    );
  }

  return parsed;
}

export function parseFailOn(value: string): FailOn {
  switch (value) {
    case "error":
    case "warning":
    case "info":
    case "never":
      return value;
    default:
      throw new InvalidArgumentError(
        "fail-on must be error, warning, info, or never.",
      );
  }
}

function failsDiagnosticPolicy(
  report: ScopeglassReportV1,
  failOn: FailOn,
): boolean {
  if (failOn === "never") {
    return false;
  }

  const threshold = SEVERITY_RANK[failOn];
  return report.diagnostics.some(
    ({ severity }) => SEVERITY_RANK[severity] >= threshold,
  );
}

export function createCheckResult(
  report: ScopeglassReportV1,
  failOn: FailOn,
  maxTokens?: number,
): ScopeglassCheckResultV1 {
  const failures: PolicyFailure[] = [];

  if (failsDiagnosticPolicy(report, failOn)) {
    failures.push("diagnostics");
  }
  if (maxTokens !== undefined && report.tokenEstimate.total > maxTokens) {
    failures.push("max-tokens");
  }

  return {
    kind: "scopeglass-check",
    schemaVersion: report.schemaVersion,
    rulesetVersion: report.rulesetVersion,
    report,
    policy: {
      passed: failures.length === 0,
      failOn,
      ...(maxTokens === undefined ? {} : { maxTokens }),
      failures,
    },
  };
}
