import type { AnalyzeOptions, ScopeglassReportV1 } from "./types.js";
import { analyzeScope } from "./analysis/analyze.js";

export function analyze(
  target?: string,
  options?: AnalyzeOptions,
): Promise<ScopeglassReportV1> {
  return analyzeScope(target, options);
}
