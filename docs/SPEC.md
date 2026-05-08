# Finance Analyzer

Personal finance tool for transaction classification, spending analysis, budget estimation, and financial forecasting. Single-user, runs locally.

## Architecture

- **Frontend**: React + Vite (TypeScript)
- **Backend**: Python (FastAPI), handles financial math, parsing, and data persistence
- **Database**: SQLite for all persistent state (transactions, categories, rules, budgets)
- **Dev mode**: Separate frontend dev server and backend API; single-process production build (backend serves built frontend)
- **Security**: Local-only, filesystem-level security, no encryption at rest

## Data Ingestion

### CSV Parsing

Pluggable parser system. Each bank/format is a Python module implementing a standard parser interface. Code-based plugins for now (no config-driven mapping yet).

**Supported formats (v1):**
- Chase credit card (columns: Transaction Date, Post Date, Description, Category, Type, Amount, Memo)
- BECU checking (columns: Date, No., Description, Debit, Credit)

Each parser must:
- Normalize transactions into a unified internal schema
- Extract a clean vendor name from the raw description (stored as separate field alongside the original)
- Preserve any source-provided category as metadata
- Define its own dedup strategy based on available fields

### Directory Watch

The app monitors the `input/` directory for new or modified CSV files. Auto-detects the format based on header row and routes to the correct parser. No upload UI — files are dropped into the directory.

### Deduplication

On import, detect duplicates using fuzzy date matching (allow 1-2 day variance between transaction date and post date) with exact match on description and amount. Skip duplicates automatically.

## Unified Transaction Schema

All parsed transactions normalize into:

- `id` (auto-generated)
- `source_file` (original CSV filename)
- `account` (e.g., "Chase CC 7397", "BECU Checking")
- `date` (transaction date)
- `post_date` (if available, nullable)
- `raw_description` (original description string)
- `vendor` (extracted clean vendor name)
- `amount` (positive = inflow, negative = outflow)
- `source_category` (category from the CSV, if any)
- `category` (unified app category — initially from source, overridable)
- `type` (Sale, Payment, Return, etc. from source)
- `is_verified` (has a human confirmed the category)
- `is_transfer` (matched as an inter-account transfer / payment)
- `memo` (if available)

## Categories

Flat taxonomy. Single level of categories that covers all transaction types across all accounts.

Initial categories derived from source data (Chase's Category field, inferred from BECU descriptions). Users can override any transaction's category.

Categories include spending types (Groceries, Dining, Bills & Utilities, etc.) as well as Income, Investments, and Transfers — all at the same level.

## Transaction Classification

### Auto-Classification

1. Source-provided categories are used as the initial classification (Chase provides these; BECU does not)
2. Classification rules (vendor-to-category mappings) are auto-created whenever a user classifies a transaction — all future transactions from that vendor inherit the rule
3. Rules apply on import: new transactions are auto-classified if a matching rule exists

### Classification UI

Hybrid batch/detail interface:

- **Batch table view**: Spreadsheet-like list of transactions needing review. Inline category dropdowns. Bulk actions — select multiple transactions matching a filter and assign a category in one action.
- **Focused single-item mode**: For ambiguous transactions, drill into a single item with full context (similar transactions, vendor history).
- **Filter-driven workflow**: Filter unclassified transactions by any dimension (vendor, date range, amount range, account), then bulk-classify the filtered set. "Unclassified" means a transaction has no category assigned (`category_id IS NULL`); assigning any category — including the explicit `Uncategorized` bucket — removes it from the unclassified queue.

When a user classifies a transaction, a vendor-to-category rule is auto-created for future matching.

### Transaction Rules

Auto-created rules from classification can also be manually managed. A rule maps a vendor pattern to an action: set category, rename vendor display name, tag, or hide. Rules apply automatically on import. Allows users to fix recurring misclassifications once rather than per-transaction.

## Payment Matching

Cross-reference checking account and credit card transactions to identify credit card payments. BECU entries like "CHASE CREDIT CRD - EPAY" should match against Chase credit card activity.

Matched payment pairs are:
- Flagged as transfers (`is_transfer = true`)
- Hidden by default from spending views
- Accessible via a dedicated "Payments" view/tab

### Payments View

- **Summary card**: Count of matched payments and total dollar amount
- **Matched payments table**: Date, transfer direction (from → to account), amount, status badge
- **Unmatched candidates table**: Transactions that look like transfers but haven't been matched yet. Shows date, account, description, amount, and a "Match" action button for manual matching.

## Subscription Detection

Detect two types of recurring charges:

1. **Fixed subscriptions**: Same vendor + same amount at regular intervals (e.g., Twitch $6.62 every few days, ST SUBSCRIPTIONS $27.72/mo)
2. **Recurring expenses**: Same vendor at regular intervals but varying amounts (e.g., utility bills, XFINITY MOBILE)

Label them differently in the UI. Show:
- Vendor name
- Frequency (weekly, bi-weekly, monthly, annual)
- Amount (fixed) or amount range (variable)
- Annual cost estimate
- Last charge date
- Category
- Trend sparkline: 6-month amount history per subscription

Designed for identifying things to cancel or consolidate.

The UI separates fixed subscriptions and recurring expenses into distinct tabs, each with a summary card showing count and annual total (or annual average for variable). A category breakdown mini-chart provides a quick visual of where recurring money goes.

### Recurring Calendar View

Calendar-style view of upcoming and past recurring charges. Color-coded: green = paid as expected, yellow = paid at a different amount than usual. Helps users see when charges cluster and spot unexpected changes in recurring amounts.

## Budget

### Budget Views

Four tabs control how budget numbers are viewed and configured:

1. **Historical Budget** — Derived entirely from past spending data. Per-category, per-month statistics: average, median, min, max, and a probability range (e.g., "80% chance grocery spending falls between $400–$600"). No user input required. This is the read-only analytical view.

2. **Set Budget** — Forward-looking only (current month + future months). User-defined budget targets per category. The system suggests initial values from historical data, setting a baseline monthly target plus seasonal overrides for months with detected spikes. Users can accept, adjust, or clear any value. Per-month overrides are supported — e.g., bump Entertainment in December for holiday spending without changing the baseline. Past months are not editable here; their budgets are locked in as historical fact.

3. **Actual vs Budget** — Backward-looking + current month. Shows what was actually spent against the budget that was in effect for that month (whether it was the baseline target, an override, or a rollover-adjusted amount). Progress bars per category per month. Summary rollup at the top. Past months are read-only records of committed budgets vs actual spending. Each category row is expandable — clicking it reveals the individual transactions that sum to the category's actual amount for that month, showing date, vendor, and amount. Transaction count is displayed next to the category name.

4. **Flex Budget** — Income-minus-expenses view. Groups spending into fixed, flexible, and non-monthly buckets and shows remaining spendable amount for the month. See [Flex Budget View](#flex-budget-view) below for details.

### Historical Analysis

For each category, compute:
- Monthly average, median, min, max over available history
- Standard deviation and coefficient of variation (flags volatile vs stable categories)
- Probability range: estimated 80% confidence interval for next month's spending
- Trend direction: increasing, decreasing, or stable over the last 6 months
- Seasonal pattern detection: flag categories that spike in specific months (e.g., gifts in December)

### Budget Suggestions

When a user clicks "Suggest Budgets":
- Set a baseline monthly target per category from the historical average
- Detect seasonal spikes and add per-month overrides only for those months (e.g., Shopping in December gets an override, other months use the baseline)
- Present suggestions with the historical basis shown (e.g., "Based on $420 avg, $380–$460 range, December spike detected")
- Show a confirmation step — user can accept, adjust, or dismiss per category before applying

### Monthly vs Yearly Targets

Each category's budget target can be set as either:

- **Monthly**: A per-month amount (e.g., $500/mo for Groceries). This is the default.
- **Yearly**: A total annual amount that gets divided evenly across 12 months (e.g., $1,800/yr for Insurance = $150/mo). Useful for annual premiums, property tax, or any expense where the user thinks in yearly terms.

The UI shows a toggle between Monthly and Yearly input modes. When set to Yearly, the monthly equivalent is displayed alongside. The underlying budget math always works in monthly values.

### Per-Month Overrides

Within the Set Budget view, any future month can be overridden independently:
- Default: the category uses the baseline monthly target (or yearly ÷ 12)
- Override: user sets a specific number for a specific month (e.g., $800 for Groceries in November)
- Overridden months are visually distinct (badge or indicator)
- Overrides don't affect other months
- For yearly-target categories, the monthly values are locked by default in the override screen. An unlock icon allows editing individual months when needed (e.g., insurance rate change mid-year).

### Rollover vs Fixed Budgets

Each category can be set to one of two modes:

- **Fixed** (default): Budget resets each month. If $500 is budgeted for Groceries in January, that's the budget regardless of what happened in December. Each month is independent.
- **Rollover**: Unspent budget carries forward to the next month. If $500 is budgeted for Groceries in January and only $400 is spent, February's effective budget becomes $600 ($500 baseline + $100 surplus). Overspending also carries forward as a deficit.

This is a per-category setting configured in the Set Budget view. In the Actual vs Budget view, rollover categories show the effective budget (baseline ± accumulated surplus/deficit) rather than just the baseline target.

### Progress Tracking

Each month gets a progress meter per category:
- Horizontal bar showing actual spend as a percentage of budget
- Color transitions: green (under 75%), yellow (75–100%), red (over 100%)
- Running total: "spent $X of $Y budget, $Z remaining" or "$X over budget"
- Month-level rollup: total budgeted vs total actual with overall progress bar

For past months, the progress bar is static (final state). For the current month, it updates as new transactions are imported.

### Flex Budget View

In addition to per-category budgets, provide a "flex budget" summary that groups spending into:
- **Fixed expenses**: Rent, subscriptions, loan payments — predictable, hard to change
- **Flexible expenses**: Groceries, dining, entertainment — discretionary, adjustable
- **Non-monthly expenses**: Annual subscriptions, insurance, irregular bills

The flex view shows remaining flexible spending for the month after fixed expenses are accounted for. This gives a quick answer to "how much can I still spend this month?" without requiring every category to have a budget target.

## Forecasting & Projections

- **Yearly estimate by month**: Project spending for the current year, broken down by month, based on historical patterns
- **Year-over-year breakdown**: After 1+ years of data, show annual comparisons
- Account for known recurring expenses (subscriptions, detected patterns)
- Factor in seasonal variations where enough data exists

### Forecast Views

- **Spending Projection Chart**: Line chart for the current year. Solid line for months with actual data, dashed line for projected months (based on historical averages). Visual distinction makes it clear where data ends and projections begin.
- **Projection Table**: Monthly breakdown with columns for projected amount, actual amount (or dash for future months), and difference (color-coded: red if over projection, green if under).
- **Year-over-Year Comparison**: Grouped bar chart comparing the same months across years (e.g., 2025 vs 2026).
- **Known Recurring Charges**: List of detected subscriptions and their expected charges, providing context for the projection model.

## Views & Dashboard

### Navigation

Collapsible sidebar with icon-only collapsed state. Sidebar items have tooltips when collapsed.

Pages:
1. **Overview** — Dashboard with summary cards and key charts
2. **Net Worth** — Net worth over time (line chart) and latest-balance table per account
3. **Transactions** — Full transaction list with sorting, filtering, grouping
4. **Subscriptions** — Detected recurring charges, fixed and variable
5. **Budget** — Category budgets, actual vs. target, trends
6. **Forecast** — Projections and comparisons
7. **Payments** — Inter-account transfer/payment matching view
8. **Accounts** — CRUD for the accounts list (archive primary action)

### Global Filters

A top bar provides two global filter controls that apply across all views:

- **Date range**: This Month, Last 30 Days, This Year, Last Year, All Time
- **Account**: All Accounts, or any individual account

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

### Charts & Visualizations

Interactive charts alongside data tables. Pluggable chart component interface (common props/API for each chart type), starting with Recharts.

Chart types needed:
- Spending over time (line/bar by month)
- Category breakdown (pie/donut)
- Category trends over time (stacked bar or area)
- Budget vs. actual (bar chart)
- Subscription cost breakdown
- Income vs. expenses (bar or waterfall)
- Cash flow Sankey diagram: income sources on the left flowing into expense categories on the right, showing how money moves through the system. Monthly view.

### Interactive Chart Filtering

Clicking a segment in any chart (a bar, a donut slice, a Sankey flow) filters the transaction list on the same page to show only the matching transactions. This connects visual analysis directly to the underlying data without navigating away. Charts act as a visual query builder.

## Multi-Account

- Unified cash flow view: all accounts merged into one timeline, account as a filter
- Per-account detail views: each account has its own transaction list
- Cross-account matching for payments/transfers

## Accounts & Net Worth

Account is a first-class model — every transaction and balance snapshot references an `accounts` row by FK. Each account has a `type` (`checking`, `savings`, `credit_card`, `brokerage`, `retirement`, `asset`), an optional `institution`, and an `is_archived` flag. The `asset` type is a freeform catch-all whose descriptor lives in the `name` field ("Primary House", "2019 Camry").

### Balance Snapshots

Per-account balance entries stored in `balance_snapshots` keyed by `(account_id, as_of_date)`. Manually entered for v1 — the user opens a "Snapshot today" batch form on the Net Worth page, the form lists every active account with a dollar input and a hint showing the last-known balance, the user fills in whatever they care to and saves. Re-entering for the same `(account, date)` overwrites; there is no per-snapshot edit/delete UI. Balances are stored as positive numbers; sign comes from `accounts.type` at aggregation time (`credit_card` subtracts, others add).

### Net Worth View

Single line chart of net worth over time plus a table of latest balance per account. Net worth on date D is the sum across non-archived accounts of each account's last-value-carry-forward balance as of D, with the type-driven sign rule applied.

CSV import for snapshots is deferred — the v1 path is manual entry only. See `docs/specs/2026-05-06-02-balance-snapshots.md` for the full spec.

## Visual Design

Dark-first theme with a teal primary color. Key conventions:

- **Color coding**: Green for income/positive values, red for expenses/negative values, amber for warnings and unclassified items
- **Numeric display**: Monospace font for all currency amounts and numeric values
- **Chart palette**: 8 distinct colors for chart series (teal, blue, purple, orange, red, green, pink, cyan)
- **Progress bars**: Green under 75%, yellow 75-100%, red over 100%
- **Tables**: Alternating row backgrounds with hover highlight

## Future Iterations (Not V1)

- Investment value tracking (per-position holdings, allocation breakdown)
- CSV import for balance snapshots (institution-native holdings exports)
- Liability account types (loan, mortgage)
- Per-account history drill-down view; net-worth breakdown by type
- Per-snapshot edit/delete UI
- Config-driven CSV parser (add formats via YAML/JSON without code)
- Upload UI for CSVs
- Multi-user support

## Format

See `input/` dir for sample data:
- Chase credit card CSVs (2025 full year, 2026 YTD)
- BECU checking CSVs (2025 full year, 2026 YTD)

Build the parser system assuming many formats will be added over time. Each parser is a code-based plugin with a standard interface.
