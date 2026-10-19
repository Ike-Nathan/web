# Contributing to stellar-txwatch-web

Thanks for your interest in contributing! This is the web dashboard for the [Tx-wats](https://github.com/Tx-wats) org.

## Sister repos

| Repo                                                                              | Description                   |
| --------------------------------------------------------------------------------- | ----------------------------- |
| [stellar-txwatch-core](https://github.com/Tx-wats/stellar-txwatch-core)           | Rust monitoring engine        |
| [stellar-txwatch-contracts](https://github.com/Tx-wats/stellar-txwatch-contracts) | Soroban smart contracts       |
| [web](https://github.com/Tx-wats/web)                                             | This repo - Next.js dashboard |

## Local setup

```bash
git clone https://github.com/Tx-wats/web
cd web
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Requirements

- Node.js 18.17 or later
- npm (installed with Node.js)
- [Freighter wallet extension](https://www.freighter.app/) for wallet-gated features

Note: The project specifies `engines.node >= 18.17` in `package.json`. CI enforces this using Node 20.

## Branch naming

```
feat/<short-description>
fix/<short-description>
chore/<short-description>
```

## Commit style

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(component): add X
fix(page): correct Y
chore: update deps
```

## Git hooks

After dependencies are installed, Husky runs `lint-staged` before each commit. It applies ESLint fixes and Prettier to staged JavaScript/TypeScript files, and Prettier to staged JSON, Markdown, CSS/SCSS, and YAML files. Before each push, it runs `npm run typecheck`.

In an emergency, set `HUSKY=0` for the single Git command to bypass hooks, for example `HUSKY=0 git commit` or `HUSKY=0 git push`. Use this sparingly and run the skipped checks before opening or updating a pull request.

## TypeScript types

All types live in `types/index.ts` and must stay in sync with the Rust structs in `stellar-txwatch-core`. Do not add fields here without a matching change in the core engine.

`WatchedContract.enabled` is an optional boolean (`enabled?: boolean`). When the field is absent, the contract is treated as enabled (`absent = true`). Any change to this field must be mirrored in the `stellar-txwatch-core` type definitions.
For browser-persisted data, also update the [Browser Storage Schema](docs/storage-schema.md). Changes to a stored shape need an owning type/read/write update, a versioned migration and test when existing data needs transformation, and an update to the schema reference. Do not store credentials such as webhook signing secrets in localStorage.

## Branch protection and required checks

`main` is protected. The following rules are enforced in the GitHub repository settings (Settings → Branches → Branch protection rules) and cannot be bypassed by contributors:

- **Required status checks:** the `ci` job from `.github/workflows/ci.yml` (lint, typecheck, tests, build) must pass before a PR can be merged.
- **Require branches to be up to date:** a PR must be rebased or merged with the latest `main` before merging, so checks run against the current base.
- **No force-push:** force-pushing to `main` is disallowed.
- **Code owner review:** reviews are requested automatically via `.github/CODEOWNERS`, and an approving review from a code owner is required.

PRs with red or stale checks must not be merged — wait for CI to pass on the latest commit, and update the branch if it falls behind `main`. Do not use admin overrides to merge around these rules.

## Pull requests

- Keep PRs focused - one feature or fix per PR
- All pages must be mobile responsive and dark-mode compatible
- Run `npm run format`, `npm run typecheck`, and `npm run lint` before opening a PR
- Update documentation if you modify file responsibilities — see [ARCHITECTURE.md](../ARCHITECTURE.md)
- Include a PR description matching the template in `.github/pull_request_template.md`

### Pre-submission checklist

```bash
npm run format      # Auto-format code
npm run format:check # Verify formatting
npm run typecheck   # Check TypeScript types
npm run lint        # Run ESLint
npm run build       # Verify the build
```
