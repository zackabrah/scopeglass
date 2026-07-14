#!/usr/bin/env node

import { Command } from "commander";

const program = new Command()
  .name("scopeglass")
  .description("Inspect which AGENTS.md instructions apply to a path and why.")
  .version("0.1.0");

await program.parseAsync();
