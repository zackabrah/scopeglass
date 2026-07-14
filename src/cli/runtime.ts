import { readFile } from "node:fs/promises";

import { visibleText } from "../formatters/shared.js";
import type { ScopeglassError } from "../error.js";

export async function readPackageVersion(packageUrl: URL): Promise<string> {
  const parsed: unknown = JSON.parse(await readFile(packageUrl, "utf8"));
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("version" in parsed) ||
    typeof parsed.version !== "string"
  ) {
    throw new Error("Package version is unavailable.");
  }
  return parsed.version;
}

export function terminalColorEnabled(requested: boolean): boolean {
  return (
    requested &&
    process.stdout.isTTY === true &&
    !Object.hasOwn(process.env, "NO_COLOR")
  );
}

export function installStdoutErrorHandler(): void {
  process.stdout.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EPIPE") {
      process.exit(0);
    }

    writeUnexpectedError();
    process.exit(2);
  });
}

export function writeScopeglassError(error: ScopeglassError): void {
  const pathText = error.path === undefined ? "" : ` [${error.path}]`;
  process.stderr.write(
    `${visibleText(`scopeglass: ${error.code}${pathText}: ${error.message}`)}\n`,
  );
}

export function writeUsageError(message: string): void {
  const normalizedMessage = message.startsWith("error: ")
    ? message.slice("error: ".length)
    : message;
  process.stderr.write(
    `${visibleText(`scopeglass: invalid-option: ${normalizedMessage}`)}\n`,
  );
}

export function writeUnexpectedError(): void {
  process.stderr.write(
    "scopeglass: unexpected-error: Scopeglass failed unexpectedly.\n",
  );
}

export function writeReportCreated(displayPath: string): void {
  process.stderr.write(`Created report: ${visibleText(displayPath)}\n`);
}
