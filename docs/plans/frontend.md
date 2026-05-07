# Finance Analyzer — Frontend Implementation Plan

All frontend phases, in implementation order. The backend plan is in `backend.md`. Backend implementation plan is in `todo.md`.

## Dependencies

Frontend phases depend on backend APIs being available. Each phase notes which backend phase must be complete before it can start.

---

# TIER 1 — Foundation

---

## Phase F1: Frontend Scaffolding

**Depends on:** B1 (root Makefile exists, proxy target available)

### Overview
Scaffold the React app. Vite dev server proxying to backend. App loads in browser.

### Tasks

- [ ] F1.1 Scaffold `frontend/` with Vite + React + TypeScript
- [ ] F1.2 Configure `frontend/vite.config.ts` to proxy `/api` to backend (`localhost:8000`)
- [ ] F1.3 Install base dependencies: react-router-dom, component library (TBD from mockup)
- [ ] F1.4 Verify `make dev-frontend` starts Vite and `localhost:5173/api/health` returns health response through proxy

### Success Criteria

- [ ] `make dev-frontend` starts Vite
- [ ] Frontend proxy: `localhost:5173/api/health` returns health response
- [ ] Frontend loads in browser at localhost:5173

---

## Phase F2: Minimal Frontend Shell

**Depends on:** B4 (Transaction API & Stats), B5 (Classification), B6 (Payment Matching)

### Overview
Thin frontend wired to backend APIs. Enough to verify Tier 1 works end-to-end. Visual design deferred to mockup iteration.

### Scope

- Tab/sidebar navigation: Overview, Transactions, Payments (other pages added in later tiers)
- Transaction list: table with filters, inline category dropdown, bulk select
- Overview: summary cards from `/api/stats/summary`, monthly spending from `/api/stats/monthly`
- Payments: matched pairs from `/api/payments`
- Import button: calls `POST /api/import/all`

### Tasks

- [ ] F2.1 Set up API client layer (`frontend/src/api/`) with typed fetch wrappers for all Tier 1 endpoints
- [ ] F2.2 Set up routing with sidebar navigation (Overview, Transactions, Payments)
- [ ] F2.3 Transactions page — table, filters (account, date range, category, search), sorting, pagination
- [ ] F2.4 Transactions page — inline category edit dropdown, bulk select + bulk category assign
- [ ] F2.5 Overview page — summary cards (total spending, income, savings rate, transaction count)
- [ ] F2.6 Overview page — basic spending chart (monthly bar chart)
- [ ] F2.7 Payments page — matched pairs list
- [ ] F2.8 Import trigger button (header or sidebar)

### Success Criteria (Manual)

- [ ] All 3 pages load and display data from the backend
- [ ] Transaction filtering, sorting, pagination work
- [ ] Classifying a transaction persists and auto-creates a rule
- [ ] Bulk classification works
- [ ] Import button imports data and refreshes views
- [ ] No console errors

---

**End of Tier 1 Frontend.** Basic app is functional end-to-end.

---

# TIER 2 — Analytics

---

## Phase F3: Subscriptions Page

**Depends on:** B7 (Subscription Detection)

### Overview
Display detected subscriptions. Two tabs: fixed subscriptions and variable recurring. Summary cards with counts and annual totals.

### Tasks

- [ ] F3.1 Add API client methods for subscription endpoints
- [ ] F3.2 Add Subscriptions page to sidebar navigation
- [ ] F3.3 Fixed subscriptions tab — table with vendor, amount, frequency, annual cost, last charge, category
- [ ] F3.4 Variable recurring tab — table with vendor, amount range, frequency, annual estimate
- [ ] F3.5 Summary cards (count + annual total per tab)
- [ ] F3.6 Detect button to trigger `POST /api/subscriptions/detect`

### Success Criteria (Manual)

- [ ] YouTube Premium and Crunchyroll visible as fixed monthly
- [ ] Vanguard visible as recurring
- [ ] No obviously wrong or major missing entries

---

## Phase F4: Budget Page

**Depends on:** B8 (Historical Analysis), B9 (Budget CRUD & Actual vs Budget)

**Reference mockup:** `mockup/src/pages/Budget.tsx`, `mockup/src/data/mockBudgetData.ts`

### Overview

Budget page with 4 sub-tabs: Historical, Set Budget, Actual vs Budget, Flex Budget. Default active tab is "Actual vs Budget". Tab bar is sticky at the top (z-20) in a 4-column grid.

### Shared Components

**MonthSelector** — Reusable pill-button month selector used by Set Budget and Actual vs Budget tabs.
- Row of small buttons (h-7, text-xs) with short month names (Jan, Feb, etc.)
- Selected month uses `variant="default"`, others use `variant="outline"`
- Current month has a green dot indicator (w-1.5, h-1.5 rounded-full bg-green-400) next to label
- Optional "All" button at the start
- Optional per-month annotations: when provided, buttons are taller (h-10) and show two lines next to the label — a colored percentage and a muted delta amount (both text-[9px] font-mono)

**BudgetEntry state model** — Per-category state:
- `targetAmount`: raw input (monthly or yearly depending on period)
- `targetPeriod`: "monthly" | "yearly"
- `overrides`: Record<month, amount> for per-month overrides
- `mode`: "fixed" | "rollover"
- `unlockedMonths`: Record<month, boolean> for yearly categories (which months are unlocked for editing)

### Tasks

- [ ] F4.1 Add API client methods for budget endpoints (historical stats, CRUD, actual vs budget, transactions-by-category)
- [ ] F4.2 Add Budget page to sidebar navigation with sub-tab routing (Tabs component, 4-column grid)

#### F4.3 — Historical Tab

Stats table + stacked bar chart. Read-only, no user input.

- [ ] F4.3a Stats table with columns: Category, Avg, Median, Range (min–max), Std Dev, 80% CI, Trend, Seasonal
  - Trend column: icon + label. TrendingUp (red/destructive) for increasing, TrendingDown (green/success) for decreasing, ArrowRight (muted) for stable
  - Seasonal column: Badge(variant="outline") pills for spike months (e.g., "December", "Winter"), or em-dash if none
  - Alternating row backgrounds (bg-card / bg-card/50)
  - All numeric cells use font-mono
  - Table has rounded-lg border, overflow-x-auto
- [ ] F4.3b Stacked bar chart: top 6 variable categories over all historical months (Recharts BarChart, stackId="spending")
  - Chart colors: blue hsl(220,70%,55%), teal hsl(173,58%,39%), purple hsl(280,60%,55%), yellow hsl(45,90%,50%), red hsl(350,70%,55%), green hsl(150,60%,45%)
  - Inline labels on the rightmost bar only (LabelList with custom content renderer) — category name positioned just outside the bar segment, colored to match the series
  - Dark grid lines: strokeDasharray="3 3", stroke hsl(225,15%,18%)
  - Right margin (110px) to accommodate inline labels
  - Tooltip with dark styling (bg hsl(225,22%,11%), border hsl(225,15%,18%))

#### F4.4 — Set Budget Tab

Category budget configuration table with month selector.

- [ ] F4.4a Sticky month selector bar (top-[52px] z-10) with "All" + future months (current month onward). "Suggest Budgets" button (variant="outline") right-aligned next to selector
- [ ] F4.4b Budget table with columns: Category, Period, Target/Budget, Historical Avg, Mode, Status
  - **Category column**: name + override count badge (when viewing "All" and overrides exist, e.g., "1 override")
  - **Period column**: clickable toggle pill. Monthly shows CalendarDays icon + "Monthly" (muted border). Yearly shows Calendar icon + "Yearly" (amber border/bg/text: border-amber-500/50 bg-amber-500/10 text-amber-400)
  - **Target column**: $ prefix + number input (w-24, font-mono, right-aligned). When viewing "All": shows raw targetAmount. When viewing a specific month: shows the override value if set, otherwise the derived monthly amount. For yearly categories in "All" view: shows "= $X/mo" equivalent text after the input
  - **Lock/Unlock**: for yearly categories viewing a specific month (when no override exists), a Lock/Unlock button. Locked = grayed out input (cursor-not-allowed). Unlock icon turns amber (text-amber-400)
  - **Clear override (X button)**: appears when an override exists for the selected month
  - **Historical Avg column**: font-mono, muted, shows "$X/mo"
  - **Mode column**: clickable toggle pill. Fixed shows Lock icon + "Fixed" (muted border). Rollover shows RefreshCw icon + "Rollover" (teal: border-primary/50 bg-primary/10 text-primary)
  - **Status column**: "Override" badge (variant="secondary") when overridden, "Locked" (muted text) when yearly and locked, "Default" (muted text) otherwise
- [ ] F4.4c Period toggle behavior: switching Monthly→Yearly multiplies target by 12; switching Yearly→Monthly divides by 12 (rounded)
- [ ] F4.4d Override editing: when a specific month is selected, editing the input creates/updates an override for that month. Clearing (X button) removes the override and reverts to the base target

#### F4.5 — Actual vs Budget Tab

Month-by-month budget tracking with the BudgetVarianceChart.

- [ ] F4.5a Sticky month selector (top-[52px] z-10) showing months from Jan of current year through current month. Each month button has annotations showing: colored spending percentage, muted delta amount. Color tiers: teal (<85%), yellow (85–115%), red (>115%)
- [ ] F4.5b Partial-data notice for the current month: "Partial data for the current month (Feb 2026)."
- [ ] F4.5c Total summary card: "Total: $X of $Y" with colored percentage and full-width progress bar (h-3 rounded-full). Colors: green <75%, yellow 75–100%, red >100%
- [ ] F4.5d **BudgetVarianceChart** — the main visualization (see detailed spec below)

#### F4.5d — BudgetVarianceChart Detailed Spec

Custom chart component. NOT a Recharts chart — it's a fully custom div-based visualization. Housing is excluded from the chart.

**Zone-mapping function** (`mapToZonePosition`): maps budget percentage to visual position using fixed-width zones:
- 0–85% actual → 0–70% of bar width (normal spending zone)
- 85–115% actual → 70–90% of bar width (warning zone)
- 115%+ actual → 90–100% of bar width (overage zone, capped at ~150%)

**Column header row** (h-7, text-[10px], uppercase, tracking-wider):
- Expand/collapse all chevron button (toggles all rows)
- "Category" label (w-28)
- Sortable "Budget" column (w-24, right-aligned)
- Sortable "Actual" column (w-20, right-aligned)
- Sortable "Remaining" column (w-20, right-aligned)
- Zone labels spanning the bar area (flex-1): "0–85%", "85–115%", "115%+" — each proportionally sized (70%/20%/10%). Clicking sorts by percentage
- Sort indicators: ArrowUp/ArrowDown icons next to active sort column. Clicking same column toggles asc/desc. Default sort: budget descending

**Per-category bar row** (h-9, clickable for expand/collapse, hover:bg-secondary/20):
- Chevron icon (rotates 90deg when expanded)
- Category name (w-28, text-xs, truncated) with rollover icon (RefreshCw, teal) if mode is rollover
- Budget amount (w-24, text-[10px] font-mono) with carryover annotation if nonzero: green "+$X" for surplus, red "-$X" for deficit, text-[9px]
- Actual amount (w-20, text-[10px] font-mono)
- Remaining amount (w-20, text-[10px] font-mono): green if positive, red if negative (with minus sign prefix)
- **Bar area** (flex-1, h-5, relative):
  - Zone background strips: 3 adjacent divs at 70%/20%/10% width with subtle fills — teal hsla(173,40%,35%,0.14), yellow hsla(45,90%,50%,0.10), red hsla(0,60%,50%,0.10)
  - Zone dividers: vertical lines at 70% and 90% positions (1px solid hsla(0,0%,100%,0.08))
  - 100% budget mark: dashed vertical line at mapToZonePosition(100)% (1px dashed hsla(0,0%,100%,0.15))
  - **Solid fill bar**: from left edge to mapToZonePosition(pct)%, min-width 4px if nonzero. Background color by tier:
    - <85%: teal hsl(173,40%,22%)
    - 85–115%: yellow hsl(45,90%,32%)
    - >115%: red hsl(0,60%,32%)
    - Percentage label inside bar (text-[10px] font-mono, right-aligned with px-2)
  - **Hatched remaining** (under-budget only): from fill end to 100% budget mark. Repeating -45deg diagonal stripe pattern using tier stripe color. Rounded right edge, 1px border in tier border color

**Tier color palette** — each tier defines: solid, muted, glow, text, stripe, border, pillBg:
- <85% (teal): solid hsl(173,40%,22%), stripe hsla(173,40%,22%,0.08), border hsla(173,40%,22%,0.2)
- 85–115% (yellow): solid hsl(45,90%,32%), stripe hsla(45,90%,32%,0.1), border hsla(45,90%,32%,0.25)
- >115% (red): solid hsl(0,60%,32%), stripe hsla(0,60%,32%,0.08), border hsla(0,60%,32%,0.2)

**Expanded transaction waterfall** (shown when category row is clicked):
- Header row: Date (w-16), Vendor (w-32), Amount (w-20, right), Cumulative (w-24, right), bar area (flex-1). Dark background (#151d35), text-[9px]
- Transaction rows (h-5, text-[10px] font-mono):
  - Alternating backgrounds: #1a2340 / #151d35
  - Date: month-day only (slice off year), muted
  - Vendor: truncated, muted
  - Amount: muted
  - Cumulative: running total after this transaction, muted/60
  - **Waterfall bar area**: same zone background strips as parent but with higher opacity (0.60/0.44/0.44). Each transaction shows a segment bar positioned from cumBefore to cumAfter (mapped through mapToZonePosition). Bar fill: rgba(255,255,255,0.25) (neutral white). Inset 0.5 from top/bottom. Min width 0.5%
  - Hover: brightness-[1.15] transition
- Transactions sorted chronologically by date

**Legend** (centered, pt-4, text-[10px]):
- 5 items: "0–85%" (teal mini-bar), "85–115%" (yellow mini-bar), "115%+" (red mini-bar), "Remaining" (hatched pattern swatch), "Overage" (+$ pill in red)

### Success Criteria (Manual)

- [ ] Historical stats display with all 8 columns populated
- [ ] Stacked bar chart renders with inline labels
- [ ] Can set a budget and see it reflected in Actual vs Budget
- [ ] Monthly/yearly period toggle converts amounts correctly
- [ ] Monthly override changes only that month's target
- [ ] Lock/unlock works for yearly categories
- [ ] BudgetVarianceChart renders with zone-mapped proportional bars
- [ ] Zone backgrounds, dividers, and 100% mark are visible
- [ ] Sorting by any column works (budget, actual, remaining, percentage)
- [ ] Expand/collapse all chevron works
- [ ] Clicking a category row expands to show transaction waterfall
- [ ] Transaction waterfall bars are positioned correctly with cumulative amounts
- [ ] Expanded transaction amounts sum to the category actual
- [ ] Rollover categories show carryover annotation and RefreshCw icon
- [ ] Month annotations on Actual vs Budget selector show correct percentages and deltas

---

**End of Tier 2 Frontend.**

---

# TIER 3 — Advanced

---

## Phase F5: Budget Suggestions UI

**Depends on:** B10 (Budget Suggestions)

**Reference mockup:** `mockup/src/pages/Budget.tsx` (handleSuggest function in SetBudgetView)

### Overview

The "Suggest Budgets" button is already placed in F4.4a. This phase wires it to the backend suggestion endpoint instead of local computation.

### Mockup Behavior (to replicate precisely)

The mockup's `handleSuggest` does:
1. For each category with existing budget state, set targetAmount from historical average (respecting the current targetPeriod — multiply by 12 if yearly)
2. Detect seasonal overrides: if category has "December" spike, set override for 2026-12 at avg + 1.5*stdDev. If "Winter" spike, set override for Jan/Feb at avg + stdDev (only for months >= currentMonth)
3. Clear any overrides that don't have seasonal justification
4. Preserve existing targetPeriod and mode settings — only amounts change

### Tasks

- [ ] F5.1 Add API client for suggestions endpoint (returns per-category: suggested amount, basis text, seasonal overrides)
- [ ] F5.2 Wire "Suggest Budgets" button to call the API, populate the Set Budget table with returned values
- [ ] F5.3 Suggestion application: update targetAmount per category, set seasonal overrides, preserve user's period/mode choices

### Success Criteria (Manual)

- [ ] Clicking "Suggest Budgets" populates amounts from backend
- [ ] Seasonal months get override amounts
- [ ] Period and mode settings are preserved
- [ ] Values visibly change from the pre-suggestion state

---

## Phase F6: Forecast Page

**Depends on:** B11 (Forecasting)

### Tasks

- [ ] F6.1 Add API client methods for forecast endpoints
- [ ] F6.2 Add Forecast page to sidebar navigation
- [ ] F6.3 Spending projection chart — solid line for actual months, dashed for projected
- [ ] F6.4 Projection table — monthly breakdown with projected vs actual columns
- [ ] F6.5 Year-over-year comparison — grouped bar chart
- [ ] F6.6 Known recurring charges list (context for projections)

### Success Criteria (Manual)

- [ ] Chart shows actual vs projected months with visual distinction
- [ ] YoY comparison renders with available data
- [ ] Projection numbers are reasonable

---

## Phase F7: Rollover Budget UI

**Depends on:** B12 (Rollover Budgets)

**Reference mockup:** `mockup/src/pages/Budget.tsx` (getRolloverBudget function, mode toggle in SetBudgetView, carryover display in BudgetVarianceChart)

### Overview

The rollover toggle and visual indicators are placed in F4, but this phase wires them to the backend rollover calculation endpoint. The mockup computes rollover locally — the real app fetches effective budgets from the backend.

### Mockup Behavior (to replicate precisely)

**Set Budget tab** (already laid out in F4.4b):
- Mode column: clickable pill toggling "Fixed" (Lock icon, muted) ↔ "Rollover" (RefreshCw icon, teal border-primary/50 bg-primary/10 text-primary)
- Toggle persists via budget CRUD API

**Actual vs Budget tab** — rollover-aware display:
- `getRolloverBudget(entry, category, month)` returns `{ effective, carryover }`:
  - Iterates all months prior to selected month
  - For each prior month: carryover += baseBudget - actual
  - effective = baseBudget + carryover
- Budget column shows effective amount, with carryover annotation: green "+$X" for surplus, red "-$X" for deficit (text-[9px])
- RefreshCw icon (w-3, h-3, text-primary) next to category name for rollover categories
- Remaining = effective - actual (can be more generous than fixed due to carryover)

### Tasks

- [ ] F7.1 Wire mode toggle in Set Budget to backend (persist rollover/fixed per category)
- [ ] F7.2 Actual vs Budget tab: fetch effective budget from backend rollover endpoint (replaces local computation)
- [ ] F7.3 Display carryover annotation next to budget amount and RefreshCw icon next to category name (layout already in F4 markup)

### Success Criteria (Manual)

- [ ] Toggling rollover on a category persists across page reload
- [ ] Surplus/deficit accumulation visible as carryover annotations
- [ ] Effective budget amount changes based on prior months' spending
- [ ] RefreshCw icon distinguishes rollover categories

---

**End of Tier 3 Frontend.**

---

# TIER 4 — Polish (Frontend)

These can be done in any order. Each is independent.

---

## Phase F8: Flex Budget View

**Depends on:** B14 (Flex Budget Backend)

**Reference mockup:** `mockup/src/pages/Budget.tsx` (FlexBudgetView component)

### Overview

The Flex Budget tab is the 4th tab on the Budget page (tab value "flex"). Tab placement is in F4.2. This phase wires it to the backend.

### Mockup Behavior (to replicate precisely)

**Hero card** (border-primary/30 accent):
- Centered text: "You have left to spend this month"
- Large remaining amount (text-4xl font-bold font-mono): green if positive, red if negative
- Breakdown formula below: "$X income − $Y fixed − $Z flexible spending" (text-xs muted)
- Remaining = monthlyIncome - fixedTotal - flexibleSpent

**Bucket sections** — 3 Card components, each containing:
- Header: bucket label (text-sm font-medium) + description (text-xs muted) on left, "actual of budgeted" amounts (font-mono) on right
- Progress bar (h-2.5 rounded-full): green <75%, yellow 75–100%, red >100%
- Per-category line items: category name (muted) left, "actual / budgeted" (font-mono) right. Each on a single row (text-xs)

**Buckets:**
- "Fixed Expenses" — "Predictable, committed costs" — categories: Housing, Insurance, Subscriptions, Utilities
- "Flexible Expenses" — "Discretionary, adjustable spending" — categories: Groceries, Dining, Entertainment, Shopping, Transportation, Health
- "Non-Monthly Expenses" — "Prorated irregular bills" — only shown if items exist

### Tasks

- [ ] F8.1 Add API client for flex budget endpoint (returns: income, buckets with categories/budgeted/actual)
- [ ] F8.2 Flex Budget tab: hero card with remaining amount and income breakdown formula
- [ ] F8.3 Flex Budget tab: bucket cards (fixed, flexible, non-monthly) with progress bars and per-category line items

### Success Criteria (Manual)

- [ ] Remaining amount is correct (income - fixed - flexible)
- [ ] Hero card colors green/red based on remaining sign
- [ ] Each bucket shows correct categories with progress bar
- [ ] Non-monthly section hidden when empty
- [ ] Per-category amounts sum to bucket total

## Phase F9: Recurring Calendar View

**Depends on:** B15 (Calendar Data Endpoint)

- [ ] F9.1 Frontend calendar component showing subscription charges by date
- [ ] F9.2 Color coding: green = expected, yellow = different amount

## Phase F10: Interactive Chart Filtering

- [ ] F10.1 Add click handlers to all charts (bar segments, donut slices) that update transaction filter state
- [ ] F10.2 Charts on transaction-adjacent pages navigate to filtered transaction view

## Phase F11: Sankey Diagram

- [ ] F11.1 Add Sankey chart component (recharts or dedicated library) — income → expense category flows

## Phase F12: Focused Classification Mode

**Depends on:** B16 (Transaction Context Endpoint)

- [ ] F12.1 Single-transaction detail view with context: similar transactions, vendor history
- [ ] F12.2 Suggested category based on similar transactions

## Phase F13: Overview Page Enhancements

- [ ] F13.1 Category breakdown donut chart (top 8 + "Other")
- [ ] F13.2 Income vs Expenses dual-bar chart
- [ ] F13.3 Top Vendors horizontal bar chart
- [ ] F13.4 Global date range and account filter controls in top bar
