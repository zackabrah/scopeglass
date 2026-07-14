import path from "node:path";

/** Convert a contained native path to the stable path form used in reports. */
export function normalizeDisplayPath(
  basePath: string,
  absolutePath: string,
): string {
  const relativePath = path.relative(basePath, absolutePath);

  if (relativePath === "") {
    return ".";
  }

  // path.relative() may return an absolute path across Windows drives. Error
  // paths must never expose that host-local value.
  if (path.isAbsolute(relativePath)) {
    return path.basename(absolutePath) || ".";
  }

  return relativePath.split(path.sep).join("/");
}

/** Return a native relative path only when the candidate is inside the root. */
export function containedRelativePath(
  rootPath: string,
  candidatePath: string,
): string | undefined {
  const relativePath = path.relative(rootPath, candidatePath);

  if (
    path.isAbsolute(relativePath) ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`)
  ) {
    return undefined;
  }

  return relativePath;
}

export function displayPathDepth(displayDirectory: string): number {
  return displayDirectory === "." ? 0 : displayDirectory.split("/").length;
}
