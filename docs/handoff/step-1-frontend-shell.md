# Step 1 Handoff — Frontend Shell + Calculator Routes

Status: PASS. `npm run build` exit 0. `make test` 227 passed. `npm test --run --passWithNoTests` exits 0 with no test files yet.

## Vite plugin chosen

`@vitejs/plugin-react-swc` — chosen to match the `mockup/` source we cherry-picked from, so future cherry-picks of shadcn primitives or page scaffolding don't need plugin-specific tweaks.

## Final `frontend/package.json` deps

Runtime:

- `@radix-ui/react-avatar` ^1.1.10
- `@radix-ui/react-dialog` ^1.1.14 (required transitively by `ui/sheet.tsx`, which `ui/sidebar.tsx` uses for mobile sheet)
- `@radix-ui/react-select` ^2.2.5 (TopBar global filter selects)
- `@radix-ui/react-separator` ^1.1.7
- `@radix-ui/react-slot` ^1.2.3
- `@radix-ui/react-tooltip` ^1.2.7
- `@tanstack/react-query` ^5.83.0
- `class-variance-authority` ^0.7.1
- `clsx` ^2.1.1
- `lucide-react` ^0.462.0
- `next-themes` ^0.3.0
- `react` ^18.3.1
- `react-dom` ^18.3.1
- `react-router-dom` ^6.30.1
- `recharts` ^2.15.4
- `tailwind-merge` ^2.6.0
- `tailwindcss-animate` ^1.0.7

Dev:

- `@testing-library/jest-dom` ^6.6.0
- `@testing-library/react` ^16.0.0
- `@types/node` ^22.16.5
- `@types/react` ^18.3.23
- `@types/react-dom` ^18.3.7
- `@vitejs/plugin-react-swc` ^3.11.0
- `autoprefixer` ^10.4.21
- `jsdom` ^20.0.3
- `postcss` ^8.5.6
- `tailwindcss` ^3.4.17
- `typescript` ^5.8.3
- `vite` ^5.4.19
- `vitest` ^3.2.4

## Sidebar nav-item array shape

Located in `frontend/src/components/AppSidebar.tsx`:

```ts
const navItems = [
  { title: "Overview", url: "/", icon: LayoutDashboard },
  { title: "Transactions", url: "/transactions", icon: Receipt },
  { title: "Subscriptions", url: "/subscriptions", icon: RefreshCw },
  { title: "Budget", url: "/budget", icon: PiggyBank },
  { title: "Forecast", url: "/forecast", icon: TrendingUp },
  { title: "Payments", url: "/payments", icon: CreditCard },
  { title: "Coast FIRE", url: "/coast-fire", icon: TrendingUp },
  { title: "Mortgage", url: "/mortgage", icon: Home },
];
```

Item shape: `{ title: string; url: string; icon: LucideIcon }`. Icons are imported components from `lucide-react`. `TrendingUp` is shared between Forecast and Coast FIRE — that's intentional and matches the briefing.

## Vite proxy config

In `frontend/vite.config.ts`:

```ts
server: {
  host: "::",
  port: 5173,
  proxy: {
    "/api": {
      target: "http://localhost:8000",
      changeOrigin: true,
    },
  },
},
```

## Cherry-picked files from `mockup/`

All copied with paths preserved. Adaptations noted.

- `mockup/src/lib/utils.ts` -> `frontend/src/lib/utils.ts` — verbatim.
- `mockup/src/index.css` -> `frontend/src/index.css` — verbatim theme tokens; appended `.numeric` utility class (`tabular-nums` + monospace font stack) per spec for monospace numeric output.
- `mockup/src/hooks/use-mobile.tsx` -> `frontend/src/hooks/use-mobile.tsx` — verbatim. Required by `ui/sidebar.tsx`.
- `mockup/src/components/NavLink.tsx` -> `frontend/src/components/NavLink.tsx` — verbatim.
- `mockup/src/components/Layout.tsx` -> `frontend/src/components/Layout.tsx` — added `/coast-fire` and `/mortgage` to the `titleMap`.
- `mockup/src/components/AppSidebar.tsx` -> `frontend/src/components/AppSidebar.tsx` — added `Home` import from `lucide-react`; appended Coast FIRE + Mortgage entries to `navItems`.
- `mockup/src/components/TopBar.tsx` -> `frontend/src/components/TopBar.tsx` — added `useLocation()` and gated the global-filter Select group with `!isCalculatorRoute` so the date-range and account selects hide on `/coast-fire` and `/mortgage` per spec.
- `mockup/src/components/ui/sidebar.tsx` -> `frontend/src/components/ui/sidebar.tsx` — verbatim (comments removed for brevity, behavior unchanged).
- `mockup/src/components/ui/button.tsx` -> `frontend/src/components/ui/button.tsx` — verbatim.
- `mockup/src/components/ui/input.tsx` -> `frontend/src/components/ui/input.tsx` — verbatim.
- `mockup/src/components/ui/separator.tsx` -> `frontend/src/components/ui/separator.tsx` — verbatim.
- `mockup/src/components/ui/skeleton.tsx` -> `frontend/src/components/ui/skeleton.tsx` — verbatim.
- `mockup/src/components/ui/tooltip.tsx` -> `frontend/src/components/ui/tooltip.tsx` — verbatim.
- `mockup/src/components/ui/sheet.tsx` -> `frontend/src/components/ui/sheet.tsx` — verbatim.
- `mockup/src/components/ui/select.tsx` -> `frontend/src/components/ui/select.tsx` — verbatim.

Tailwind / TS / PostCSS / Vite / index.html configs follow the mockup conventions; `vite.config.ts` drops `lovable-tagger`, sets port `5173`, and adds the `/api` proxy.

## shadcn UI primitives included

Files in `frontend/src/components/ui/`:

- `button.tsx`
- `input.tsx`
- `select.tsx`
- `separator.tsx`
- `sheet.tsx`
- `sidebar.tsx`
- `skeleton.tsx`
- `tooltip.tsx`

This is the minimum chain needed for `Sidebar` (which depends on `Sheet`, `Tooltip`, `Button`, `Input`, `Separator`, `Skeleton`) plus `Select` (used by `TopBar`).

## Theme defaults

`<html class="dark">` is set directly in `frontend/index.html` so the analyzer renders dark-first on initial paint. `tailwind.config.ts` is configured with `darkMode: ["class"]`. `next-themes` is installed but not yet wired — left for a future plan if a toggle is wanted.

## Notes for steps 2/3/4

- The sidebar uses `collapsible="icon"`. Collapsed state shows tooltips via the cherry-picked `Tooltip` primitive — confirmed wired in `SidebarMenuButton`.
- Sidebar state persists to a `sidebar:state` cookie (logic kept from mockup).
- `noUnusedLocals`/`strict` are loose in `tsconfig.app.json` matching the mockup. Subsequent steps adding math should still compile cleanly under stricter settings if they enable them locally.
- React Query is configured with default options — no global retry/staleTime customisation. If step 3/4 want different defaults for scenario fetching, set them per-query.
- The Layout component already wires `<Outlet />` so step 3/4 just need to add Routes inside `App.tsx` if any sub-routes appear; otherwise the existing `/coast-fire` and `/mortgage` entries are ready for full content.
- `next-themes` is a dependency but not currently used. Drop it in package.json if step 2/3/4 don't end up using it for a theme toggle — flagged so it isn't carried as dead weight.
- No avatar primitive cherry-picked yet (`@radix-ui/react-avatar` is installed because the briefing called for it; nothing in the shell uses it). If step 3/4 don't need it either, drop the dep.
- `useIsMobile()` returns `false` until the first effect runs; this matches mockup behaviour and avoids SSR concerns. Sidebar will mount expanded on desktop.
- Mockup's `tsconfig.json` has `strictNullChecks: false` — preserved here. If your math library needs strictness, add a localized tsconfig in `src/lib/math/`.
