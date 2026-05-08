# Finance Analyzer — Backend Implementation Plan

Extracted from `todo.md`. All backend phases, in implementation order. The frontend plan is in `frontend.md`.

## Dependencies

The frontend depends on backend APIs. Backend phases are self-contained — no frontend work blocks backend progress.

---

# TIER 1 — Foundation

---

## Phase B1: Project Scaffolding

### Overview
Backend project structure, FastAPI app, SQLite setup, Alembic, root Makefile. Health check proves the stack works.

### Tasks

- [ ] B1.1 Create `backend/pyproject.toml` with dependencies: fastapi, uvicorn, sqlalchemy, alembic, pydantic, pydantic-settings, pytest, httpx, ruff
- [ ] B1.2 Create `backend/app/config.py` — Pydantic Settings class (DATABASE_URL defaulting to `sqlite:///data/finance.db`, INPUT_DIR defaulting to `input/`)
- [ ] B1.3 Create `backend/app/database.py` — SQLAlchemy engine, sessionmaker, `get_db` dependency
- [ ] B1.4 Create `backend/app/main.py` — FastAPI app with CORS middleware (allow localhost origins), health check at `GET /api/health`
- [ ] B1.5 Initialize Alembic: `backend/alembic.ini` and `backend/alembic/env.py` configured to use the same engine
- [ ] B1.6 Create root `Makefile` with targets: `install`, `dev-backend`, `dev-frontend`, `dev` (both), `test`, `lint`, `migrate`, `migrate-new`
- [ ] B1.7 Update `.gitignore` for Python, Node, data, and environment files
- [ ] B1.8 Create `data/` directory with `.gitkeep`

### Success Criteria

- [ ] `make install` completes without errors (backend portion)
- [ ] `make dev-backend` starts, `curl localhost:8000/api/health` returns 200

---

## Phase B2: Data Model & Migrations

### Overview
SQLAlchemy models, initial Alembic migration, canonical category seeding. The database schema exists and is version-controlled after this phase.

### Tables

See `todo.md` Phase 2 for full schema (transactions, categories, classification_rules, payment_matches, budgets, budget_monthly_overrides, subscriptions, import_log).

### Tasks

- [ ] B2.1 Create `backend/app/models/` — all model files (transaction, category, classification_rule, payment_match, budget, subscription, import_log)
- [ ] B2.2 Create initial Alembic migration for all tables (including Tier 2/3 tables — schema is cheap, avoids migrations later)
- [ ] B2.3 Seed canonical categories on first run: Shopping, Groceries, Dining, Health & Wellness, Entertainment, Bills & Utilities, Travel, Gas, Education, Personal, Home, Gifts & Donations, Income, Investments, Transfers, Uncategorized
- [ ] B2.4 Write tests: migration applies cleanly, category seeding works, model relationships correct

### Success Criteria

- [ ] `make migrate` creates SQLite database with all tables
- [ ] Category seeding populates 16 canonical categories
- [ ] `make test` passes

---

## Phase B3: CSV Parsers & Import

### Overview
Pluggable parser architecture, Chase CC and BECU parsers, import pipeline with format auto-detection and deduplication. After this phase, all sample data can be imported.

### Parser Interface

See `todo.md` Phase 3 for full details (base.py interface, registry, Chase CC parser, BECU parser, import pipeline).

### Tasks

- [ ] B3.1 Create `backend/app/parsers/base.py` — abstract parser interface and `RawTransaction` dataclass
- [ ] B3.2 Create `backend/app/parsers/registry.py` — parser registry with format detection
- [ ] B3.3 Implement `backend/app/parsers/chase_cc.py` — parser with `CHASE_CATEGORY_MAP` and vendor extraction
- [ ] B3.4 Implement `backend/app/parsers/becu_checking.py` — parser with vendor extraction
- [ ] B3.5 Create `backend/app/services/import_service.py` — import pipeline with dedup, rule application, category mapping
- [ ] B3.6 Create `backend/app/routers/import_router.py` — import endpoints
- [ ] B3.7 Write parser tests: each parser against sample data, verify vendor extraction quality, verify import hashes are stable across runs
- [ ] B3.8 Write import service tests: dedup (import same file twice → 0 new rows), category mapping, rule application during import

### Success Criteria

- [ ] Parser tests pass against sample CSV data
- [ ] Import all 4 CSVs → returns row counts
- [ ] Import again → 0 new rows (dedup works)
- [ ] Chase transactions have category_id set via CHASE_CATEGORY_MAP
- [ ] `make test` passes
- [ ] Spot-check: vendor names reasonable, amounts correct sign, dates correct

---

## Phase B4: Transaction API & Stats

### Overview
The backbone API the frontend consumes. Transaction list with filtering/sorting/pagination, categories CRUD, spending stats. All spending queries exclude transfers.

### Endpoints

See `todo.md` Phase 4 for full endpoint specs (transactions CRUD, categories CRUD, stats summary/monthly).

### Tasks

- [ ] B4.1 Create `backend/app/schemas/` — Pydantic models for all request/response shapes
- [ ] B4.2 Create `backend/app/services/transaction_service.py` — query builder with filtering/sorting/pagination, `is_transfer` exclusion on spending queries
- [ ] B4.3 Create `backend/app/routers/transaction_router.py`
- [ ] B4.4 Create `backend/app/routers/category_router.py`
- [ ] B4.5 Create `backend/app/services/stats_service.py` — summary and monthly stats, always excluding transfers
- [ ] B4.6 Create `backend/app/routers/stats_router.py`
- [ ] B4.7 Write tests: filtering, sorting, pagination, transfer exclusion in stats
- [ ] B4.8 Write tests: stats accuracy (cross-check against raw CSV sums minus transfers)

### Success Criteria

- [ ] All endpoints return correct data after importing sample CSVs
- [ ] Filtering by account, date range, category, amount range works
- [ ] Pagination returns correct totals
- [ ] Stats exclude transactions where `is_transfer = true`
- [ ] `make test` passes

---

## Phase B5: Classification System

### Overview
Rules engine for auto-classifying transactions. Classify a transaction → rule auto-created → future imports of that vendor get the same category.

### Behavior

See `todo.md` Phase 5 for full details (manual classification, rule matching precedence, bulk classification, endpoints).

### Tasks

- [ ] B5.1 Create `backend/app/services/classification_service.py` — rule matching (exact → starts_with → contains), auto-rule creation
- [ ] B5.2 Create `backend/app/routers/rules_router.py` — CRUD endpoints
- [ ] B5.3 Hook auto-rule creation into transaction PATCH (when category changes)
- [ ] B5.4 Hook rule application into import pipeline (apply after parse, before insert)
- [ ] B5.5 Implement retroactive rule application
- [ ] B5.6 Update bulk-update to auto-create rules per vendor
- [ ] B5.7 Write tests: rule creation on classify, match precedence (exact beats contains), retroactive apply, bulk classify

### Success Criteria

- [ ] Classifying a transaction auto-creates a rule
- [ ] Re-importing applies the new rule
- [ ] Retroactive apply updates existing unverified transactions
- [ ] Match precedence: exact > starts_with > contains
- [ ] `make test` passes

---

## Phase B6: Payment Matching

### Overview
Cross-account transfer detection. Without this, spending totals double-count CC payments.

### Algorithm

See `todo.md` Phase 6 for full details (candidate identification, matching criteria, endpoints).

### Tasks

- [ ] B6.1 Create `backend/app/services/payment_service.py` — detection algorithm
- [ ] B6.2 Create `backend/app/routers/payment_router.py`
- [ ] B6.3 Hook detection into import pipeline (run after import completes)
- [ ] B6.4 Write tests: match the $9,379.99 payment (BECU 12/26 → Chase 12/25), no false positives

### Success Criteria

- [ ] Detection finds the $9,379.99 payment match
- [ ] Both matched transactions have `is_transfer = true`
- [ ] Stats endpoints now exclude these from spending totals
- [ ] `make test` passes

---

**End of Tier 1 Backend.** All APIs needed for a functional frontend are available.

---

# TIER 2 — Analytics

---

## Phase B7: Subscription Detection

### Overview
Identify recurring charges from transaction history. Foundation for budget analysis and forecasting.

### Algorithm

See `todo.md` Phase 8 for full details (grouping, interval analysis, frequency classification).

### Tasks

- [ ] B7.1 Create `backend/app/services/subscription_service.py` — detection algorithm
- [ ] B7.2 Create `backend/app/routers/subscription_router.py`
- [ ] B7.3 Write tests: detect YouTube Premium (~$15.44/mo fixed), Crunchyroll (~$8.81/mo fixed), Vanguard (~$1000 recurring)

### Success Criteria

- [ ] YouTube Premium and Crunchyroll detected as fixed monthly
- [ ] Vanguard detected as recurring
- [ ] Annual estimates within 20% of actual totals
- [ ] `make test` passes

---

## Phase B8: Historical Budget Analysis

### Overview
Per-category statistics computed from transaction history. No user input required. Data foundation for budget suggestions and forecasting.

### Computation

See `todo.md` Phase 9 for full details (monthly average/median/min/max, confidence intervals, trends, seasonal detection).

### Tasks

- [ ] B8.1 Create `backend/app/services/budget_service.py` — historical analysis
- [ ] B8.2 Create `backend/app/routers/budget_router.py` — historical endpoint
- [ ] B8.3 Write tests: stats accuracy against known data, trend detection, seasonal flagging

### Success Criteria

- [ ] Groceries monthly average matches manual calculation from data
- [ ] Confidence intervals are reasonable
- [ ] `make test` passes

---

## Phase B9: Budget CRUD & Actual vs Budget

### Overview
User-defined monthly budget targets per category. Per-month overrides for seasonal adjustments. Actual vs budget comparison.

### Endpoints

See `todo.md` Phase 10 for full details (budget CRUD, monthly overrides, actual vs budget computation).

### Tasks

- [ ] B9.1 Add budget CRUD to budget_service.py
- [ ] B9.2 Implement actual-vs-budget computation (join transactions with budgets, exclude transfers)
- [ ] B9.3 Add budget endpoints to budget_router.py
- [ ] B9.4 Write tests: set budget, override, actual vs budget math

### Success Criteria

- [ ] Set a $500/mo Groceries budget → actual vs budget shows correct percentages
- [ ] Monthly override changes only that month's target
- [ ] Actual amounts match sum of transactions in that category for that month
- [ ] `make test` passes

---

**End of Tier 2 Backend.**

---

# TIER 3 — Advanced

---

## Phase B10: Budget Suggestions

### Overview
Generate suggested budgets from historical data. Seasonal-aware.

### Logic

See `todo.md` Phase 11 for full details (baseline from average, seasonal overrides, confidence interval clamping).

### Tasks

- [ ] B10.1 Implement suggestion engine in budget_service.py
- [ ] B10.2 Add suggestions endpoint
- [ ] B10.3 Write tests: suggestions reflect seasonal patterns, suggestions within confidence intervals

### Success Criteria

- [ ] Suggestions exist for all categories with sufficient history
- [ ] Seasonal months get higher suggestions
- [ ] `make test` passes

---

## Phase B11: Forecasting

### Overview
Project future spending. Pluggable engine architecture — ships with "simple" method.

### Architecture

See `todo.md` Phase 12 for full details (abstract interface, simple forecaster, API contract).

### Tasks

- [ ] B11.1 Create `backend/app/services/forecast/base.py` — abstract interface, ForecastResult
- [ ] B11.2 Create `backend/app/services/forecast/registry.py`
- [ ] B11.3 Create `backend/app/services/forecast/simple.py`
- [ ] B11.4 Create `backend/app/routers/forecast_router.py` with method param routing
- [ ] B11.5 Write tests: 2026 projections, YoY, subscriptions in projections, method registry

### Success Criteria

- [ ] Simple forecaster produces reasonable 2026 projections
- [ ] YoY endpoint returns per-category annual totals
- [ ] `make test` passes

---

## Phase B12: Rollover Budgets

### Overview
Implement rollover computation. The `rollover_mode` field already exists on budgets from Phase B2.

### Tasks

- [ ] B12.1 Implement rollover computation in budget_service.py
- [ ] B12.2 Update actual-vs-budget endpoint to use effective budget for rollover categories
- [ ] B12.3 Write tests: surplus carries, deficit carries, non-rollover unaffected

### Success Criteria

- [ ] Rollover math is correct across multi-month sequences
- [ ] Non-rollover budgets unaffected
- [ ] `make test` passes

---

**End of Tier 3 Backend.**

---

# TIER 4 — Polish (Backend)

These can be done in any order. Each is independent.

---

## Phase B13: Directory Watcher

Auto-import on file changes in `input/`. Use `watchfiles` with debounce. Background task in FastAPI lifespan.

- [ ] B13.1 Add watchfiles dependency, implement watcher service
- [ ] B13.2 Hook into FastAPI lifespan, add control endpoints (start/stop/status)

## Phase B14: Flex Budget Backend

- [ ] B14.1 Add `expense_type` to categories, new migration
- [ ] B14.2 Implement flex computation in budget_service (fixed/flexible/non-monthly grouping)
- [ ] B14.3 Add flex endpoint to budget_router

## Phase B15: Calendar Data Endpoint

- [ ] B15.1 Add calendar data endpoint (subscription charges by date)

## Phase B16: Transaction Context Endpoint

- [ ] B16.1 Add `/api/transactions/:id/context` endpoint (similar transactions, vendor history)
