import type { ScopeglassErrorCode } from "./types.js";
import { safeDisplayPath } from "./sanitize.js";

export interface ScopeglassErrorOptions {
  path?: string;
  cause?: unknown;
}

export class ScopeglassError extends Error {
  readonly code: ScopeglassErrorCode;
  readonly path?: string;

  constructor(
    code: ScopeglassErrorCode,
    message: string,
    options: ScopeglassErrorOptions = {},
  ) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "ScopeglassError";
    this.code = code;
    if (options.path !== undefined) {
      this.path = safeDisplayPath(options.path);
    }
  }
}
