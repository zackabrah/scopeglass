import { type BigIntStats } from "node:fs";
import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

import { ANALYSIS_LIMITS } from "../constants.js";
import { ScopeglassError } from "../error.js";
import { sameFile } from "../file-identity.js";
import type { AnalyzeOptions, RootDiscovery } from "../types.js";
import {
  containedRelativePath,
  displayPathDepth,
  normalizeDisplayPath,
} from "./paths.js";
import { inspectGitMarker, readInstructionFile } from "./safe-files.js";

const GIT_DIRECTIVE = /^gitdir: ([^\0\r\n]+)(?:\r?\n)?$/u;

export interface DiscoveredScope {
  path: string;
  directory: string;
  depth: number;
  precedence: number;
  bytes: number;
  text: string;
}

export interface ScopeDiscoveryResult {
  /** Internal real path used by later local-only analysis stages. */
  rootPath: string;
  rootDiscovery: RootDiscovery;
  target: string;
  targetKind: "directory" | "file";
  totalBytes: number;
  scopes: DiscoveredScope[];
}

interface ValidatedTarget {
  lexicalPath: string;
  realPath: string;
  kind: "directory" | "file";
}

interface ResolvedRoot {
  lexicalPath: string;
  realPath: string;
  discovery: RootDiscovery;
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  const { code } = error;
  return typeof code === "string" ? code : undefined;
}

function isMissing(error: unknown): boolean {
  const code = errorCode(error);
  return code === "ENOENT" || code === "ENOTDIR";
}

async function validateTarget(
  target: string,
  cwd: string,
): Promise<ValidatedTarget> {
  const lexicalPath = path.resolve(cwd, target);
  const cwdDisplay = normalizeDisplayPath(cwd, lexicalPath);
  let initialStats: BigIntStats;

  try {
    initialStats = await lstat(lexicalPath, { bigint: true });
  } catch (error) {
    throw new ScopeglassError(
      isMissing(error) ? "target-not-found" : "unreadable-file",
      isMissing(error)
        ? "The target does not exist."
        : "The target is unreadable.",
      { path: cwdDisplay },
    );
  }

  if (initialStats.isSymbolicLink()) {
    throw new ScopeglassError(
      "unsafe-symlink",
      "The target cannot be a symbolic link or junction.",
      { path: path.basename(lexicalPath) || "." },
    );
  }

  const kind = initialStats.isDirectory()
    ? "directory"
    : initialStats.isFile()
      ? "file"
      : undefined;
  if (kind === undefined) {
    throw new ScopeglassError(
      "unreadable-file",
      "The target must be a regular file or directory.",
      { path: cwdDisplay },
    );
  }

  try {
    const realPath = await realpath(lexicalPath);
    const currentStats = await lstat(lexicalPath, { bigint: true });
    if (
      currentStats.isSymbolicLink() ||
      !sameFile(initialStats, currentStats)
    ) {
      throw new ScopeglassError(
        "unsafe-symlink",
        "The target changed during validation.",
        { path: cwdDisplay },
      );
    }
    return { lexicalPath, realPath, kind };
  } catch (error) {
    if (error instanceof ScopeglassError) {
      throw error;
    }
    throw new ScopeglassError(
      isMissing(error) ? "target-not-found" : "unreadable-file",
      isMissing(error)
        ? "The target disappeared during validation."
        : "The target could not be resolved safely.",
      { path: cwdDisplay },
    );
  }
}

async function validateExplicitRoot(
  root: string,
  cwd: string,
): Promise<ResolvedRoot> {
  const lexicalPath = path.resolve(cwd, root);
  const displayPath = normalizeDisplayPath(cwd, lexicalPath);

  try {
    const initialStats = await lstat(lexicalPath, { bigint: true });
    if (initialStats.isSymbolicLink() || !initialStats.isDirectory()) {
      throw new ScopeglassError(
        "invalid-root",
        "The explicit root must be a real directory.",
        { path: displayPath },
      );
    }

    const realPath = await realpath(lexicalPath);
    const currentStats = await lstat(lexicalPath, { bigint: true });
    if (!currentStats.isDirectory() || !sameFile(initialStats, currentStats)) {
      throw new ScopeglassError(
        "invalid-root",
        "The explicit root changed during validation.",
        { path: displayPath },
      );
    }

    return { lexicalPath, realPath, discovery: { method: "explicit" } };
  } catch (error) {
    if (error instanceof ScopeglassError) {
      throw error;
    }
    throw new ScopeglassError(
      "invalid-root",
      "The explicit root does not exist or is unreadable.",
      { path: displayPath },
    );
  }
}

function validateGitFile(markerText: string): void {
  if (!GIT_DIRECTIVE.test(markerText)) {
    throw new ScopeglassError(
      "invalid-git-marker",
      "The .git file must contain exactly one gitdir directive.",
      { path: ".git" },
    );
  }
}

export async function resolveFallbackRootPath(
  startDirectory: string,
): Promise<string> {
  try {
    return await realpath(startDirectory);
  } catch (error) {
    throw new ScopeglassError(
      isMissing(error) ? "target-not-found" : "unreadable-file",
      isMissing(error)
        ? "The fallback repository root disappeared during discovery."
        : "The fallback repository root could not be resolved safely.",
      { path: "." },
    );
  }
}

async function discoverRoot(startDirectory: string): Promise<ResolvedRoot> {
  let currentDirectory = startDirectory;

  for (;;) {
    const marker = await inspectGitMarker(path.join(currentDirectory, ".git"));
    if (marker.kind !== "missing") {
      if (marker.kind === "file") {
        validateGitFile(marker.text);
      }

      let realPath: string;
      try {
        realPath = await realpath(currentDirectory);
      } catch {
        throw new ScopeglassError(
          "unreadable-file",
          "The discovered repository root could not be resolved.",
          { path: "." },
        );
      }

      return {
        lexicalPath: currentDirectory,
        realPath,
        discovery: {
          method: marker.kind === "directory" ? "git-directory" : "git-file",
          marker: ".git",
        },
      };
    }

    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      const realPath = await resolveFallbackRootPath(startDirectory);
      return {
        lexicalPath: startDirectory,
        realPath,
        discovery: { method: "target-fallback" },
      };
    }
    currentDirectory = parentDirectory;
  }
}

function directoriesFromRoot(
  rootPath: string,
  targetDirectory: string,
): string[] {
  const directories: string[] = [];
  let currentDirectory = targetDirectory;

  for (;;) {
    directories.push(currentDirectory);
    if (currentDirectory === rootPath) {
      break;
    }
    currentDirectory = path.dirname(currentDirectory);
  }

  return directories.reverse();
}

export async function discoverScopeChain(
  target = ".",
  options: AnalyzeOptions = {},
): Promise<ScopeDiscoveryResult> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const validatedTarget = await validateTarget(target, cwd);
  const lexicalTargetDirectory =
    validatedTarget.kind === "directory"
      ? validatedTarget.lexicalPath
      : path.dirname(validatedTarget.lexicalPath);
  const resolvedRoot =
    options.root === undefined
      ? await discoverRoot(lexicalTargetDirectory)
      : await validateExplicitRoot(options.root, cwd);

  const targetRelativePath = containedRelativePath(
    resolvedRoot.realPath,
    validatedTarget.realPath,
  );
  if (targetRelativePath === undefined) {
    throw new ScopeglassError(
      "target-outside-root",
      "The target resolves outside the selected root.",
      {
        path: normalizeDisplayPath(
          resolvedRoot.realPath,
          validatedTarget.realPath,
        ),
      },
    );
  }

  const targetDirectory =
    validatedTarget.kind === "directory"
      ? validatedTarget.realPath
      : path.dirname(validatedTarget.realPath);
  const scopes: DiscoveredScope[] = [];
  let totalBytes = 0;

  for (const directoryPath of directoriesFromRoot(
    resolvedRoot.realPath,
    targetDirectory,
  )) {
    const displayDirectory = normalizeDisplayPath(
      resolvedRoot.realPath,
      directoryPath,
    );
    const displayPath =
      displayDirectory === "." ? "AGENTS.md" : `${displayDirectory}/AGENTS.md`;
    const scope = await readInstructionFile(
      path.join(directoryPath, "AGENTS.md"),
      displayPath,
      ANALYSIS_LIMITS.maxFileBytes,
      resolvedRoot.realPath,
    );

    if (scope === undefined) {
      continue;
    }
    if (scopes.length === ANALYSIS_LIMITS.maxScopes) {
      throw new ScopeglassError(
        "scope-limit-exceeded",
        "The scope-file limit was exceeded.",
        { path: displayPath },
      );
    }

    totalBytes += scope.bytes;
    if (totalBytes > ANALYSIS_LIMITS.maxTotalBytes) {
      throw new ScopeglassError(
        "total-too-large",
        "The combined AGENTS.md byte limit was exceeded.",
        { path: displayPath },
      );
    }

    scopes.push({
      path: displayPath,
      directory: displayDirectory,
      depth: displayPathDepth(displayDirectory),
      precedence: scopes.length,
      bytes: scope.bytes,
      text: scope.text,
    });
  }

  return {
    rootPath: resolvedRoot.realPath,
    rootDiscovery: resolvedRoot.discovery,
    target: normalizeDisplayPath(
      resolvedRoot.realPath,
      validatedTarget.realPath,
    ),
    targetKind: validatedTarget.kind,
    totalBytes,
    scopes,
  };
}
