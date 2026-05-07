# Frontend Shell + Calculator Routes

## Parent spec

`docs/specs/2026-05-06-01-calculator-port.md`

## What to build

A working `frontend/` directory at the analyzer root, scaffolded fresh as React 18 + Vite + TypeScript + Tailwind + shadcn/ui + Recharts + react-router-dom + React Query. Cherry-picks shell pieces from the existing `mockup/` (theme, sidebar component, layout, shadcn primitives) but does NOT promote the whole mockup wholesale.

Sidebar exposes two new entries — **Coast FIRE** and **Mortgage** — routed to placeholder pages. The dev server proxies `/api` to the FastAPI backend at `:8000`. `make dev-frontend` works.

This plan is foundational scaffolding only. No calculator math, no tooltips, no charts, no backend changes.

## Type

AFK

## Blocked by

None — can start immediately.

## User stories addressed

From the parent spec:

- §"Frontend Architecture" — fresh React+Vite+TS+Tailwind+shadcn+Recharts stack
- §"Navigation & Routing" — two new bottom-of-sidebar entries (`/coast-fire`, `/mortgage`)
- §"Theming" — analyzer's dark teal theme as global style baseline

## Acceptance criteria

- [x] `frontend/` directory exists at repo root with Vite/React/TS scaffolding
- [x] `make dev-frontend` starts Vite at `localhost:5173`
- [x] Vite dev proxy: `localhost:5173/api/health` returns `{"status":"ok"}` from the backend
- [x] react-router-dom routes configured for `/`, `/coast-fire`, `/mortgage`, plus a 404
- [x] React Query provider wraps the app
- [x] Sidebar (cherry-picked from mockup) renders with two new entries: **Coast FIRE** (icon: `TrendingUp` from lucide-react) and **Mortgage** (icon: `Home`). Both navigate to placeholder pages that show the route name
- [x] Sidebar collapse/expand behavior works; tooltips show when collapsed
- [x] Dark teal theme applied globally (background, sidebar, monospace-numeric utility class available)
- [x] `frontend/package.json` lists exactly the deps needed (no unused mockup deps carried over without justification)
- [x] Production `npm run build` succeeds with no TS errors
- [x] `frontend/` has a `.gitignore` that excludes `node_modules/`, `dist/`, `.vite/`

## Owns

Files/directories this plan creates or modifies:

- `frontend/` — entire new directory tree
- `frontend/package.json`, `frontend/tsconfig*.json`, `frontend/vite.config.ts`, `frontend/index.html`, `frontend/tailwind.config.ts`, `frontend/postcss.config.js`, `frontend/.gitignore`
- `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/index.css`
- `frontend/src/components/Layout.tsx`, `frontend/src/components/AppSidebar.tsx`, `frontend/src/components/TopBar.tsx` (cherry-picked + adapted from `mockup/src/components/`)
- `frontend/src/components/ui/` — only the shadcn primitives needed for the shell (button, sheet, tooltip, separator, avatar — pull from `mockup/src/components/ui/` as needed)
- `frontend/src/lib/utils.ts` (cherry-picked from `mockup/src/lib/utils.ts` — the `cn()` helper)
- `frontend/src/pages/Home.tsx`, `frontend/src/pages/CoastFire.tsx`, `frontend/src/pages/Mortgage.tsx` (placeholder content only — `<h1>Coast FIRE</h1>` etc.)
- `Makefile` — update `dev-frontend` target if needed; existing target already references `frontend`

## Must not touch

- `mockup/` — leave intact for future cherry-picking by other plans
- `backend/` — no backend changes in this plan
- `frontend/src/lib/math/` — owned by plan `2026-05-06-02-shared-calculator-infra.md`
- `frontend/src/components/calculators/` — owned by plan `2026-05-06-02-shared-calculator-infra.md`
- `frontend/src/api/` — owned by plans `2026-05-06-03` and `2026-05-06-04`
- `docs/plans/frontend.md`, `docs/plans/backend.md`, `docs/plans/todo.md` — legacy plans, not part of the new pipeline

## Defines interfaces

- Sidebar nav-item schema (icon, label, route) in `frontend/src/components/AppSidebar.tsx` — consumed by plans `2026-05-06-03` and `2026-05-06-04` if they need to add badges or active-state customization
- Layout component slot structure (top bar, sidebar, main content area) — consumed by all subsequent calculator pages

## Pattern exemplar

This is a fresh scaffold of a React app, but the *style* and component selection should match the mockup so subsequent plans can keep cherry-picking cleanly.

- **Follow the pattern in**: `mockup/src/components/AppSidebar.tsx` — sidebar structure, collapse behavior, lucide icon usage
- **Follow the pattern in**: `mockup/src/components/Layout.tsx` — page layout shell
- **Follow the pattern in**: `mockup/index.html`, `mockup/vite.config.ts`, `mockup/tsconfig*.json` — Vite/TS config conventions
- **Follow the pattern in**: `mockup/src/index.css` — Tailwind + theme variables (dark teal)

## Tasks

- [x] Scaffold `frontend/` with Vite (`npm create vite@latest frontend -- --template react-ts`) or equivalent manual setup
- [x] Add Tailwind, PostCSS, autoprefixer; configure `tailwind.config.ts` matching mockup
- [x] Install runtime deps: `react-router-dom`, `@tanstack/react-query`, `recharts`, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tailwindcss-animate`, `next-themes`
- [x] Install Radix primitives needed for the shell only: `@radix-ui/react-slot`, `@radix-ui/react-tooltip`, `@radix-ui/react-separator`, `@radix-ui/react-avatar`
- [x] Configure `vite.config.ts` proxy: `/api → http://localhost:8000`
- [x] Cherry-pick `lib/utils.ts`, theme tokens from `mockup/src/index.css`, and the `ui/` primitives needed for the sidebar
- [x] Cherry-pick + adapt `Layout.tsx`, `AppSidebar.tsx`, `TopBar.tsx`. Strip out mockup-specific routes; keep only Home + the two new calculator entries
- [x] Add `pages/Home.tsx`, `pages/CoastFire.tsx`, `pages/Mortgage.tsx` with placeholder headings
- [x] Wire `App.tsx` with `BrowserRouter`, `QueryClientProvider`, `Routes`
- [x] Verify `make dev-frontend` runs and the proxy reaches `/api/health`
- [x] Verify `npm run build` succeeds with no TS errors
- [x] Add `frontend/` to repo `.gitignore` for `node_modules` and `dist` (or per-dir `.gitignore`)

## Implementation notes

- The existing `Makefile` already has `dev-frontend: cd frontend && npm run dev`. Confirm it works without changes; only modify if the install step needs codifying (`install` target currently only installs backend).
- **Do not** carry over the full mockup `package.json` deps list. Many entries (`embla-carousel`, `vaul`, `react-day-picker`, `cmdk`, `input-otp`, `react-hook-form`, `zod`, `date-fns`, etc.) aren't needed for the shell. Add deps as later plans require them.
- **Do not** copy `mockup/src/data/`, `mockup/src/hooks/`, or `mockup/src/pages/*` content. Those represent unrelated mockup screens and should be re-derived per plan as needed.
- The mockup uses `@vitejs/plugin-react-swc`. Either match that or use the standard `@vitejs/plugin-react` — pick one and document why in `frontend/README.md` if non-default.
- Sidebar entries should be data-driven (an array) so plans 3 and 4 can adjust labels/icons without a refactor. Place the calculator entries at the bottom, after the existing 6 conceptual entries (Overview, Transactions, Subscriptions, Budget, Forecast, Payments) — even though those pages don't exist yet, structure the array to accommodate them so the order in the spec is honored.
- Confirm that the global "top bar with date range + account filters" hides or no-ops on `/coast-fire` and `/mortgage` per the spec ("Global filters … do not apply to calculators").
