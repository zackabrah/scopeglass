import { type BigIntStats } from "node:fs";
import { lstat, open, realpath, unlink } from "node:fs/promises";
import path from "node:path";

import {
  containedRelativePath,
  normalizeDisplayPath,
} from "../analysis/paths.js";
import { ScopeglassError } from "../error.js";
import { sameFile } from "../file-identity.js";

interface ParentIdentity {
  realPath: string;
  stats: BigIntStats;
}

interface DescendantLocation {
  realCwd: string;
  relativeParent: string;
}

function reportWriteError(
  displayPath: string,
  message: string,
): ScopeglassError {
  return new ScopeglassError("write-failed", message, { path: displayPath });
}

async function descendantLocation(
  lexicalCwd: string,
  parentPath: string,
  displayPath: string,
): Promise<DescendantLocation | undefined> {
  let realCwd: string;
  let realCwdStats: BigIntStats;
  try {
    realCwd = await realpath(lexicalCwd);
    realCwdStats = await lstat(realCwd, { bigint: true });
  } catch {
    throw reportWriteError(
      displayPath,
      "The report output working directory is unreadable.",
    );
  }

  const exactRelativeParent = containedRelativePath(lexicalCwd, parentPath);
  if (exactRelativeParent !== undefined) {
    return { realCwd, relativeParent: exactRelativeParent };
  }

  const descendantComponents: string[] = [];
  let candidateAncestor = parentPath;

  for (;;) {
    try {
      const candidateStats = await lstat(candidateAncestor, { bigint: true });
      if (
        !candidateStats.isSymbolicLink() &&
        candidateStats.isDirectory() &&
        sameFile(realCwdStats, candidateStats)
      ) {
        return {
          realCwd,
          relativeParent: descendantComponents.reverse().join(path.sep),
        };
      }
    } catch {
      return undefined;
    }

    const nextAncestor = path.dirname(candidateAncestor);
    if (nextAncestor === candidateAncestor) {
      break;
    }
    descendantComponents.push(path.basename(candidateAncestor));
    candidateAncestor = nextAncestor;
  }

  return undefined;
}

async function validateDescendantComponents(
  cwd: string,
  parentPath: string,
  displayPath: string,
): Promise<void> {
  const lexicalCwd = path.resolve(cwd);
  const descendant = await descendantLocation(
    lexicalCwd,
    parentPath,
    displayPath,
  );
  if (descendant === undefined || descendant.relativeParent === "") {
    return;
  }

  let currentPath = descendant.realCwd;

  for (const component of descendant.relativeParent.split(path.sep)) {
    currentPath = path.join(currentPath, component);
    let stats: BigIntStats;
    try {
      stats = await lstat(currentPath, { bigint: true });
    } catch {
      throw reportWriteError(
        displayPath,
        "The report output parent does not exist or is unreadable.",
      );
    }

    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw reportWriteError(
        displayPath,
        "The report output parent must be a real directory.",
      );
    }
  }
}

async function validateParent(
  parentPath: string,
  cwd: string,
  displayPath: string,
): Promise<ParentIdentity> {
  await validateDescendantComponents(cwd, parentPath, displayPath);

  try {
    const initialStats = await lstat(parentPath, { bigint: true });
    if (initialStats.isSymbolicLink() || !initialStats.isDirectory()) {
      throw reportWriteError(
        displayPath,
        "The report output parent must be a real directory.",
      );
    }

    const parentRealPath = await realpath(parentPath);
    const currentStats = await lstat(parentPath, { bigint: true });
    if (!currentStats.isDirectory() || !sameFile(initialStats, currentStats)) {
      throw reportWriteError(
        displayPath,
        "The report output parent changed during validation.",
      );
    }

    return { realPath: parentRealPath, stats: currentStats };
  } catch (error) {
    if (error instanceof ScopeglassError) {
      throw error;
    }
    throw reportWriteError(
      displayPath,
      "The report output parent does not exist or is unreadable.",
    );
  }
}

async function removeOwnedFile(
  outputPath: string,
  createdStats: BigIntStats | undefined,
): Promise<void> {
  if (createdStats === undefined) {
    return;
  }

  try {
    const currentStats = await lstat(outputPath, { bigint: true });
    if (currentStats.isFile() && sameFile(currentStats, createdStats)) {
      await unlink(outputPath);
    }
  } catch {
    // Best-effort cleanup must never mask the original write failure.
  }
}

export async function writeReportFile(
  requestedPath: string,
  contents: string,
  cwd = process.cwd(),
): Promise<string> {
  const outputPath = path.resolve(cwd, requestedPath);
  const displayPath = normalizeDisplayPath(path.resolve(cwd), outputPath);
  const parentPath = path.dirname(outputPath);
  const parentIdentity = await validateParent(parentPath, cwd, displayPath);

  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(outputPath, "wx", 0o600);
  } catch {
    throw reportWriteError(
      displayPath,
      "The report output already exists or cannot be created safely.",
    );
  }

  let createdStats: BigIntStats | undefined;
  let failure: unknown;

  try {
    createdStats = await handle.stat({ bigint: true });
    const pathStats = await lstat(outputPath, { bigint: true });
    if (
      !createdStats.isFile() ||
      !pathStats.isFile() ||
      !sameFile(createdStats, pathStats)
    ) {
      throw reportWriteError(
        displayPath,
        "The report output changed during creation.",
      );
    }

    const currentParent = await validateParent(parentPath, cwd, displayPath);
    if (
      currentParent.realPath !== parentIdentity.realPath ||
      !sameFile(currentParent.stats, parentIdentity.stats)
    ) {
      throw reportWriteError(
        displayPath,
        "The report output parent changed during creation.",
      );
    }

    await handle.chmod(0o600);
    await handle.writeFile(contents, { encoding: "utf8" });
    await handle.sync();
  } catch (error) {
    failure = error;
  }

  try {
    await handle.close();
  } catch (error) {
    failure ??= error;
  }

  if (failure !== undefined) {
    await removeOwnedFile(outputPath, createdStats);
    if (failure instanceof ScopeglassError) {
      throw failure;
    }
    throw reportWriteError(
      displayPath,
      "The report output could not be written completely.",
    );
  }

  return displayPath;
}
