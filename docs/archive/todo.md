# Finance Analyzer — Implementation Plan

## Overview

Build a local personal finance tool from scratch: Python/FastAPI backend with SQLite, React/Vite/TypeScript frontend. Parses bank CSVs, classifies transactions, detects subscriptions, tracks budgets, and projects spending. Single-user, runs locally.

## Current State

- Greenfield. No backend, no frontend, no database.
- `docs/SPEC.md` — full product spec
- `input/` — 4 sample CSVs (Chase CC 2025+2026 YTD, BECU checking 2025+2026 YTD)
- `mockup/` — separate React/shadcn UI mockup (reference only, not the real app)
- Frontend plan is in `docs/plans/frontend.md` (all frontend work lives there, not in this file)

## Desired End State

A working local finance app where you can:
1. Drop CSVs into `input/` and have them imported
2. View, filter, sort, and classify transactions across accounts
3. See detected subscriptions and recurring charges
4. Set budgets per category with historical analysis
5. View spending forecasts and year-over-year comparisons
6. See matched inter-account payments/transfers

Verification: import all 4 sample CSVs, classify transactions, verify subscription detection picks up obvious recurring charges (YouTube Premium, Crunchyroll, Vanguard investments), confirm budget analysis runs against 13+ months of data.

## What We're NOT Doing

**Not V1 at all:**
- Balance tracking over time per account
- Investment value tracking / net worth
- Config-driven CSV parser (YAML/JSON format definitions)
- Upload UI for CSVs (file drop to `input/` only)
- Multi-user support
- Authentication/encryption
- Mobile-responsive design (desktop-first)

**Deferred to later tiers (not forgotten, but not blocking core):**
- Flex budget backend (requires category tagging as fixed/flex/non-monthly)
- What-if scenarios (mentioned in spec nav but undefined)
- Directory watcher (manual import button works fine)
- All frontend work tracked separately in `docs/plans/frontend.md`

## Architectural Decisions (must get right early)

### 1. Vendor normalization is the linchpin

Everything downstream matches on the `vendor` field — classification rules, subscription grouping, payment matching. If the same vendor produces inconsistent strings, every feature degrades.

**Approach:**
- Parser-specific heuristics as the first pass (strip prefixes, store numbers, title-case)
- Classification rules as the correction layer — `vendor_display_name` on rules overrides the display
- Rules support three match types from day one: `exact`, `contains`, `starts_with`
- The `vendor` column stores the parser's best-effort extraction; the `vendor_display_name` from rules is what the UI shows (falling back to `vendor` if no rule)

### 2. Amount sign convention

Positive = inflow, negative = outflow. Baked into every parser. Every computation depends on this. Chase already uses this convention. BECU's separate Debit/Credit columns must normalize correctly (Debit is already negative, Credit is positive).

### 3. Category as FK with canonical seed set

Seed a curated set of categories on first migration. Each parser maps source categories to canonical IDs during import (Chase has a `CHASE_CATEGORY_MAP`). Don't auto-create categories from CSV data — that leads to duplicates and inconsistency.

Canonical seed: Shopping, Groceries, Dining, Health & Wellness, Entertainment, Bills & Utilities, Travel, Gas, Education, Personal, Home, Gifts & Donations, Income, Investments, Transfers, Uncategorized.

Chase's "Food & Drink" maps to our "Dining". Chase's other categories map 1:1 or to "Uncategorized" if unmapped.

### 4. `is_transfer` exclusion from day one

Every query that computes spending totals — stats, budgets, forecasts — must include `WHERE is_transfer = false`. Build this into the query layer from the start, not retrofitted after payment matching ships. The flag exists on the model from the initial migration; payment matching populates it.

### 5. Budget model supports rollover even if we don't implement it yet

Add `rollover_mode` BOOLEAN DEFAULT FALSE to the `budgets` table in the initial schema. The rollover computation (sequential surplus/deficit accumulation) is deferred to Tier 3, but the field exists so we don't need a migration later.

## Tier Structure

- **Tier 1 — Foundation:** The app is usable. Import, view, classify, correct spending totals.
- **Tier 2 — Analytics:** Subscriptions, historical analysis, set budgets, actual vs budget.
- **Tier 3 — Advanced:** Budget suggestions, forecasting, rollover budgets.
- **Tier 4 — Polish:** Flex view, calendar view, chart interactivity, directory watcher.

Each tier builds on the previous. Tier 1 must be solid before Tier 2 begins.

## Project Structure

```
finance-analyzer/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, startup, middleware
│   │   ├── config.py            # Settings (db path, input dir, etc.)
│   │   ├── database.py          # SQLAlchemy engine, session factory
│   │   ├── models/              # SQLAlchemy ORM models
│   │   ├── schemas/             # Pydantic request/response schemas
│   │   ├── routers/             # API route handlers
│   │   ├── services/            # Business logic layer
│   │   └── parsers/             # CSV parser plugins
│   │       ├── base.py          # Abstract parser interface
│   │       ├── registry.py      # Format detection + parser routing
│   │       ├── chase_cc.py      # Chase credit card parser
│   │       └── becu_checking.py # BECU checking parser
│   ├── alembic/                 # Alembic migrations
│   ├── alembic.ini
│   ├── pyproject.toml
│   └── tests/
├── frontend/
│   ├── src/
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
├── input/                       # CSV drop directory
├── data/                        # SQLite database lives here
├── docs/
├── mockup/                      # Reference mockup (separate repo)
├── .gitignore
└── Makefile                     # Root-level commands
```

---

# TIER 1 — Foundation

The app is usable after this tier: import CSVs, view transactions, classify them, transfers flagged, spending totals correct.

---

## Phase 1: Project Scaffolding

### Overview
Scaffold the monorepo. FastAPI server, SQLite database, React dev server proxying to backend. Health check proves the stack works.

### Tasks

- [ ] 1.1 Create `backend/pyproject.toml` with dependencies: fastapi, uvicorn, sqlalchemy, alembic, pydantic, pydantic-settings
- [ ] 1.2 Create `backend/app/config.py` — Pydantic Settings class (DATABASE_URL defaulting to `sqlite:///data/finance.db`, INPUT_DIR defaulting to `input/`)
- [ ] 1.3 Create `backend/app/database.py` — SQLAlchemy engine, sessionmaker, `get_db` dependency
- [ ] 1.4 Create `backend/app/main.py` — FastAPI app with CORS middleware (allow localhost origins), health check at `GET /api/health`
- [ ] 1.5 Initialize Alembic: `backend/alembic.ini` and `backend/alembic/env.py` configured to use the same engine
- [ ] 1.6 Create root `Makefile` with targets: `install`, `dev-backend`, `dev-frontend`, `dev` (both), `test`, `lint`
- [ ] 1.9 Update `.gitignore` for Python, Node, data, and environment files
- [ ] 1.10 Create `data/` directory with `.gitkeep`

### Success Criteria

#### Automated:
- [ ] `make install` completes without errors
- [ ] `make dev-backend` starts, `curl localhost:8000/api/health` returns 200

---

## Phase 2: Data Model & Migrations

### Overview
SQLAlchemy models, initial Alembic migration, canonical category seeding. The database schema exists and is version-controlled after this phase.

### Tables

**transactions**
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `source_file` TEXT NOT NULL
- `account` TEXT NOT NULL
- `date` DATE NOT NULL
- `post_date` DATE (nullable)
- `raw_description` TEXT NOT NULL
- `vendor` TEXT NOT NULL
- `amount` REAL NOT NULL (positive = inflow, negative = outflow)
- `source_category` TEXT (nullable) — original category from CSV
- `category_id` INTEGER REFERENCES categories(id) (nullable)
- `type` TEXT (nullable — Sale, Payment, Return, etc.)
- `is_verified` BOOLEAN DEFAULT FALSE
- `is_transfer` BOOLEAN DEFAULT FALSE
- `is_reviewed` BOOLEAN DEFAULT FALSE
- `memo` TEXT (nullable)
- `import_hash` TEXT NOT NULL UNIQUE — dedup fingerprint
- `created_at` DATETIME DEFAULT NOW
- `updated_at` DATETIME DEFAULT NOW

Indexes: `date`, `vendor`, `category_id`, `account`, `import_hash`, `is_transfer`

**categories**
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `name` TEXT NOT NULL UNIQUE
- `is_system` BOOLEAN DEFAULT FALSE — marks seed categories

**classification_rules**
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `vendor_pattern` TEXT NOT NULL
- `match_type` TEXT NOT NULL DEFAULT 'exact' — 'exact', 'contains', or 'starts_with'
- `category_id` INTEGER REFERENCES categories(id) (nullable)
- `vendor_display_name` TEXT (nullable) — override display name for matched transactions
- `is_hidden` BOOLEAN DEFAULT FALSE
- `priority` INTEGER DEFAULT 0 — higher wins
- `created_at` DATETIME DEFAULT NOW

**payment_matches**
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `checking_transaction_id` INTEGER REFERENCES transactions(id)
- `cc_transaction_id` INTEGER REFERENCES transactions(id)
- `matched_at` DATETIME DEFAULT NOW

**budgets**
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `category_id` INTEGER NOT NULL REFERENCES categories(id)
- `year` INTEGER NOT NULL
- `monthly_amount` REAL NOT NULL — baseline monthly target
- `rollover_mode` BOOLEAN DEFAULT FALSE — field exists for Tier 3, not implemented yet
- `created_at` DATETIME DEFAULT NOW
- `updated_at` DATETIME DEFAULT NOW
- UNIQUE(category_id, year)

**budget_monthly_overrides**
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `budget_id` INTEGER NOT NULL REFERENCES budgets(id)
- `month` INTEGER NOT NULL (1-12)
- `amount` REAL NOT NULL
- UNIQUE(budget_id, month)

**subscriptions**
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `vendor` TEXT NOT NULL
- `frequency` TEXT NOT NULL (weekly, bi-weekly, monthly, quarterly, annual)
- `subscription_type` TEXT NOT NULL (fixed, variable)
- `amount` REAL (fixed amount)
- `amount_min` REAL (variable range)
- `amount_max` REAL (variable range)
- `annual_estimate` REAL NOT NULL
- `last_charge_date` DATE NOT NULL
- `category_id` INTEGER REFERENCES categories(id)
- `is_active` BOOLEAN DEFAULT TRUE
- `detected_at` DATETIME DEFAULT NOW

**import_log**
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `filename` TEXT NOT NULL
- `file_hash` TEXT NOT NULL — SHA256 of file contents
- `rows_imported` INTEGER NOT NULL
- `rows_skipped` INTEGER NOT NULL
- `imported_at` DATETIME DEFAULT NOW

### Tasks

- [ ] 2.1 Create `backend/app/models/` — all model files (transaction, category, classification_rule, payment_match, budget, subscription, import_log)
- [ ] 2.2 Create initial Alembic migration for all tables (including Tier 2/3 tables — schema is cheap, avoids migrations later)
- [ ] 2.3 Add `make migrate` and `make migrate-new` Makefile targets
- [ ] 2.4 Seed canonical categories on first run: Shopping, Groceries, Dining, Health & Wellness, Entertainment, Bills & Utilities, Travel, Gas, Education, Personal, Home, Gifts & Donations, Income, Investments, Transfers, Uncategorized
- [ ] 2.5 Write tests: migration applies cleanly, category seeding works, model relationships correct

### Success Criteria

#### Automated:
- [ ] `make migrate` creates SQLite database with all tables
- [ ] Category seeding populates 16 canonical categories
- [ ] `make test` passes

---

## Phase 3: CSV Parsers & Import

### Overview
Pluggable parser architecture, Chase CC and BECU parsers, import pipeline with format auto-detection and deduplication. After this phase, you can import all sample data.

### Parser Interface

`backend/app/parsers/base.py`:
- `can_parse(headers: list[str]) -> bool` — True if this parser handles the headers
- `parse(filepath: Path) -> list[RawTransaction]` — parsed rows
- `compute_import_hash(row) -> str` — dedup fingerprint per parser

`RawTransaction` dataclass: all unified schema fields, pre-insert.

### Format Detection

`backend/app/parsers/registry.py`:
- List of registered parsers
- `detect_parser(filepath) -> Parser` — read first line, try each parser's `can_parse()`, first match wins

### Chase CC Parser

Header detection: `Transaction Date,Post Date,Description,Category,Type,Amount,Memo`

Field mapping:
- `date` = Transaction Date, `post_date` = Post Date
- `raw_description` = Description, `amount` = Amount (already correct sign)
- `source_category` = Category, `type` = Type, `memo` = Memo
- `account` = "Chase CC"

Category mapping: `CHASE_CATEGORY_MAP` dict maps Chase categories to canonical category names. "Food & Drink" → "Dining". Unmapped → "Uncategorized".

Vendor extraction heuristics:
- Strip prefixes: `TST*`, `WL *`, `SQ *`, `SP *`
- Strip trailing store numbers: `#XXXX`, trailing 4+ digit sequences
- Unescape HTML entities (`&amp;` → `&`)
- Title-case

Import hash: SHA256 of `(transaction_date, post_date, description, amount)`

### BECU Checking Parser

Header detection: `Date,No.,Description,Debit,Credit`

Field mapping:
- `date` = Date, `post_date` = NULL
- `raw_description` = Description
- `amount` = Debit if present (already negative), else Credit (positive)
- `source_category` = NULL, `account` = "BECU Checking"
- `type` = inferred from description prefix

Vendor extraction heuristics:
- Pattern: `(External|Descriptive) (Withdrawal|Deposit) - VENDOR_INFO - TYPE`
- Extract middle part, strip account numbers and extra whitespace
- Special cases: "Dividend/Interest" → "BECU Interest", wire transfers → "Wire Transfer"
- Title-case

Import hash: SHA256 of `(date, description, amount)`

### Import Pipeline

`backend/app/services/import_service.py`:
1. Accept a file path
2. Detect format via registry
3. Parse into RawTransaction list
4. Check import_log for file hash — skip if exact file already imported
5. For each row: compute import_hash, skip if exists in transactions
6. Look up classification rules — apply matching rules to set category_id (and vendor_display_name)
7. Map source_category to canonical category_id via parser's category map
8. Insert new transactions
9. Log to import_log
10. Return summary (imported count, skipped count)

### Endpoints

- `POST /api/import` — import a single file (filename query param, relative to input dir)
- `POST /api/import/all` — scan input directory, import all CSVs

### Tasks

- [ ] 3.1 Create `backend/app/parsers/base.py` — abstract parser interface and `RawTransaction` dataclass
- [ ] 3.2 Create `backend/app/parsers/registry.py` — parser registry with format detection
- [ ] 3.3 Implement `backend/app/parsers/chase_cc.py` — parser with `CHASE_CATEGORY_MAP` and vendor extraction
- [ ] 3.4 Implement `backend/app/parsers/becu_checking.py` — parser with vendor extraction
- [ ] 3.5 Create `backend/app/services/import_service.py` — import pipeline with dedup, rule application, category mapping
- [ ] 3.6 Create `backend/app/routers/import_router.py` — import endpoints
- [ ] 3.7 Write parser tests: each parser against sample data, verify vendor extraction quality, verify import hashes are stable across runs
- [ ] 3.8 Write import service tests: dedup (import same file twice → 0 new rows), category mapping, rule application during import

### Success Criteria

#### Automated:
- [ ] Parser tests pass against sample CSV data
- [ ] Import all 4 CSVs → returns row counts
- [ ] Import again → 0 new rows (dedup works)
- [ ] Chase transactions have category_id set via CHASE_CATEGORY_MAP
- [ ] `make test` passes

#### Manual:
- [ ] Spot-check 10 transactions: vendor names reasonable, amounts correct sign, dates correct
- [ ] BECU transactions have no source_category (expected)

---

## Phase 4: Transaction API & Stats

### Overview
The backbone API the frontend consumes. Transaction list with filtering/sorting/pagination, categories CRUD, spending stats. All spending queries exclude transfers (`is_transfer = false`).

### Endpoints

**Transactions:**
- `GET /api/transactions` — list with filtering, sorting, pagination
  - Query params: `account`, `category_id`, `vendor` (partial match), `date_from`, `date_to`, `amount_min`, `amount_max`, `is_verified`, `is_reviewed`, `is_transfer`, `search` (vendor + raw_description)
  - Sort: `sort_by` + `sort_dir`
  - Pagination: `page`, `page_size` (default 50)
  - Response: `{ items: [...], total: N, page: N, page_size: N }`
- `GET /api/transactions/:id` — single transaction detail
- `PATCH /api/transactions/:id` — update category, is_verified, is_reviewed, vendor display, memo
- `POST /api/transactions/bulk-update` — update multiple transaction IDs at once

**Categories:**
- `GET /api/categories` — list all with transaction count per category
- `POST /api/categories` — create
- `PATCH /api/categories/:id` — rename
- `DELETE /api/categories/:id` — delete (only if no transactions reference it)

**Stats (all exclude `is_transfer = true`):**
- `GET /api/stats/summary` — total spending, income, savings rate, top categories
  - Query params: `date_from`, `date_to`
- `GET /api/stats/monthly` — per-month spending by category
  - Query params: `year`, `category_id` (optional)

### Tasks

- [x] 4.1 Create `backend/app/schemas/` — Pydantic models for all request/response shapes
- [x] 4.2 Create `backend/app/services/transaction_service.py` — query builder with filtering/sorting/pagination, `is_transfer` exclusion on spending queries
- [x] 4.3 Create `backend/app/routers/transaction_router.py`
- [x] 4.4 Create `backend/app/routers/category_router.py`
- [x] 4.5 Create `backend/app/services/stats_service.py` — summary and monthly stats, always excluding transfers
- [x] 4.6 Create `backend/app/routers/stats_router.py`
- [x] 4.7 Write tests: filtering, sorting, pagination, transfer exclusion in stats
- [x] 4.8 Write tests: stats accuracy (cross-check against raw CSV sums minus transfers)

### Success Criteria

#### Automated:
- [x] All endpoints return correct data after importing sample CSVs
- [x] Filtering by account, date range, category, amount range works
- [x] Pagination returns correct totals
- [x] Stats exclude transactions where `is_transfer = true`
- [x] `make test` passes

---

## Phase 5: Classification System

### Overview
Rules engine for auto-classifying transactions. Classify a transaction → rule auto-created → future imports of that vendor get the same category.

### Behavior

**Manual classification:**
1. User PATCHes a transaction's category
2. Backend auto-creates (or updates) a classification rule: `vendor_pattern` = vendor, `match_type` = 'exact', `category_id` = new category
3. Optionally: retroactively apply to all unverified transactions from that vendor

**Rule matching precedence (on import):**
1. Exact match rules first, ordered by priority descending
2. Then starts_with, then contains, each ordered by priority
3. First match wins — sets category_id and vendor_display_name if specified

**Bulk classification:**
- Bulk-update with category_id → creates rules for each distinct vendor → marks all as is_verified

### Endpoints

- `GET /api/rules` — list all rules with category names
- `POST /api/rules` — create manually
- `PATCH /api/rules/:id` — update
- `DELETE /api/rules/:id` — delete
- `POST /api/rules/:id/apply` — retroactively apply to matching unverified transactions
- `POST /api/rules/apply-all` — apply all rules to all unverified transactions

### Tasks

- [x] 5.1 Create `backend/app/services/classification_service.py` — rule matching (exact → starts_with → contains), auto-rule creation
- [x] 5.2 Create `backend/app/routers/rules_router.py` — CRUD endpoints
- [x] 5.3 Hook auto-rule creation into transaction PATCH (when category changes)
- [x] 5.4 Hook rule application into import pipeline (apply after parse, before insert)
- [x] 5.5 Implement retroactive rule application
- [x] 5.6 Update bulk-update to auto-create rules per vendor
- [x] 5.7 Write tests: rule creation on classify, match precedence (exact beats contains), retroactive apply, bulk classify

### Success Criteria

#### Automated:
- [x] Classifying a transaction auto-creates a rule
- [x] Re-importing applies the new rule
- [x] Retroactive apply updates existing unverified transactions
- [x] Match precedence: exact > starts_with > contains
- [x] `make test` passes

#### Manual:
- [ ] Classify "Fred Meyer" as Groceries → all Fred Meyer transactions get the category

---

## Phase 6: Payment Matching

### Overview
Cross-account transfer detection. Without this, spending totals double-count CC payments. This is Tier 1 because every stat, budget, and forecast inherits bad numbers without it.

### Algorithm

1. Find candidates:
   - BECU: descriptions containing "CHASE CREDIT CRD"
   - Chase: type = "Payment" or description containing "Payment Thank You"
2. For each candidate pair (checking debit + CC credit):
   - Amounts equal in magnitude, opposite sign (BECU = -X, Chase = +X)
   - Dates within 3 days
3. Mark both as `is_transfer = true`
4. Store match in payment_matches table

### Endpoints

- `GET /api/payments` — list matched pairs with both transaction details
- `POST /api/payments/detect` — run detection
- `DELETE /api/payments/:id` — unmatch a pair (reset is_transfer)

### Tasks

- [x] 6.1 Create `backend/app/services/payment_service.py` — detection algorithm
- [x] 6.2 Create `backend/app/routers/payment_router.py`
- [x] 6.3 Hook detection into import pipeline (run after import completes)
- [x] 6.4 Write tests: match the $9,379.99 payment (BECU 12/26 → Chase 12/25), no false positives

### Success Criteria

#### Automated:
- [x] Detection finds the $9,379.99 payment match
- [x] Both matched transactions have `is_transfer = true`
- [x] Stats endpoints now exclude these from spending totals
- [x] `make test` passes

#### Manual:
- [ ] Review all detected matches — no false positives

---

**End of Tier 1 (Backend).** Backend is functional: import CSVs, query transactions, classify them, transfers flagged, spending totals correct. Frontend work is tracked in `docs/plans/frontend.md`.

---

# TIER 2 — Analytics

Subscriptions, historical spending analysis, user-defined budgets, actual vs budget tracking.

---

## Phase 8: Subscription Detection

### Overview
Identify recurring charges from transaction history. Foundation for budget analysis and forecasting.

### Algorithm

1. Group transactions by vendor (excluding transfers)
2. For vendors with 3+ transactions:
   a. Sort by date, compute intervals between consecutive charges
   b. Median interval within ±30% of a standard period → classify frequency
   c. Amount std dev < 5% of mean → fixed subscription; otherwise → variable recurring
3. Compute: frequency, amount/range, annual estimate, last charge date, category

### Endpoints

- `GET /api/subscriptions` — list detected subscriptions
- `POST /api/subscriptions/detect` — run detection, refresh table
- `PATCH /api/subscriptions/:id` — override (mark inactive, change category)

### Tasks

- [x] 8.1 Create `backend/app/services/subscription_service.py` — detection algorithm
- [x] 8.2 Create `backend/app/routers/subscription_router.py`
- [x] 8.3 Write tests: detect YouTube Premium (~$15.44/mo fixed), Crunchyroll (~$8.81/mo fixed), Vanguard (~$1000 recurring)

### Success Criteria

#### Automated:
- [x] YouTube Premium and Crunchyroll detected as fixed monthly
- [x] Vanguard detected as recurring
- [x] Annual estimates within 20% of actual totals
- [x] `make test` passes

#### Manual:
- [ ] Review full list — no obviously wrong or major missing entries

---

## Phase 9: Historical Budget Analysis

### Overview
Read-only analytical view. Per-category statistics computed from transaction history. No user input required. This is the data foundation that budget suggestions and forecasting build on.

### Computation

For each category (excluding transfers):
- Monthly average, median, min, max
- Standard deviation and coefficient of variation
- 80% confidence interval (mean ± 1.28 * std dev, clamped to observed range)
- 6-month trend: linear regression slope → "increasing", "decreasing", "stable"
- Seasonal pattern: flag months where average > 1.5x the annual monthly average

### Endpoints

- `GET /api/budget/historical` — per-category stats
  - Query params: `year` (optional)

### Tasks

- [x] 9.1 Create `backend/app/services/budget_service.py` — historical analysis
- [x] 9.2 Create `backend/app/routers/budget_router.py` — historical endpoint
- [x] 9.3 Write tests: stats accuracy against known data, trend detection, seasonal flagging

### Success Criteria

#### Automated:
- [x] Groceries monthly average matches manual calculation from data
- [x] Confidence intervals are reasonable
- [x] `make test` passes

#### Manual:
- [ ] Historical stats pass sanity check across several categories

---

## Phase 10: Set Budgets & Actual vs Budget

### Overview
User-defined monthly budget targets per category. Per-month overrides for seasonal adjustments. Actual vs budget comparison for current and past months.

### Budget Model

- Each budget is a category + year + monthly_amount (baseline)
- Monthly overrides for specific months (e.g., $800 for Groceries in November)
- Effective monthly budget = override amount if exists, else baseline monthly_amount

### Endpoints

- `GET /api/budget?year=2026` — get all set budgets for a year
- `PUT /api/budget/:category_id/:year` — set baseline monthly target
- `PUT /api/budget/:category_id/:year/:month` — set monthly override
- `DELETE /api/budget/:category_id/:year/:month` — remove override
- `GET /api/budget/actual/:year` — actual vs budget per category per month
  - Each entry: category, month, budget target, actual spend, pct, remaining/over
  - Month-level rollup: total budgeted vs total actual

### Tasks

- [x] 10.1 Add budget CRUD to budget_service.py
- [x] 10.2 Implement actual-vs-budget computation (join transactions with budgets, exclude transfers)
- [x] 10.3 Add budget endpoints to budget_router.py
- [x] 10.4 Write tests: set budget, override, actual vs budget math

### Success Criteria

#### Automated:
- [x] Set a $500/mo Groceries budget → actual vs budget shows correct percentages
- [x] Monthly override changes only that month's target
- [x] Actual amounts match sum of transactions in that category for that month
- [x] `make test` passes

---

**End of Tier 2 (Backend).** Subscriptions detected, historical analysis available, budgets settable with actual tracking.

---

# TIER 3 — Advanced

Budget suggestions, forecasting, rollover budgets. These build on the analytics foundation from Tier 2.

---

## Phase 11: Budget Suggestions

### Overview
Generate suggested budgets from historical data. Seasonal-aware: months with detected spending spikes get higher suggestions.

### Logic

- Baseline: historical monthly average per category
- For months flagged as seasonal: use that month's historical average instead of the overall average
- Clamp to 80% confidence interval
- Present with basis: "Based on $420 avg, $380–$460 range, December spike detected"

### Endpoints

- `GET /api/budget/suggestions/:year` — per-category per-month suggestions with historical basis

### Tasks

- [x] 11.1 Implement suggestion engine in budget_service.py
- [x] 11.2 Add suggestions endpoint
- [x] 11.3 Write tests: suggestions reflect seasonal patterns, suggestions within confidence intervals

---

## Phase 12: Forecasting

### Overview
Project future spending. Pluggable engine architecture — ships with "simple" method, designed for Monte Carlo and others later.

### Architecture

```
backend/app/services/forecast/
├── base.py              # Abstract forecaster interface
├── simple.py            # Seasonal + trend + subscriptions
├── registry.py          # Method name → engine class
└── (monte_carlo.py)     # Future
```

### Simple Forecaster

Per remaining month: subscriptions at detected amounts + non-subscription categories using same-month-last-year (seasonal) with trend adjustment. Current month: actual-to-date + projected remainder.

### API Contract

`GET /api/forecast/:year?method=simple`

Response:
- Each month: `status` (actual/partial/projected), category line items with `amount` (scalar) and `basis` (seasonal/subscription/trend/average)
- Optional `distribution` object (for future probabilistic methods) — null for simple
- Annual totals with same structure

`GET /api/forecast/yoy` — year-over-year (per-category annual totals by year)
`GET /api/forecast/methods` — available methods

### Tasks

- [x] 12.1 Create `backend/app/services/forecast/base.py` — abstract interface, ForecastResult
- [x] 12.2 Create `backend/app/services/forecast/registry.py`
- [x] 12.3 Create `backend/app/services/forecast/simple.py`
- [x] 12.4 Create `backend/app/routers/forecast_router.py` with method param routing
- [x] 12.5 Write tests: 2026 projections, YoY, subscriptions in projections, method registry

---

## Phase 13: Rollover Budgets

### Overview
Implement the rollover computation. The `rollover_mode` field already exists on budgets from Phase 2. This phase adds the logic.

### Logic

For a rollover-mode budget, effective budget for month N = baseline + (effective_budget_N-1 - actual_N-1). Sequential computation across months. Surplus carries forward, deficit carries forward.

### Tasks

- [x] 13.1 Implement rollover computation in budget_service.py
- [x] 13.2 Update actual-vs-budget endpoint to use effective budget for rollover categories
- [x] 13.3 Write tests: surplus carries, deficit carries, non-rollover unaffected

---

**End of Tier 3 (Backend).** Budget suggestions, forecasting, and rollover budgets complete.

---

# TIER 4 — Polish

These can be done in any order. Each is independent.

---

## Phase 14: Directory Watcher

Auto-import on file changes in `input/`. Use `watchfiles` with debounce. Background task in FastAPI lifespan.

- [ ] 14.1 Add watchfiles dependency, implement watcher service
- [ ] 14.2 Hook into FastAPI lifespan, add control endpoints (start/stop/status)

## Phase 15: Flex Budget Backend

Groups spending into fixed/flexible/non-monthly. Requires `expense_type` column on categories (new migration).

- [ ] 15.1 Add expense_type to categories, migration
- [ ] 15.2 Implement flex computation in budget_service
- [ ] 15.3 Add flex budget endpoint

## Phase 16: Recurring Calendar Data Endpoint

Provides subscription charge data by date for the calendar view.

- [ ] 16.1 Add calendar data endpoint (subscription charges by date)

## Phase 17: Transaction Context Endpoint

Provides context for focused classification mode.

- [ ] 17.1 Add `/api/transactions/:id/context` endpoint (similar transactions, vendor history)

---

## Testing Strategy

### Unit Tests (backend/tests/):
- Parser tests: each parser against sample CSV snippets, vendor extraction quality
- Service tests: import dedup, classification rule matching + precedence, payment matching, subscription detection, budget math, forecast projections
- Model tests: relationships, constraints, indexes

### Integration Tests:
- Full pipeline: CSV → import → classify → re-import → verify auto-classified
- Payment matching: import both accounts → detect → verify stats exclude transfers
- Stats accuracy: cross-check endpoint totals against raw CSV sums minus transfers

### Frontend tests are tracked in `docs/plans/frontend.md`.

## Performance Considerations

- SQLite fine for single-user with ~100k transactions
- Indexes on: transactions(date, vendor, category_id, account, import_hash, is_transfer)
- Subscription detection and budget analysis computed on-demand; add caching if slow on large datasets

## Dependencies

**Backend:** fastapi, uvicorn[standard], sqlalchemy, alembic, pydantic, pydantic-settings, pytest, httpx, ruff

**Tier 4 additions:** watchfiles (directory watcher)

Frontend dependencies are tracked in `docs/plans/frontend.md`.
