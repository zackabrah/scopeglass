import { ANALYSIS_LIMITS } from "../constants.js";
import { ScopeglassError } from "../error.js";
import type { RootDiscovery } from "../types.js";
export { visibleText } from "../sanitize.js";

const rootDiscoveryDescriptions: Record<RootDiscovery["method"], string> = {
  explicit: "Root discovery: explicit --root directory.",
  "git-directory": "Root discovery: nearest .git directory.",
  "git-file": "Root discovery: nearest .git file (worktree marker).",
  "target-fallback":
    "Root discovery: target directory fallback; no .git marker found. Use --root to include a broader directory.",
};

export function describeRootDiscovery(discovery: RootDiscovery): string {
  return rootDiscoveryDescriptions[discovery.method];
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
