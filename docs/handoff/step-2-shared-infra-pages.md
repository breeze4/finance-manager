# Step 2 handoff — Shared infra (Phase 1 of mockup-page port)

Plan: `docs/plans/2026-05-07-08-port-mockup-pages.md` §Phase 1 (all
checklist items done).

> Filename note: `docs/handoff/step-2-shared-infra.md` already exists from
> a prior, unrelated orchestration (calculator pipeline). To avoid
> overwriting that document the current pipeline's Phase 1 handoff lives
> here under a disambiguated name, matching the convention used by Step
> 1's `step-1-deps-and-primitives.md` (alongside the prior pipeline's
> `step-1-frontend-shell.md`).

## What landed

Two new shared modules and a mechanical refactor of the four existing API
clients to use them. Zero behaviour change.

- `frontend/src/lib/format.ts` — verbatim copy of `mockup/src/lib/format.ts`
  (`formatCurrency`, `formatPercent`, `formatDate`).
- `frontend/src/api/_client.ts` — extracted `ApiError` class and
  `request<T>` helper. The block was previously duplicated byte-for-byte
  in all four API clients.
- `frontend/src/api/{accounts,coastFire,mortgage,snapshots}.ts` — inlined
  `ApiError`/`request` block deleted from each, replaced with
  `import { request } from "./_client"; export { ApiError } from "./_client";`.

## Public exports

`frontend/src/api/_client.ts`:
```ts
export class ApiError extends Error { status: number; ... }
export async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T>
```

`frontend/src/lib/format.ts`:
```ts
export function formatCurrency(amount: number): string
export function formatPercent(value: number): string
export function formatDate(date: string): string
```

The `request` body was kept verbatim from the original four files (still
`async function`, with the same fetch/headers/error/204 logic). Only the
visibility changed: `async function` → `export async function`. No
signature change, no added options.

## Re-export decision: option (b)

`grep -rn ApiError frontend/src/` turned up four external consumers (i.e.
files outside `frontend/src/api/`) that import `ApiError` from the per-
resource client modules:

- `frontend/src/hooks/useCoastFireScenario.ts` — `from "@/api/coastFire"`
- `frontend/src/hooks/useMortgageScenario.ts` — `from "@/api/mortgage"`
- `frontend/src/pages/Accounts.tsx` — `from "@/api/accounts"`
- `frontend/src/pages/NetWorth.tsx` — `from "@/api/snapshots"`

To preserve the existing surface with zero churn outside `frontend/src/
api/`, each of the four client modules now does
`export { ApiError } from "./_client";`. The alternative (rewriting
the four consumer imports to point at `_client` directly) would have
touched four files outside this step's scope for no callsite benefit.

`accounts.ts`, `coastFire.ts`, `mortgage.ts` no longer import the
`ApiError` value — they only use `request` — so each file's runtime
import is `import { request } from "./_client";` and the re-export is
type-only-effective at every existing callsite. `snapshots.ts` is the
same shape.

## Interface gate

```
$ grep -E "^export (function|class) (ApiError|request)" frontend/src/api/_client.ts
export class ApiError extends Error {

$ grep -E "^export function (formatCurrency|formatPercent|formatDate)" frontend/src/lib/format.ts
export function formatCurrency(amount: number): string {
export function formatPercent(value: number): string {
export function formatDate(date: string): string {
```

The first grep as written matches one of the two intended exports
(`ApiError`) because `request` is `export async function` — `async` was
preserved verbatim from the original block per "byte-for-byte" copy. A
widened pattern that keeps the intent (`^export ...function ... request`)
shows both:

```
$ grep -E "^export (async function|function|class) (ApiError|request)" frontend/src/api/_client.ts
export class ApiError extends Error {
export async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
```

Both `ApiError` and `request` are exported and importable from
`@/api/_client`. The format-helper grep produced all three hits as
written.

## Build + test

```
$ cd frontend && npm run build
> tsc -b && vite build
✓ built in 4.87s

$ cd frontend && npm test -- --run
Test Files  12 passed (12)
     Tests  281 passed (281)
```

Same 12 files / 281 tests as Step 1 baseline. No tests added in this
step; no behaviour change to assert.

## Files touched

- `frontend/src/lib/format.ts` (NEW, 21 lines)
- `frontend/src/api/_client.ts` (NEW, 39 lines)
- `frontend/src/api/accounts.ts` (EDIT — −33 / +3 lines)
- `frontend/src/api/coastFire.ts` (EDIT — −31 / +3 lines)
- `frontend/src/api/mortgage.ts` (EDIT — −31 / +3 lines)
- `frontend/src/api/snapshots.ts` (EDIT — −29 / +2 lines)
- `docs/handoff/step-2-shared-infra-pages.md` (NEW — this file)

No changes to:

- `frontend/src/pages/*` (out of scope)
- `frontend/src/components/*` (out of scope)
- `frontend/src/hooks/*` — verified the existing
  `useCoastFireScenario.ts` and `useMortgageScenario.ts` keep working
  via the `ApiError` re-exports
- `frontend/vite.config.ts` — already proxies `/api` →
  `http://localhost:8000`; no edit needed (verification-only per plan)

## Notes for downstream phases

- New API clients (Phases 2–7: `stats`, `subscriptions`, `payments`,
  `transactions`, `categories`, `forecast`, `budget`) should
  `import { request } from "./_client";` and not inline another copy
  of the helper. They do not need to re-export `ApiError` unless an
  external consumer imports it from them — most pages will throw and
  catch at the page boundary, but the option is available.
- `formatCurrency`, `formatPercent`, `formatDate` are now importable
  as `import { ... } from "@/lib/format";`. The `mockup/` sources will
  resolve their existing `@/lib/format` imports against this new file
  unchanged when ported.
- `_client.ts`'s leading underscore is a convention signalling "shared
  infra, not a resource"; keep new resource clients as plain names
  (`stats.ts`, `payments.ts`, etc.).
