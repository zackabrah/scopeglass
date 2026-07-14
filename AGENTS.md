# Scopeglass contributor instructions

## Project

Scopeglass is a local-only Node.js/TypeScript CLI for inspecting hierarchical
`AGENTS.md` scope. The source of truth is `SPEC.md`; the ordered implementation
plan is `tasks/plan.md`.

## Commands

- Install: `npm ci`
- Test: `npm test`
- Coverage: `npm run test:coverage`
- Lint: `npm run lint`
- Format check: `npm run format:check`
- Typecheck: `npm run typecheck`
- Build: `npm run build`
- Package check: `npm run package:check`
- Full verification: `npm run verify`

## Conventions

- Use TypeScript ESM and named exports in library modules.
- Keep the functional analysis core separate from filesystem/process boundaries.
- Validate external values once at the boundary; internal code relies on typed
  contracts from `src/types.ts`.
- Write a failing behavioral test before implementation.
- Preserve stable JSON schema fields, diagnostic codes, and CLI exit codes.
- Keep repository-derived content visibly untrusted and escaped in every output.
- Prefer small focused modules and explicit data flow over framework patterns.

```ts
export function normalizeDisplayPath(root: string, absolutePath: string): string {
  return path.relative(root, absolutePath).split(path.sep).join("/") || ".";
}
```

## Boundaries

### Always

- Resolve and contain paths before reading.
- Cap input sizes and test abuse cases.
- Run the relevant focused test after each behavior change.
- Run `npm run verify` before declaring the release candidate complete.

### Ask first

- Add a runtime dependency.
- Change public JSON, diagnostics, commands, or exit semantics.
- Add a new scanned instruction format or vendor profile.

### Never

- Execute, import, or fetch content referenced by a scanned repository.
- Add telemetry, remote assets, model calls, or runtime network access.
- Use `innerHTML` with repository-derived content.
- Weaken or delete a failing test to make verification pass.
