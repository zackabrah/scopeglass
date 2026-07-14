import { ANALYSIS_LIMITS } from "../constants.js";
import { ScopeglassError } from "../error.js";

const dangerousCodePoint = /[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/u;

export function visibleText(value: string): string {
  let output = "";

  for (const character of value) {
    output += dangerousCodePoint.test(character)
      ? `\\u{${character.codePointAt(0)?.toString(16) ?? "0"}}`
      : character;
  }

  return output;
}

export function assertOutputSize(output: string): string {
  if (Buffer.byteLength(output) > ANALYSIS_LIMITS.maxOutputBytes) {
    throw new ScopeglassError(
      "output-too-large",
      "The rendered output exceeds the output byte limit.",
    );
  }

  return output;
}
