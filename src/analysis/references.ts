import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

import type { SourceLocation } from "../types.js";
import { appendDiagnostic, type DiagnosticCandidate } from "./diagnostics.js";
import { containedRelativePath } from "./paths.js";

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
    message: `${reason}: ${JSON.stringify(reference.target)}.`,
    sources: [reference.source],
    instructionIds: [],
  };
}

async function validateReference(
  rootPath: string,
  reference: ReferenceInput,
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
  if (containedRelativePath(rootPath, candidatePath) === undefined) {
    return diagnosticFor(
      "unsafe-reference",
      reference,
      "The reference escapes the analysis root",
    );
  }

  let candidateStats: Awaited<ReturnType<typeof lstat>>;
  try {
    candidateStats = await lstat(candidatePath);
  } catch (error) {
    return diagnosticFor(
      isMissing(error) ? "broken-reference" : "unsafe-reference",
      reference,
      isMissing(error)
        ? "The reference target does not exist"
        : "The reference target could not be inspected safely",
    );
  }

  if (candidateStats.isSymbolicLink()) {
    return diagnosticFor(
      "unsafe-reference",
      reference,
      "The reference target is a symbolic link or junction",
    );
  }
  if (!candidateStats.isFile() && !candidateStats.isDirectory()) {
    return diagnosticFor(
      "unsafe-reference",
      reference,
      "The reference target is not a regular file or directory",
    );
  }

  try {
    const resolvedPath = await realpath(candidatePath);
    if (containedRelativePath(rootPath, resolvedPath) === undefined) {
      return diagnosticFor(
        "unsafe-reference",
        reference,
        "The reference resolves outside the analysis root",
      );
    }
  } catch (error) {
    return diagnosticFor(
      isMissing(error) ? "broken-reference" : "unsafe-reference",
      reference,
      isMissing(error)
        ? "The reference target disappeared"
        : "The reference target could not be resolved safely",
    );
  }

  return undefined;
}

export async function collectReferenceDiagnostics(
  rootPath: string,
  references: readonly ReferenceInput[],
  diagnostics: DiagnosticCandidate[],
): Promise<void> {
  for (const reference of references) {
    const diagnostic = await validateReference(rootPath, reference);
    if (diagnostic !== undefined) {
      appendDiagnostic(diagnostics, diagnostic);
    }
  }
}
