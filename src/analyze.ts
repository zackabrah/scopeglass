import { ScopeglassError } from "./error.js";
import type { AnalyzeOptions, ScopeglassReportV1 } from "./types.js";

export function analyze(
  target?: string,
  options?: AnalyzeOptions,
): Promise<ScopeglassReportV1> {
  void target;
  void options;

  return Promise.reject(
    new ScopeglassError(
      "unreadable-file",
      "Analysis is unavailable until filesystem discovery is initialized.",
    ),
  );
}
