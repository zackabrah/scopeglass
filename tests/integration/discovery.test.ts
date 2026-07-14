import { symlink } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ANALYSIS_LIMITS } from "../../src/constants.js";
import { ScopeglassError } from "../../src/error.js";
import { discoverScopeChain } from "../../src/analysis/discovery.js";
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

describe("scope discovery", () => {
  it("finds a Git root and returns canonical root-to-target scopes", async () => {
    const repository = await tempDirectory();
    await repository.mkdir(".git");
    await repository.write("AGENTS.md", "Root guidance.\n");
    await repository.write("packages/AGENTS.md", "Package guidance.\n");
    await repository.write("packages/api/AGENTS.md", "API guidance.\n");
    const target = await repository.write(
      "packages/api/src/index.ts",
      "export {};\n",
    );

    const result = await discoverScopeChain(target);

    expect(result.rootDiscovery).toEqual({
      method: "git-directory",
      marker: ".git",
    });
    expect(result.target).toBe("packages/api/src/index.ts");
    expect(result.scopes.map((scope) => scope.path)).toEqual([
      "AGENTS.md",
      "packages/AGENTS.md",
      "packages/api/AGENTS.md",
    ]);
    expect(result.scopes.map((scope) => scope.text)).toEqual([
      "Root guidance.\n",
      "Package guidance.\n",
      "API guidance.\n",
    ]);
    expect(result.scopes.map((scope) => scope.precedence)).toEqual([0, 1, 2]);
  });

  it("uses the nearest nested repository marker", async () => {
    const repository = await tempDirectory();
    await repository.mkdir(".git");
    await repository.write("AGENTS.md", "Outer.\n");
    await repository.mkdir("vendor/project/.git");
    await repository.write("vendor/project/AGENTS.md", "Inner.\n");
    const target = await repository.write("vendor/project/src/index.ts", "");

    const result = await discoverScopeChain(target);

    expect(result.target).toBe("src/index.ts");
    expect(result.scopes.map((scope) => scope.path)).toEqual(["AGENTS.md"]);
  });

  it("accepts a well-formed worktree git file", async () => {
    const repository = await tempDirectory();
    await repository.mkdir("git-data/worktrees/example");
    await repository.write(
      "worktree/.git",
      "gitdir: ../git-data/worktrees/example\n",
    );
    await repository.write("worktree/AGENTS.md", "Worktree guidance.\n");
    const target = await repository.mkdir("worktree/src");

    const result = await discoverScopeChain(target);

    expect(result.rootDiscovery).toEqual({
      method: "git-file",
      marker: ".git",
    });
    expect(result.target).toBe("src");
  });

  it("falls back to the target directory when no marker exists", async () => {
    const repository = await tempDirectory();
    const target = await repository.mkdir("standalone/project");
    await repository.write("standalone/project/AGENTS.md", "Local.\n");
    await repository.write("standalone/AGENTS.md", "Must not apply.\n");

    const result = await discoverScopeChain(target);

    expect(result.rootDiscovery).toEqual({ method: "target-fallback" });
    expect(result.target).toBe(".");
    expect(result.scopes.map((scope) => scope.path)).toEqual(["AGENTS.md"]);
  });

  it("supports an explicit root and rejects a target outside it", async () => {
    const repository = await tempDirectory();
    const root = await repository.mkdir("repo");
    await repository.write("repo/AGENTS.md", "Root.\n");
    const inside = await repository.mkdir("repo/src");
    const outside = await repository.mkdir("outside");

    const result = await discoverScopeChain(inside, { root });
    expect(result.rootDiscovery).toEqual({ method: "explicit" });

    await expect(discoverScopeChain(outside, { root })).rejects.toMatchObject({
      code: "target-outside-root",
      path: "../outside",
    });
  });

  it("rejects target and AGENTS.md symlinks even when they stay in-root", async () => {
    const repository = await tempDirectory();
    await repository.mkdir("repo/.git");
    const realTarget = await repository.mkdir("repo/real-target");
    const targetLink = path.join(repository.path, "repo/target-link");
    await symlink(realTarget, targetLink, "dir");

    await expect(discoverScopeChain(targetLink)).rejects.toMatchObject({
      code: "unsafe-symlink",
      path: "target-link",
    });

    await repository.write("repo/guidance.md", "Guidance.\n");
    await symlink("guidance.md", path.join(repository.path, "repo/AGENTS.md"));

    await expect(discoverScopeChain(realTarget)).rejects.toMatchObject({
      code: "unsafe-symlink",
      path: "AGENTS.md",
    });
  });

  it.each([
    "gitdir: missing\nextra\n",
    "gitdir: missing\0\n",
    "not-a-git-marker\n",
  ])(
    "rejects a malformed git marker without searching above it",
    async (marker) => {
      const repository = await tempDirectory();
      await repository.mkdir(".git");
      await repository.write("nested/.git", marker);
      const target = await repository.mkdir("nested/src");

      await expect(discoverScopeChain(target)).rejects.toMatchObject({
        code: "invalid-git-marker",
        path: ".git",
      });
    },
  );

  it("rejects an oversized git marker before parsing it", async () => {
    const repository = await tempDirectory();
    await repository.write("repo/.git", `gitdir: ${"a".repeat(4_097)}`);
    const target = await repository.mkdir("repo/src");

    await expect(discoverScopeChain(target)).rejects.toMatchObject({
      code: "invalid-git-marker",
      path: ".git",
    });
  });

  it("enforces the exact per-file byte boundary", async () => {
    const repository = await tempDirectory();
    await repository.mkdir("repo/.git");
    const target = await repository.mkdir("repo/src");
    await repository.write(
      "repo/AGENTS.md",
      new Uint8Array(ANALYSIS_LIMITS.maxFileBytes).fill(0x61),
    );

    const exact = await discoverScopeChain(target);
    expect(exact.scopes[0]?.bytes).toBe(ANALYSIS_LIMITS.maxFileBytes);

    await repository.write(
      "repo/AGENTS.md",
      new Uint8Array(ANALYSIS_LIMITS.maxFileBytes + 1).fill(0x61),
    );

    await expect(discoverScopeChain(target)).rejects.toMatchObject({
      code: "file-too-large",
      path: "AGENTS.md",
    });
  });

  it("counts BOM bytes while excluding the BOM from parsed text", async () => {
    const repository = await tempDirectory();
    await repository.mkdir("repo/.git");
    const target = await repository.mkdir("repo/src");
    await repository.write(
      "repo/AGENTS.md",
      new Uint8Array([0xef, 0xbb, 0xbf, 0x52, 0x75, 0x6c, 0x65]),
    );

    const result = await discoverScopeChain(target);

    expect(result.scopes[0]).toMatchObject({ bytes: 7, text: "Rule" });
  });

  it("enforces aggregate and scope-count limits", async () => {
    const aggregateRepository = await tempDirectory();
    await aggregateRepository.mkdir("repo/.git");
    const megabyte = new Uint8Array(ANALYSIS_LIMITS.maxFileBytes).fill(0x61);
    let aggregatePath = "repo";
    for (let index = 0; index < 4; index += 1) {
      await aggregateRepository.write(`${aggregatePath}/AGENTS.md`, megabyte);
      aggregatePath += `/d${index}`;
    }
    await aggregateRepository.write(`${aggregatePath}/AGENTS.md`, "x");
    const aggregateTarget = await aggregateRepository.mkdir(
      `${aggregatePath}/src`,
    );

    await expect(discoverScopeChain(aggregateTarget)).rejects.toMatchObject({
      code: "total-too-large",
    });

    const scopeRepository = await tempDirectory();
    await scopeRepository.mkdir("repo/.git");
    let scopePath = "repo";
    for (let index = 0; index <= ANALYSIS_LIMITS.maxScopes; index += 1) {
      await scopeRepository.write(`${scopePath}/AGENTS.md`, `Rule ${index}.\n`);
      scopePath += "/d";
    }
    const scopeTarget = await scopeRepository.mkdir(scopePath);

    await expect(discoverScopeChain(scopeTarget)).rejects.toMatchObject({
      code: "scope-limit-exceeded",
    });
  });

  it("uses stable typed failures without leaking the host temporary path", async () => {
    const repository = await tempDirectory();
    const missing = path.join(repository.path, "secret-parent", "missing");

    let failure: unknown;
    try {
      await discoverScopeChain(missing, { cwd: repository.path });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(ScopeglassError);
    expect(failure).toMatchObject({
      code: "target-not-found",
      path: "secret-parent/missing",
    });
    expect((failure as Error).message).not.toContain(repository.path);
  });
});
