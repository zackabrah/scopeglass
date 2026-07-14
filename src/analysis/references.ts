import type { Stats } from "node:fs";
import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

import { ANALYSIS_LIMITS } from "../constants.js";
import { ScopeglassError } from "../error.js";
import { visibleText } from "../sanitize.js";
import type { SourceLocation } from "../types.js";
import { appendDiagnostic, type DiagnosticCandidate } from "./diagnostics.js";
import { containedRelativePath } from "./paths.js";

const MAX_DIAGNOSTIC_TARGET_VISIBLE_LENGTH = 240;

export interface ReferenceInput {
  target: string;
  source: SourceLocation;
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

function referencePath(target: string): string {
  const queryIndex = target.indexOf("?");
  const fragmentIndex = target.indexOf("#");
  const end = [queryIndex, fragmentIndex]
    .filter((index) => index >= 0)
    .reduce((lowest, index) => Math.min(lowest, index), target.length);
  return target.slice(0, end);
}

function decodeReferencePath(target: string): string | undefined {
  try {
    return decodeURIComponent(referencePath(target));
  } catch {
    return undefined;
  }
}

function isUnsafeDecodedPath(decodedPath: string): boolean {
  return (
    decodedPath === "" ||
    decodedPath.includes("\0") ||
    decodedPath.includes("\\") ||
    path.posix.isAbsolute(decodedPath) ||
    path.win32.isAbsolute(decodedPath) ||
    /^[A-Za-z]:/u.test(decodedPath)
  );
}

function diagnosticFor(
  code: "broken-reference" | "unsafe-reference",
  reference: ReferenceInput,
  reason: string,
): DiagnosticCandidate {
  return {
    code,
    severity: "error",
    message: `${reason}: ${diagnosticTarget(reference.target)}.`,
    sources: [reference.source],
    instructionIds: [],
  };
}

function diagnosticTarget(target: string): string {
  let excerpt = "";
  let truncated = false;

  for (const character of target) {
    const visibleCharacter = visibleText(character);
    if (
      excerpt.length + visibleCharacter.length >
      MAX_DIAGNOSTIC_TARGET_VISIBLE_LENGTH
    ) {
      truncated = true;
      break;
    }
    excerpt += visibleCharacter;
  }

  return JSON.stringify(`${excerpt}${truncated ? "…" : ""}`);
}

function inspectionFailure(
  error: unknown,
  reference: ReferenceInput,
): DiagnosticCandidate {
  const missing = isMissing(error);
  return diagnosticFor(
    missing ? "broken-reference" : "unsafe-reference",
    reference,
    missing
      ? "The reference target does not exist"
      : "The reference target could not be inspected safely",
  );
}

type InspectedReferencePath =
  DiagnosticCandidate | { path: string; stats: Stats };

export interface ReferenceFileSystem {
  lstat(path: string): Promise<Stats>;
  realpath(path: string): Promise<string>;
}

type CachedLstatResult =
  { ok: true; stats: Stats } | { ok: false; error: unknown };
type CachedRealpathResult =
  { ok: true; path: string } | { ok: false; error: unknown };

interface ReferenceInspectionContext {
  fileSystem: ReferenceFileSystem;
  lstatByPath: Map<string, Promise<CachedLstatResult>>;
  realpathByPath: Map<string, Promise<CachedRealpathResult>>;
}

const nodeFileSystem: ReferenceFileSystem = { lstat, realpath };

function cachedLstat(
  context: ReferenceInspectionContext,
  candidatePath: string,
  sourcePath: string,
): Promise<CachedLstatResult> {
  let result = context.lstatByPath.get(candidatePath);
  if (result === undefined) {
    if (
      context.lstatByPath.size >= ANALYSIS_LIMITS.maxReferencePathInspections
    ) {
      throw new ScopeglassError(
        "reference-complexity-exceeded",
        `Reference validation exceeds ${ANALYSIS_LIMITS.maxReferencePathInspections} unique path inspections.`,
        { path: sourcePath },
      );
    }
    result = context.fileSystem.lstat(candidatePath).then(
      (stats) => ({ ok: true as const, stats }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    context.lstatByPath.set(candidatePath, result);
  }
  return result;
}

function cachedRealpath(
  context: ReferenceInspectionContext,
  candidatePath: string,
): Promise<CachedRealpathResult> {
  let result = context.realpathByPath.get(candidatePath);
  if (result === undefined) {
    result = context.fileSystem.realpath(candidatePath).then(
      (resolvedPath) => ({ ok: true as const, path: resolvedPath }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    context.realpathByPath.set(candidatePath, result);
  }
  return result;
}

async function inspectContainedReferencePath(
  rootPath: string,
  relativePath: string,
  reference: ReferenceInput,
  context: ReferenceInspectionContext,
): Promise<InspectedReferencePath> {
  const components = relativePath === "" ? [] : relativePath.split(path.sep);
  const targetComponent = components.pop();
  let currentPath = rootPath;

  for (const component of components) {
    currentPath = path.join(currentPath, component);
    const componentInspection = await cachedLstat(
      context,
      currentPath,
      reference.source.path,
    );
    if (!componentInspection.ok) {
      return inspectionFailure(componentInspection.error, reference);
    }
    const componentStats = componentInspection.stats;

    if (componentStats.isSymbolicLink()) {
      return diagnosticFor(
        "unsafe-reference",
        reference,
        "The reference path contains a symbolic link or junction",
      );
    }
    if (!componentStats.isDirectory()) {
      return diagnosticFor(
        "broken-reference",
        reference,
        "The reference target does not exist",
      );
    }
  }

  const targetPath =
    targetComponent === undefined
      ? currentPath
      : path.join(currentPath, targetComponent);
  const targetInspection = await cachedLstat(
    context,
    targetPath,
    reference.source.path,
  );
  if (!targetInspection.ok) {
    return inspectionFailure(targetInspection.error, reference);
  }
  const targetStats = targetInspection.stats;

  if (targetStats.isSymbolicLink()) {
    return diagnosticFor(
      "unsafe-reference",
      reference,
      "The reference target is a symbolic link or junction",
    );
  }

  return { path: targetPath, stats: targetStats };
}

async function validateReference(
  rootPath: string,
  reference: ReferenceInput,
  context: ReferenceInspectionContext,
): Promise<DiagnosticCandidate | undefined> {
  const decodedPath = decodeReferencePath(reference.target);
  if (decodedPath === undefined || isUnsafeDecodedPath(decodedPath)) {
    return diagnosticFor(
      "unsafe-reference",
      reference,
      "The reference path is unsafe",
    );
  }

  const sourcePath = path.resolve(
    rootPath,
    reference.source.path.split("/").join(path.sep),
  );
  if (containedRelativePath(rootPath, sourcePath) === undefined) {
    return diagnosticFor(
      "unsafe-reference",
      reference,
      "The reference source is outside the analysis root",
    );
  }

  const candidatePath = path.resolve(
    path.dirname(sourcePath),
    decodedPath.split("/").join(path.sep),
  );
  const candidateRelativePath = containedRelativePath(rootPath, candidatePath);
  if (candidateRelativePath === undefined) {
    return diagnosticFor(
      "unsafe-reference",
      reference,
      "The reference escapes the analysis root",
    );
  }

  const inspected = await inspectContainedReferencePath(
    rootPath,
    candidateRelativePath,
    reference,
    context,
  );
  if ("code" in inspected) {
    return inspected;
  }
  if (!inspected.stats.isFile() && !inspected.stats.isDirectory()) {
    return diagnosticFor(
      "unsafe-reference",
      reference,
      "The reference target is not a regular file or directory",
    );
  }

  const resolved = await cachedRealpath(context, inspected.path);
  if (!resolved.ok) {
    return diagnosticFor(
      isMissing(resolved.error) ? "broken-reference" : "unsafe-reference",
      reference,
      isMissing(resolved.error)
        ? "The reference target disappeared"
        : "The reference target could not be resolved safely",
    );
  }
  if (containedRelativePath(rootPath, resolved.path) === undefined) {
    return diagnosticFor(
      "unsafe-reference",
      reference,
      "The reference resolves outside the analysis root",
    );
  }

  return undefined;
}

export async function collectReferenceDiagnostics(
  rootPath: string,
  references: readonly ReferenceInput[],
  diagnostics: DiagnosticCandidate[],
  fileSystem: ReferenceFileSystem = nodeFileSystem,
): Promise<void> {
  const groups: ReferenceInput[][] = [];
  const groupsByDirectory = new Map<string, Map<string, ReferenceInput[]>>();
  const inspectionContext: ReferenceInspectionContext = {
    fileSystem,
    lstatByPath: new Map(),
    realpathByPath: new Map(),
  };

  for (const reference of references) {
    const sourceDirectory = path.posix.dirname(reference.source.path);
    let groupsByTarget = groupsByDirectory.get(sourceDirectory);
    if (groupsByTarget === undefined) {
      groupsByTarget = new Map<string, ReferenceInput[]>();
      groupsByDirectory.set(sourceDirectory, groupsByTarget);
    }

    let group = groupsByTarget.get(reference.target);
    if (group === undefined) {
      group = [];
      groups.push(group);
      groupsByTarget.set(reference.target, group);
    }
    group.push(reference);
  }

  for (const group of groups) {
    const representative = group[0];
    if (representative === undefined) {
      continue;
    }

    const diagnostic = await validateReference(
      rootPath,
      representative,
      inspectionContext,
    );
    if (diagnostic !== undefined) {
      appendDiagnostic(diagnostics, {
        ...diagnostic,
        sources: group.map(({ source }) => source),
      });
    }
  }
}
