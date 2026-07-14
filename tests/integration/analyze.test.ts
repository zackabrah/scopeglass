import { symlink } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ANALYSIS_LIMITS,
  REPORT_SCHEMA_VERSION,
  RULESET_VERSION,
  TOKEN_ESTIMATE_METHOD,
  analyze,
} from "../../src/index.js";
import {
  createTempDirectory,
  type TempDirectory,
} from "../helpers/temp-directory.js";

const temporaryDirectories: TempDirectory[] = [];

async function tempDirectory(): Promise<TempDirectory> {
  const directory = await createTempDirectory();
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((entry) => entry.cleanup()),
  );
});

describe("analyze", () => {
  it("builds a deterministic versioned report for the effective scope chain", async () => {
    const repository = await tempDirectory();
    await repository.mkdir(".git");
    const rootText = [
      "# Repository",
      "",
      "Use pnpm!",
      "",
      "Always use tabs.",
      "",
      "Read [the guide](docs/guide.md).",
      "",
      "Read [the missing guide](docs/missing.md).",
      "",
    ].join("\n");
    const leafText = [
      "# API",
      "",
      "Use pnpm.",
      "",
      "Do not use tabs.",
      "",
    ].join("\n");
    await repository.write("AGENTS.md", rootText);
    await repository.write("docs/guide.md", "# Guide\n");
    await repository.write("packages/api/AGENTS.md", leafText);
    const target = await repository.write(
      "packages/api/src/index.ts",
      "export {};\n",
    );

    const first = await analyze(target);
    const second = await analyze(target);

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      kind: "scopeglass-report",
      schemaVersion: REPORT_SCHEMA_VERSION,
      rulesetVersion: RULESET_VERSION,
      root: ".",
      rootDiscovery: { method: "git-directory", marker: ".git" },
      target: "packages/api/src/index.ts",
      tokenEstimate: {
        method: TOKEN_ESTIMATE_METHOD,
        bytes: Buffer.byteLength(rootText) + Buffer.byteLength(leafText),
        total: Math.ceil(
          (Buffer.byteLength(rootText) + Buffer.byteLength(leafText)) / 3,
        ),
      },
      summary: {
        scopeCount: 2,
        instructionCount: 6,
        errorCount: 1,
        warningCount: 0,
        infoCount: 2,
      },
    });
    expect(
      first.scopes.map(({ id, path: scopePath, precedence }) => ({
        id,
        path: scopePath,
        precedence,
      })),
    ).toEqual([
      { id: "scope:AGENTS.md", path: "AGENTS.md", precedence: 0 },
      {
        id: "scope:packages/api/AGENTS.md",
        path: "packages/api/AGENTS.md",
        precedence: 1,
      },
    ]);
    expect(
      first.diagnostics.map(({ code, severity, instructionIds }) => ({
        code,
        severity,
        instructionIds,
      })),
    ).toEqual([
      { code: "broken-reference", severity: "error", instructionIds: [] },
      {
        code: "duplicate-instruction",
        severity: "info",
        instructionIds: ["instruction:0:3:0", "instruction:1:3:0"],
      },
      {
        code: "possible-conflict",
        severity: "info",
        instructionIds: ["instruction:0:5:0", "instruction:1:5:0"],
      },
    ]);
    expect(first.diagnostics[0]?.sources).toEqual([
      { path: "AGENTS.md", startLine: 9, endLine: 9 },
    ]);
  });

  it("classifies traversal, invalid encoding, and symlink references safely", async () => {
    const repository = await tempDirectory();
    await repository.mkdir("repo/.git");
    await repository.write("outside.md", "private\n");
    await repository.write("repo/docs/inside.md", "inside\n");
    await symlink(
      path.join(repository.path, "outside.md"),
      path.join(repository.path, "repo/docs/link.md"),
    );
    await repository.write(
      "repo/AGENTS.md",
      [
        "[Traversal](%2e%2e/outside.md)",
        "[Invalid percent](docs/%ZZ.md)",
        "[Symlink](docs/link.md)",
        "[Encoded once](docs/%252e%252e.md)",
        "[Valid](docs/inside.md?download=1#top)",
        "",
      ].join("\n"),
    );
    const target = await repository.mkdir("repo/src");

    const report = await analyze(target);

    expect(report.diagnostics.map(({ code }) => code)).toEqual([
      "broken-reference",
      "unsafe-reference",
      "unsafe-reference",
      "unsafe-reference",
    ]);
    expect(
      report.diagnostics.map(({ sources }) => sources[0]?.startLine),
    ).toEqual([4, 1, 2, 3]);
  });

  it("rejects invalid UTF-8 without emitting a partial report", async () => {
    const repository = await tempDirectory();
    await repository.mkdir("repo/.git");
    await repository.write("repo/AGENTS.md", new Uint8Array([0xc3, 0x28]));
    const target = await repository.mkdir("repo/src");

    await expect(analyze(target)).rejects.toMatchObject({
      code: "invalid-encoding",
      path: "AGENTS.md",
    });
  });

  it("enforces the parser-complexity budget across the complete scope chain", async () => {
    const repository = await tempDirectory();
    await repository.mkdir(".git");
    const syntaxPerScope = Math.floor(
      ANALYSIS_LIMITS.maxMarkdownSyntaxCharactersTotal / 3,
    );
    const syntax = "`".repeat(syntaxPerScope + 1);
    await repository.write("AGENTS.md", syntax);
    await repository.write("packages/AGENTS.md", syntax);
    await repository.write("packages/api/AGENTS.md", syntax);
    const target = await repository.mkdir("packages/api/src");

    await expect(analyze(target)).rejects.toMatchObject({
      code: "markdown-complexity-exceeded",
      path: "packages/api/AGENTS.md",
    });
  });
});
