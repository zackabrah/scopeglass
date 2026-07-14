import { ANALYSIS_LIMITS } from "../constants.js";
import { ScopeglassError } from "../error.js";
export { visibleText } from "../sanitize.js";

export function assertOutputSize(output: string): string {
  if (Buffer.byteLength(output) > ANALYSIS_LIMITS.maxOutputBytes) {
    throw new ScopeglassError(
      "output-too-large",
      "The rendered output exceeds the output byte limit.",
    );
  }

  return output;
}
