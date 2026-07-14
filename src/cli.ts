#!/usr/bin/env node

import { runCli } from "./cli/program.js";
import {
  installStdoutErrorHandler,
  readPackageVersion,
  writeUnexpectedError,
} from "./cli/runtime.js";

installStdoutErrorHandler();

try {
  const version = await readPackageVersion(
    new URL("../package.json", import.meta.url),
  );
  process.exitCode = await runCli(process.argv.slice(2), version);
} catch {
  writeUnexpectedError();
  process.exitCode = 2;
}
