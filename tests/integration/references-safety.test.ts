import {
  lstat as nodeLstat,
  realpath as nodeRealpath,
  symlink,
} from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { analyze } from "../../src/index.js";
import type { DiagnosticCandidate } from "../../src/analysis/diagnostics.js";
import { collectReferenceDiagnostics } from "../../src/analysis/references.js";
import { ANALYSIS_LIMITS } from "../../src/constants.js";
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

describe("reference filesystem safety", () => {
  it("rejects every path behind an intermediate symlink without probing existence", async () => {
    const repository = await tempDirectory();
    await repository.mkdir("repo/.git");
    await repository.mkdir("repo/docs");
    const outsideDirectory = await repository.mkdir("outside");
    await repository.write("outside/existing.md", "private\n");
    await symlink(
      outsideDirectory,
      path.join(repository.path, "repo/linked"),
      "dir",
    );
    await repository.write(
      "repo/AGENTS.md",
      [
        "[Existing outside target](linked/existing.md)",
        "",
        "[Missing outside target](linked/missing.md)",
        "",
        "[Missing contained target](docs/missing.md)",
        "",
      ].join("\n"),
    );
    const target = await repository.mkdir("repo/src");

    const report = await analyze(target);

    expect(
      report.diagnostics.map(({ code, sources }) => ({
        code,
        line: sources[0]?.startLine,
      })),
    ).toEqual([
      { code: "broken-reference", line: 5 },
      { code: "unsafe-reference", line: 1 },
      { code: "unsafe-reference", line: 3 },
    ]);
  });

  it("validates a reused definition once and keeps its diagnostic bounded", async () => {
    const repository = await tempDirectory();
    await repository.mkdir("repo/.git");
    const referenceCount = 300;
    const longTarget = `missing/${"a".repeat(3_900)}-tail-must-not-appear.md`;
    const references = Array.from(
      { length: referenceCount },
      (_, index) => `[Reference ${index}][shared]`,
    );
    await repository.write(
      "repo/AGENTS.md",
      [`[shared]: ${longTarget}`, "", ...references, ""].join("\n"),
    );
    const target = await repository.mkdir("repo/src");

    const report = await analyze(target);

    expect(report.diagnostics).toHaveLength(1);
    expect(report.diagnostics[0]).toMatchObject({
      code: "broken-reference",
      severity: "error",
    });
    expect(report.diagnostics[0]?.sources).toHaveLength(referenceCount);
    expect(report.diagnostics[0]?.message.length).toBeLessThan(320);
    expect(report.diagnostics[0]?.message).toContain("…");
    expect(report.diagnostics[0]?.message).not.toContain(
      "tail-must-not-appear",
    );
    expect(Buffer.byteLength(JSON.stringify(report))).toBeLessThan(100_000);
  });

  it("caches a repeated target separately for each source directory", async () => {
    const repository = await tempDirectory();
    await repository.mkdir("repo/.git");
    await repository.write("repo/AGENTS.md", "[Root](shared.md)\n");
    await repository.write("repo/packages/AGENTS.md", "[Package](shared.md)\n");
    await repository.write("repo/packages/shared.md", "present\n");
    const target = await repository.mkdir("repo/packages/src");

    const report = await analyze(target);

    expect(report.diagnostics).toHaveLength(1);
    expect(report.diagnostics[0]).toMatchObject({
      code: "broken-reference",
      sources: [{ path: "AGENTS.md", startLine: 1, endLine: 1 }],
    });
  });

  it("inspects shared reference prefixes only once per analysis", async () => {
    const repository = await tempDirectory();
    const rootPath = await repository.mkdir("repo");
    await repository.write("repo/AGENTS.md", "Rules.\n");
    const depth = 100;
    const referenceCount = 200;
    const prefix = Array.from({ length: depth }, () => "d").join("/");
    await repository.mkdir(`repo/${prefix}`);
    const references = Array.from({ length: referenceCount }, (_, index) => ({
      target: `${prefix}/missing-${index}.md`,
      source: { path: "AGENTS.md", startLine: index + 1, endLine: index + 1 },
    }));
    let lstatCount = 0;
    let realpathCount = 0;
    const diagnostics: DiagnosticCandidate[] = [];

    await collectReferenceDiagnostics(rootPath, references, diagnostics, {
      async lstat(candidatePath) {
        lstatCount += 1;
        return nodeLstat(candidatePath);
      },
      async realpath(candidatePath) {
        realpathCount += 1;
        return nodeRealpath(candidatePath);
      },
    });

    expect(lstatCount).toBe(depth + referenceCount);
    expect(realpathCount).toBe(0);
    expect(diagnostics).toHaveLength(referenceCount);
  });

  it("bounds unique filesystem inspections across divergent references", async () => {
    const repository = await tempDirectory();
    const rootPath = await repository.mkdir("repo");
    await repository.write("repo/AGENTS.md", "Rules.\n");
    const directoryStats = await nodeLstat(rootPath);
    const componentsPerReference =
      Math.floor(
        ANALYSIS_LIMITS.maxReferencePathInspections /
          ANALYSIS_LIMITS.maxReferences,
      ) + 1;
    const references = Array.from(
      { length: ANALYSIS_LIMITS.maxReferences },
      (_, index) => ({
        target: Array.from(
          { length: componentsPerReference },
          (_entry, component) =>
            component === 0 ? `branch-${index}` : `directory-${component}`,
        ).join("/"),
        source: {
          path: "AGENTS.md",
          startLine: index + 1,
          endLine: index + 1,
        },
      }),
    );
    const diagnostics: DiagnosticCandidate[] = [];
    let lstatCount = 0;

    await expect(
      collectReferenceDiagnostics(rootPath, references, diagnostics, {
        lstat() {
          lstatCount += 1;
          return Promise.resolve(directoryStats);
        },
        realpath(candidatePath) {
          return Promise.resolve(candidatePath);
        },
      }),
    ).rejects.toMatchObject({
      code: "reference-complexity-exceeded",
      path: "AGENTS.md",
    });

    expect(lstatCount).toBe(ANALYSIS_LIMITS.maxReferencePathInspections);
  });
});
