# Spec Backport: Mockup → SPEC.md

## Proposed Edits

All edits are additive. Nothing is removed from the existing spec.

---

### Edit 1: Subscription Detection — add display details (after line 110)

After the existing "Category" bullet, add sparkline/summary info:

```
- Trend sparkline: 6-month amount history per subscription
```

Also add a note about the two-tab layout after "Designed for identifying things to cancel or consolidate." (line 112):

```
The UI separates fixed subscriptions and recurring expenses into distinct tabs, each with a summary card showing count and annual total (or annual average for variable). A category breakdown mini-chart provides a quick visual of where recurring money goes.
```

---

### Edit 2: Budget Views — change "Three" to "Four", add Flex Budget as a view (lines 122-128)

Change "Three selectable views" to "Four selectable views" and add Flex Budget as item 4 in the numbered list, since the mockup treats it as a peer tab rather than a secondary section.

Replace lines 122-128 with:

```
Four tabs control how budget numbers are viewed and configured:

1. **Historical Budget** — Derived entirely from past spending data. Per-category, per-month statistics: average, median, min, max, and a probability range (e.g., "80% chance grocery spending falls between $400–$600"). No user input required. This is the read-only analytical view.

2. **Set Budget** — Forward-looking only (current month + future months). User-defined budget targets per category. The system suggests initial values from historical data, setting a baseline monthly target plus seasonal overrides for months with detected spikes. Users can accept, adjust, or clear any value. Per-month overrides are supported — e.g., bump Entertainment in December for holiday spending without changing the baseline. Past months are not editable here; their budgets are locked in as historical fact.

3. **Actual vs Budget** — Backward-looking + current month. Shows what was actually spent against the budget that was in effect for that month (whether it was the baseline target, an override, or a rollover-adjusted amount). Progress bars per category per month. Summary rollup at the top. Past months are read-only records of committed budgets vs actual spending.

4. **Flex Budget** — Income-minus-expenses view. Groups spending into fixed, flexible, and non-monthly buckets and shows remaining spendable amount for the month. See [Flex Budget View](#flex-budget-view) below for details.
```

---

### Edit 3: Navigation section — update to sidebar + global filters (lines 200-211)

Replace the entire Navigation subsection:

```
### Navigation

Collapsible sidebar with icon-only collapsed state. Sidebar items have tooltips when collapsed.

Pages:
1. **Overview** — Dashboard with summary cards and key charts
2. **Transactions** — Full transaction list with sorting, filtering, grouping
3. **Subscriptions** — Detected recurring charges, fixed and variable
4. **Budget** — Category budgets, actual vs. target, trends
5. **Forecast** — Projections and comparisons
6. **Payments** — Inter-account transfer/payment matching view

### Global Filters

A top bar provides two global filter controls that apply across all views:

- **Date range**: This Month, Last 30 Days, This Year, Last Year, All Time
- **Account**: All Accounts, or any individual account
```

---

### Edit 4: Overview page detail — new subsection (after the Navigation/Global Filters sections)

Insert a new subsection:

```
### Overview

Four summary cards at the top:
- **Total Spending**: Current month total with percent change vs prior month
- **Total Income**: Current month income
- **Savings Rate**: Calculated as (income - spending) / income
- **Transaction Count**: Number of transactions in the current month

Four charts below:
- **Spending Over Time**: Monthly spending as a bar chart
- **Category Breakdown**: Donut chart of spending by category (top 8 + "Other", excludes income)
- **Income vs Expenses**: Dual-bar chart comparing monthly income and spending
- **Top Vendors**: Horizontal bar chart of the top 10 vendors by total spending
```

---

### Edit 5: Transaction List — expand with mockup details (lines 213-219)

Replace the Transaction List subsection:

```
### Transaction List

- Sortable by date, amount, vendor, category, account
- Groupable by month, vendor, category, type
- Filterable by all dimensions + date range
- Unified view across all accounts (account as a filter dimension)
- Per-account detail views also available
- Search across vendor, raw description, and memo
- Unclassified count badge as a quick filter shortcut
- Paginated (25 transactions per page)

#### Expandable Row Detail

Each transaction row expands to show:
- Raw description, transaction type, post date, source file
- Similar transactions: other transactions from the same vendor (up to 4), for quick pattern recognition

#### Row Indicators

- Verified status icon (distinct visual for verified vs unverified)
- Category badge (warning style if unclassified)
- Account shown as an outlined badge
- Amount color-coded: red for expenses, green for income
```

---

### Edit 6: Subscriptions display — add to existing section (after line 112)

The existing spec section (lines 97-116) describes detection and data. Add display refinements after line 112:

(This is the same content from Edit 1 — placing it in context)

---

### Edit 7: Forecast detail — new subsection (after Charts & Visualizations or after Interactive Chart Filtering)

Insert after the existing Forecasting section (line 198), expanding it:

Add after "Factor in seasonal variations where enough data exists":

```

### Forecast Views

- **Spending Projection Chart**: Line chart for the current year. Solid line for months with actual data, dashed line for projected months (based on historical averages). Visual distinction makes it clear where data ends and projections begin.
- **Projection Table**: Monthly breakdown with columns for projected amount, actual amount (or dash for future months), and difference (color-coded: red if over projection, green if under).
- **Year-over-Year Comparison**: Grouped bar chart comparing the same months across years (e.g., 2025 vs 2026).
- **Known Recurring Charges**: List of detected subscriptions and their expected charges, providing context for the projection model.
```

---

### Edit 8: Payments UI — new subsection (expand lines 88-95)

Add after "Accessible via a dedicated "Payments" view/tab" (line 95):

```

### Payments View

- **Summary card**: Count of matched payments and total dollar amount
- **Matched payments table**: Date, transfer direction (from → to account), amount, status badge
- **Unmatched candidates table**: Transactions that look like transfers but haven't been matched yet. Shows date, account, description, amount, and a "Match" action button for manual matching.
```

---

### Edit 9: Visual Design — new top-level section (before "Future Iterations")

Insert before line 244:

```
## Visual Design

Dark-first theme with a teal primary color. Key conventions:

- **Color coding**: Green for income/positive values, red for expenses/negative values, amber for warnings and unclassified items
- **Numeric display**: Monospace font for all currency amounts and numeric values
- **Chart palette**: 8 distinct colors for chart series (teal, blue, purple, orange, red, green, pink, cyan)
- **Progress bars**: Green under 75%, yellow 75-100%, red over 100%
- **Tables**: Alternating row backgrounds with hover highlight
```

---

## Summary of Changes

| # | Section | Type | What |
|---|---------|------|------|
| 1 | Subscription Detection | Expand | Sparklines, summary cards, tab layout |
| 2 | Budget Views | Modify | 3 views → 4 tabs (add Flex Budget) |
| 3 | Navigation | Replace | Tabs → collapsible sidebar |
| 4 | Overview | New subsection | Summary cards + chart inventory |
| 5 | Transaction List | Expand | Expandable rows, search, pagination, indicators |
| 6 | (same as 1) | — | — |
| 7 | Forecasting | Expand | Specific chart/table descriptions |
| 8 | Payment Matching | Expand | Payments view UI layout |
| 9 | Visual Design | New section | Theme, color conventions, chart palette |
