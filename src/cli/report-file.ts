import { type Stats } from "node:fs";
import { lstat, open, realpath, unlink } from "node:fs/promises";
import path from "node:path";

import {
  containedRelativePath,
  normalizeDisplayPath,
} from "../analysis/paths.js";
import { ScopeglassError } from "../error.js";

interface ParentIdentity {
  realPath: string;
  stats: Stats;
}

function sameFile(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function reportWriteError(
  displayPath: string,
  message: string,
): ScopeglassError {
  return new ScopeglassError("write-failed", message, { path: displayPath });
}

async function validateDescendantComponents(
  cwd: string,
  parentPath: string,
  displayPath: string,
): Promise<void> {
  const lexicalCwd = path.resolve(cwd);
  const relativeParent = containedRelativePath(lexicalCwd, parentPath);
  if (relativeParent === undefined || relativeParent === "") {
    return;
  }

  let currentPath: string;
  try {
    currentPath = await realpath(lexicalCwd);
  } catch {
    throw reportWriteError(
      displayPath,
      "The report output working directory is unreadable.",
    );
  }

  for (const component of relativeParent.split(path.sep)) {
    currentPath = path.join(currentPath, component);
    let stats: Stats;
    try {
      stats = await lstat(currentPath);
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
    const initialStats = await lstat(parentPath);
    if (initialStats.isSymbolicLink() || !initialStats.isDirectory()) {
      throw reportWriteError(
        displayPath,
        "The report output parent must be a real directory.",
      );
    }

    const parentRealPath = await realpath(parentPath);
    const currentStats = await lstat(parentPath);
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
  createdStats: Stats | undefined,
): Promise<void> {
  if (createdStats === undefined) {
    return;
  }

  try {
    const currentStats = await lstat(outputPath);
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

  let createdStats: Stats | undefined;
  let failure: unknown;

  try {
    createdStats = await handle.stat();
    const pathStats = await lstat(outputPath);
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
