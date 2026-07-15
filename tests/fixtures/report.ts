import type { ScopeglassReportV1 } from "../../src/types.js";

export const hostileInstruction =
  "::error::owned\n##vso[task.setvariable variable=x]owned\u001b[31mRed\u202e " +
  '<img src=x onerror="alert(1)"> </style><script>alert(1)</script>';

export function createReportFixture(): ScopeglassReportV1 {
  return {
    kind: "scopeglass-report",
    schemaVersion: 1,
    rulesetVersion: 2,
    root: ".",
    rootDiscovery: { method: "git-directory", marker: ".git" },
    target: "src/<hostile>&file.ts",
    tokenEstimate: {
      method: "utf8-bytes-div-3",
      bytes: 240,
      total: 80,
    },
    scopes: [
      {
        id: "scope:AGENTS.md",
        path: "AGENTS.md",
        directory: ".",
        depth: 0,
        precedence: 0,
        tokenEstimate: {
          method: "utf8-bytes-div-3",
          bytes: 240,
          total: 80,
        },
        instructionIds: ["instruction:0:3:0"],
      },
    ],
    instructions: [
      {
        id: "instruction:0:3:0",
        scopeId: "scope:AGENTS.md",
        kind: "paragraph",
        text: hostileInstruction,
        section: ["Repository </style>"],
        precedence: 0,
        source: { path: "AGENTS.md", startLine: 3, endLine: 4 },
        tokenEstimate: {
          method: "utf8-bytes-div-3",
          bytes: Buffer.byteLength(hostileInstruction),
          total: Math.ceil(Buffer.byteLength(hostileInstruction) / 3),
        },
      },
    ],
    diagnostics: [
      {
        id: "diagnostic:possible-conflict:0",
        code: "possible-conflict",
        severity: "info",
        message: "Possible conflict with <script>alert(1)</script>.",
        sources: [{ path: "AGENTS.md", startLine: 3, endLine: 4 }],
        instructionIds: ["instruction:0:3:0"],
      },
    ],
    summary: {
      scopeCount: 1,
      instructionCount: 1,
      errorCount: 0,
      warningCount: 0,
      infoCount: 1,
    },
  };
}
