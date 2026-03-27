# Contributing to pi-apex

## Getting Started

```bash
git clone https://github.com/imankeeth/pi-apex.git
cd pi-apex
npm install
npm run build
```

Verify everything compiles:

```bash
npm run typecheck
```

## Project Structure

```
pi-apex/
├── packages/
│   ├── sdk/                   # Framework-agnostic types + IframeBridge
│   ├── react-sdk/             # React hooks
│   ├── shell/                 # Tab manager, iframe loader
│   ├── ui-server/             # Hono server
│   └── extensions/           # Default extensions
│       └── thread-tree/
└── pi-apex.config.json        # Extension registry
```

## Adding a new package

1. Create under `packages/<name>/`
2. Add to the root `package.json` workspaces array
3. Add `file:../<name>` dependency to dependent packages
4. Add a TypeScript `tsconfig.json` with `composite: true`
5. Export from `packages/<name>/src/index.ts`
6. Run `npm run build` to verify it compiles

## Adding a new extension

1. Create `packages/extensions/<name>/`
2. Add `manifest.json` (see README for schema)
3. Register in `pi-apex.config.json`
4. Build with Vite to produce an IIFE bundle

## Code Style

- TypeScript strict mode is enforced (`"strict": true` in all tsconfigs)
- No `any` — use `unknown` and narrow appropriately
- Use ES2022+ features
- SDK must remain framework-agnostic — no React, Vue, etc. imports in `packages/sdk/`
- React SDK lives in `packages/react-sdk/` only

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add thread tree extension
fix: correct iframe bridge origin handling
docs: update SDK reference
refactor: split events into separate module
```

## Pull Request Checklist

- [ ] `npm run build` passes
- [ ] No TypeScript errors (`npm run typecheck`)
- [ ] New packages/extensions have a `manifest.json`
- [ ] Extensions registered in `pi-apex.config.json`
- [ ] No framework imports in `packages/sdk/`
- [ ] Commit message follows Conventional Commits

## Testing Extensions Locally

```bash
# Build the extension bundle
npx vite build --config packages/extensions/<name>/vite.config.ts

# Start the server
cd packages/ui-server && npm run dev

# Open
open http://localhost:3000
```

## Reporting Issues

Use [GitHub Issues](https://github.com/imankeeth/pi-apex/issues) with:
- The package/version you're using
- Steps to reproduce
- Expected vs actual behavior
- `pi-apex.config.json` (remove sensitive values)
