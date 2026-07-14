import { type BigIntStats, constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { TextDecoder } from "node:util";

import { ScopeglassError } from "../error.js";
import { sameFile } from "../file-identity.js";

const GIT_MARKER_MAX_BYTES = 4 * 1024;
const READ_CHUNK_BYTES = 64 * 1024;
const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

export type GitMarkerEntry =
  { kind: "missing" } | { kind: "directory" } | { kind: "file"; text: string };

export interface BoundedTextFile {
  bytes: number;
  text: string;
}

type ReadPurpose = "git-marker" | "instruction";

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

function boundaryError(
  purpose: ReadPurpose,
  displayPath: string,
  failure: "invalid-encoding" | "not-regular" | "read" | "swap" | "too-large",
): ScopeglassError {
  if (purpose === "git-marker") {
    return new ScopeglassError(
      "invalid-git-marker",
      "The .git marker is malformed or unreadable.",
      { path: ".git" },
    );
  }

  if (failure === "too-large") {
    return new ScopeglassError(
      "file-too-large",
      "An AGENTS.md file exceeds the per-file byte limit.",
      { path: displayPath },
    );
  }

  if (failure === "invalid-encoding") {
    return new ScopeglassError(
      "invalid-encoding",
      "An AGENTS.md file is not valid UTF-8.",
      { path: displayPath },
    );
  }

  if (failure === "swap") {
    return new ScopeglassError(
      "unsafe-symlink",
      "An AGENTS.md file changed during validation.",
      { path: displayPath },
    );
  }

  return new ScopeglassError(
    "unreadable-file",
    failure === "not-regular"
      ? "An AGENTS.md path is not a regular file."
      : "An AGENTS.md file could not be read safely.",
    { path: displayPath },
  );
}

async function openNoFollow(absolutePath: string) {
  const noFollow = constants.O_NOFOLLOW;

  try {
    return await open(absolutePath, constants.O_RDONLY | noFollow);
  } catch (error) {
    const code = errorCode(error);
    const unsupported =
      noFollow !== 0 &&
      (code === "EINVAL" || code === "ENOTSUP" || code === "EOPNOTSUPP");

    if (!unsupported) {
      throw error;
    }

    // Platforms/filesystems without O_NOFOLLOW still get lstat/fstat identity
    // validation on both sides of this open.
    return open(absolutePath, constants.O_RDONLY);
  }
}

async function readAtMost(
  handle: Awaited<ReturnType<typeof open>>,
  limit: number,
) {
  const chunks: Buffer[] = [];
  let total = 0;

  while (total <= limit) {
    const length = Math.min(READ_CHUNK_BYTES, limit + 1 - total);
    if (length === 0) {
      break;
    }

    const chunk = Buffer.allocUnsafe(length);
    const { bytesRead } = await handle.read(chunk, 0, length, null);
    if (bytesRead === 0) {
      break;
    }

    chunks.push(chunk.subarray(0, bytesRead));
    total += bytesRead;
  }

  return Buffer.concat(chunks, total);
}

async function readCheckedFile(
  absolutePath: string,
  displayPath: string,
  initialStats: BigIntStats,
  limit: number,
  purpose: ReadPurpose,
): Promise<Buffer> {
  let handle: Awaited<ReturnType<typeof open>>;

  try {
    handle = await openNoFollow(absolutePath);
  } catch (error) {
    const code = errorCode(error);
    throw boundaryError(
      purpose,
      displayPath,
      code === "ELOOP" || code === "EMLINK" ? "swap" : "read",
    );
  }

  try {
    const descriptorStats = await handle.stat({ bigint: true });
    if (!descriptorStats.isFile()) {
      throw boundaryError(purpose, displayPath, "not-regular");
    }

    let currentStats: BigIntStats;
    try {
      currentStats = await lstat(absolutePath, { bigint: true });
    } catch {
      throw boundaryError(purpose, displayPath, "swap");
    }

    if (
      currentStats.isSymbolicLink() ||
      !currentStats.isFile() ||
      !sameFile(initialStats, descriptorStats) ||
      !sameFile(currentStats, descriptorStats)
    ) {
      throw boundaryError(purpose, displayPath, "swap");
    }

    const bytes = await readAtMost(handle, limit);
    if (bytes.byteLength > limit) {
      throw boundaryError(purpose, displayPath, "too-large");
    }

    return bytes;
  } catch (error) {
    if (error instanceof ScopeglassError) {
      throw error;
    }
    throw boundaryError(purpose, displayPath, "read");
  } finally {
    await handle.close().catch(() => undefined);
  }
}

function decodeUtf8(
  bytes: Buffer,
  displayPath: string,
  purpose: ReadPurpose,
  stripBom: boolean,
): string {
  const contents =
    stripBom && bytes.subarray(0, UTF8_BOM.length).equals(UTF8_BOM)
      ? bytes.subarray(UTF8_BOM.length)
      : bytes;

  try {
    return new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    }).decode(contents);
  } catch {
    throw boundaryError(purpose, displayPath, "invalid-encoding");
  }
}

export async function inspectGitMarker(
  markerPath: string,
): Promise<GitMarkerEntry> {
  let initialStats: BigIntStats;
  try {
    initialStats = await lstat(markerPath, { bigint: true });
  } catch (error) {
    if (isMissing(error)) {
      return { kind: "missing" };
    }
    throw boundaryError("git-marker", ".git", "read");
  }

  if (initialStats.isSymbolicLink()) {
    throw boundaryError("git-marker", ".git", "swap");
  }

  if (initialStats.isDirectory()) {
    try {
      await realpath(markerPath);
      const currentStats = await lstat(markerPath, { bigint: true });
      if (
        !currentStats.isDirectory() ||
        !sameFile(initialStats, currentStats)
      ) {
        throw boundaryError("git-marker", ".git", "swap");
      }
      return { kind: "directory" };
    } catch (error) {
      if (error instanceof ScopeglassError) {
        throw error;
      }
      throw boundaryError("git-marker", ".git", "read");
    }
  }

  if (!initialStats.isFile()) {
    throw boundaryError("git-marker", ".git", "not-regular");
  }

  const bytes = await readCheckedFile(
    markerPath,
    ".git",
    initialStats,
    GIT_MARKER_MAX_BYTES,
    "git-marker",
  );
  return {
    kind: "file",
    text: decodeUtf8(bytes, ".git", "git-marker", false),
  };
}

export async function readInstructionFile(
  absolutePath: string,
  displayPath: string,
  maxBytes: number,
): Promise<BoundedTextFile | undefined> {
  let initialStats: BigIntStats;
  try {
    initialStats = await lstat(absolutePath, { bigint: true });
  } catch (error) {
    if (isMissing(error)) {
      return undefined;
    }
    throw boundaryError("instruction", displayPath, "read");
  }

  if (initialStats.isSymbolicLink()) {
    throw new ScopeglassError(
      "unsafe-symlink",
      "An AGENTS.md path cannot be a symbolic link or junction.",
      { path: displayPath },
    );
  }
  if (!initialStats.isFile()) {
    throw boundaryError("instruction", displayPath, "not-regular");
  }

  const contents = await readCheckedFile(
    absolutePath,
    displayPath,
    initialStats,
    maxBytes,
    "instruction",
  );
  return {
    bytes: contents.byteLength,
    text: decodeUtf8(contents, displayPath, "instruction", true),
  };
}
