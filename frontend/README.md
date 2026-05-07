# Finance Analyzer Frontend

React 18 + Vite + TypeScript + Tailwind + shadcn/ui shell for Finance Analyzer.

## Stack notes

- **Vite plugin**: `@vitejs/plugin-react-swc` (chosen to match `mockup/` cherry-pick origin so subsequent plans can keep cherry-picking shadcn primitives without surprises).
- **Routing**: react-router-dom.
- **Server state**: @tanstack/react-query.
- **Charts**: recharts.
- **Theme**: dark teal, dark-first (`<html class="dark">` set in `index.html`).

## Scripts

- `npm run dev` — start Vite dev server on `:5173`. Proxies `/api` to `http://localhost:8000` (FastAPI backend).
- `npm run build` — type-check (`tsc -b`) and produce production bundle.
- `npm test` — run Vitest in watch mode (`-- --run` for one-shot).

## Layout

```
src/
  components/
    Layout.tsx          # SidebarProvider + AppSidebar + TopBar + <Outlet />
    AppSidebar.tsx      # data-driven nav menu
    TopBar.tsx          # title + global filters (hidden on calculator routes)
    NavLink.tsx         # react-router-dom NavLink wrapper with activeClassName
    ui/                 # shadcn primitives (cherry-picked from mockup/)
  lib/utils.ts          # cn() helper
  pages/                # route entries (placeholder content)
```
