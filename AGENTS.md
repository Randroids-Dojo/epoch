# Epoch — Agent & Contributor Guidelines

## Mandatory Quality Gates

Every change **must** pass all four gates before merge. Run them in order:

```bash
npm run lint          # ESLint + Next.js rules
npm run typecheck     # TypeScript (no emit)
npm run test          # Vitest unit tests
npm run test:e2e      # Playwright e2e tests
```

CI enforces all four automatically on every push/PR and will block merges on failure.

### Local vs CI E2E Testing

When working locally, always run **lint**, **typecheck**, and **unit tests** before pushing. For **E2E tests**, it is acceptable to let CI run them via the PR pipeline rather than running them locally — the dev server may not be available, ports may conflict, or browser dependencies may differ from CI. Push your branch, open/update the PR, and let CI validate E2E. Fix any failures in subsequent commits.

---

## Testing Overview

| Layer | Framework | Location | When to run |
|---|---|---|---|
| Unit | Vitest + Testing Library | `tests/**/*.{test,spec}.{ts,tsx}` (excluding `tests/e2e/`) | Every change |
| E2E | Playwright | `tests/e2e/**` | Every change |
| Smoke | Playwright (`@smoke` tag) | Subset of `tests/e2e/` | Post-deploy sanity check |

---

## Unit Tests (Vitest)

**Config:** `vitest.config.ts`
**Run:** `npm run test` (single pass) or `npm run test:watch` (interactive)

Tests use `@testing-library/react` for component tests and plain Vitest for engine logic.

### Writing unit tests

- Place files in `tests/<area>/` mirroring the source structure (e.g. `tests/engine/`, `tests/components/`)
- Name files `*.test.ts` or `*.spec.ts`
- Import test helpers from `vitest` directly — do **not** import from `jest`

```ts
// tests/engine/my-system.test.ts
import { describe, it, expect } from 'vitest'
import { myFunction } from '@/engine/my-system'

describe('myFunction', () => {
  it('returns expected result', () => {
    expect(myFunction(input)).toBe(expected)
  })
})
```

### Writing component tests

```ts
import { render, screen } from '@testing-library/react'
import { MyComponent } from '@/components/MyComponent'

it('renders label', () => {
  render(<MyComponent label="hello" />)
  expect(screen.getByText('hello')).toBeInTheDocument()
})
```

Path aliases (`@/`) resolve via `vite-tsconfig-paths` — use them freely.

---

## Dependency Guard (`scripts/run-if-deps.mjs`)

`test:e2e` and `test:smoke` are wrapped by `scripts/run-if-deps.mjs`. If `node_modules/` is absent the script prints a notice and exits **0**, so these commands never hard-fail in cloud/CI environments that haven't run `npm install` (e.g. a job that only consumes a pre-built artifact). All other test commands (`lint`, `typecheck`, `test`) fail normally if deps are missing.

---

## E2E Tests (Playwright)

**Config:** `playwright.config.ts`
**Run:** `npm run test:e2e`

Runs against Chromium (desktop) and iPhone 14 by default. In CI, workers=1 with 2 retries.

### Writing e2e tests

Place files in `tests/e2e/`. Playwright auto-discovers `*.spec.ts` files there.

```ts
// tests/e2e/home.spec.ts
import { test, expect } from '@playwright/test'

test('homepage loads', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/Epoch/)
})
```

### Targeting a remote URL

Set `BASE_URL` to skip the local dev server:

```bash
BASE_URL=https://my-preview.vercel.app npm run test:e2e
```

---

## Smoke Tests (Playwright, `@smoke` tag)

**Run:** `npm run test:smoke`

Smoke tests are a fast subset of e2e tests that verify critical paths after deployment. Tag a test as a smoke test by including `@smoke` in its title:

```ts
test('game canvas renders @smoke', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('canvas')).toBeVisible()
})
```

Run smoke tests against a deployed preview:

```bash
BASE_URL=https://my-preview.vercel.app npm run test:smoke
```

CI automatically runs smoke tests after each preview deployment.

---

## Linting

**Config:** `eslint.config.mjs` — extends `next/core-web-vitals` + `next/typescript`
**Run:** `npm run lint`

Fix auto-fixable issues with `npm run lint -- --fix`. Do not disable lint rules inline without a comment explaining why.

---

## Type Checking

**Run:** `npm run typecheck`

This runs `tsc --noEmit` against the full project. Fix all type errors before committing — do **not** use `@ts-ignore` or `any` as a workaround.

---

## CI Pipeline

`.github/workflows/ci.yml` runs on every push and PR:

1. **Check** — lint → typecheck → unit tests → e2e tests → build
2. **Deploy Preview** (PRs only) — deploys to Vercel preview environment
3. **Smoke Tests** (PRs only) — runs `@smoke` suite against the preview URL
4. **Deploy Production** (main branch only) — deploys to Vercel production

All jobs in step 1 must pass before deployment proceeds.

---

## Project Structure

```
app/          Next.js app router pages and layouts
components/   Shared React components
engine/       Game logic (pure TS, no React)
lib/          Constants, types, shared utilities
renderer/     Canvas/WebGL rendering layer
audio/        Audio engine
tests/
  engine/     Unit tests for engine/
  e2e/        Playwright e2e and smoke tests
```

---

## Key Commands Reference

```bash
npm run dev           # Start dev server (http://localhost:3000)
npm run build         # Production build
npm run lint          # Lint all files
npm run typecheck     # Type check
npm run test          # Unit tests (single run)
npm run test:watch    # Unit tests (watch mode)
npm run test:e2e      # E2E tests (starts dev server automatically)
npm run test:smoke    # Smoke tests only (requires BASE_URL for remote targets)
```
