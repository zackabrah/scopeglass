import type { ScopeglassCheckResultV1, ScopeglassReportV1 } from "../types.js";
import { assertOutputSize } from "./shared.js";

export function renderJson(
  value: ScopeglassReportV1 | ScopeglassCheckResultV1,
): string {
  return assertOutputSize(`${JSON.stringify(value, null, 2)}\n`);
}
