# BudgetTarget.with_rollover + actual_vs_budget migration

## Parent spec

`docs/specs/2026-05-08-02-spending-math-primitives.md`

## What to build

Add the third flavor of `BudgetTarget`:

- `BudgetTarget.with_rollover(budget: Budget | None, actuals_by_month: Mapping[int, Decimal]) -> BudgetTarget`

`actuals_by_month` is a mapping `{1..12: Decimal}` of in-year actuals per
month for the same category. The flavor's `effective(year, month)` walks
months 1..month sequentially: for each prior month it computes
`carry[m] = effective_baseline_or_override[m-1] - actuals[m-1] + carry[m-1]`
and then returns `effective_baseline_or_override[month] + carry[month]`.

Year boundary: per the resolved judgment call, **drop carry at year
boundary**. `with_rollover` walks Jan–Dec of the supplied `Budget` row
only. December surplus is lost if no `Budget` row exists for January of
the next year. This matches today's implicit behavior in
`budget_service.get_actual_vs_budget`.

Migrate the one remaining caller:

- `budget_service.get_actual_vs_budget` — replace its inline
  `for month in range(1, 13)` loop (lines ~388–430) with:
  1. `actuals = spending.by_category_and_month(db, Period.year(year))` —
     pulls all actuals once.
  2. For each `Budget`, build its `actuals_by_month: dict[int, Decimal]`
     by filtering the `actuals` dict by `(category_id, year, month)`.
  3. Construct `target = BudgetTarget.with_rollover(budget, actuals_by_month)`
     when `budget.rollover_mode` is true, else
     `BudgetTarget.with_overrides(budget)`.
  4. For each month 1..12, compute `target_amount = target.effective(year, month)`.
  5. Apply the existing pre-tax substitution rule (`if is_pre_tax: actual =
     target_amount`) and emit the existing `ActualVsBudgetEntry` and
     `MonthlyRollup` dataclasses unchanged.

After this slice, the spec's full migration is complete:

- `_effective_budget`, `_effective_monthly_budget`, `_baseline`,
  `_actuals_by_category`, `_months_overlapping` all deleted.
- The structural filter is applied at exactly one point (`spending.py`).
- `budget_service.get_actual_vs_budget` no longer contains
  `db.query(Transaction).filter(...)` or the inline rollover-carry walk.

End the slice with a sweep that verifies these properties.

## Type

AFK

## Blocked by

- Blocked by `2026-05-08-07-spending-budget-target.md` —
  `with_rollover` builds on `with_overrides` semantics.
- Blocked by `2026-05-08-08-spending-outflow-functions.md` —
  uses `spending.by_category_and_month` and `Period.year`.

## Spec sections addressed

- "Solution" — point 2 (`with_rollover` is the third `BudgetTarget`
  flavor)
- "Behavior" → "What the module owns" — three effective-budget flavors and
  the rollover walk
- "Behavior" → "Caller migration" — actual-vs-budget endpoint mapping
- "Resolved judgment calls" — drop carry at year boundary
- "Testing Strategy" → `with_rollover` bullets

## Acceptance criteria

- [ ] `app/services/spending.py` exports `BudgetTarget.with_rollover(budget,
      actuals_by_month)` returning a `BudgetTarget` whose `effective(year,
      month)` returns `effective_with_overrides + accumulated_carry`.
- [ ] Year-boundary behavior: `with_rollover(budget, actuals)` only walks
      `month ∈ {1..12}` for the supplied `budget.year`. Carry from December
      does not propagate. Documented in the flavor's docstring.
- [ ] `budget_service.get_actual_vs_budget` no longer contains
      `db.query(Transaction).filter(...)`. The inline `rollover_carry`
      accumulator is deleted; the `BudgetTarget.with_rollover` walk
      replaces it. Response shape (`ActualVsBudgetResult` with `entries`
      and `monthly_rollups`) unchanged.
- [ ] Pre-tax substitution (line ~404 today) is preserved: when
      `cat.is_pre_tax`, `actual_spend = target_amount`.
- [ ] `tests/test_spending_budget_target.py` (added in plan 07) gains a
      `with_rollover` test class covering the cases enumerated below.
- [ ] Existing `test_rollover_budgets`, `test_budget_pretax_actuals`,
      `test_budget_crud`, `test_budget_analysis` suites pass without
      modification.
- [ ] Final sweep:
      - `grep -r "_effective_budget\|_effective_monthly_budget\|_baseline\|_actuals_by_category\|_months_overlapping" backend/app/services/`
        returns no matches in service files (only in `spending.py` if
        anywhere — they're not used as private names there).
      - `grep -r "db.query(Transaction).filter" backend/app/services/`
        returns matches only in `spending.py` and any service that
        legitimately doesn't deal in spending math (e.g.
        `transaction_service`, `payment_service`, `ingestion`,
        `subscription_service`). `pace_service`, `stats_service`,
        `budget_service`, `csp_rollup_service` should be clean.
- [ ] Full `pytest` and `ruff` pass.

## Owns

- `backend/app/services/spending.py` — adds `BudgetTarget.with_rollover`
  classmethod and the rollover walk inside `effective`.
- `backend/app/services/budget_service.py` — rewrites
  `get_actual_vs_budget` body (lines ~337–449) to use
  `spending.by_category_and_month` + `BudgetTarget`. The historical-analysis
  half of this file (`get_historical_analysis`, `_compute_trend`,
  `_detect_seasonal_months`, `get_budget_suggestions`, the dataclasses) is
  NOT in scope — leave it alone.
- `backend/tests/test_spending_budget_target.py` — adds `with_rollover`
  test class.

## Must not touch

- `app/services/spending.py`'s `Period`, `BudgetTarget.baseline`,
  `BudgetTarget.with_overrides`, and the four outflow functions plus
  `income_total` — already defined; this plan only adds `with_rollover`.
- `pace_service`, `stats_service`, `csp_rollup_service` — fully
  migrated. No changes.
- `budget_service.get_historical_analysis` and the dataclasses
  `CategoryHistoricalStats`, `BudgetSuggestion`, etc. — out of scope;
  these don't use spending-math primitives.
- `budget_service.list_budgets`, `set_budget`, `set_monthly_override`,
  `delete_monthly_override` — CRUD; out of scope.
- ORM models, Alembic migrations, API routers.

## Defines interfaces

- `BudgetTarget.with_rollover` in `backend/app/services/spending.py` — no
  downstream plan depends on this; it's the final piece of the bundle.

## Pattern exemplar

- **Follow the pattern in**: the existing `BudgetTarget` shape from plan
  `2026-05-08-07` — match classmethod conventions and `effective` /
  `effective_over` signatures.
- **Follow the pattern in**: today's inline rollover walk in
  `budget_service.get_actual_vs_budget` (lines ~386–430) — the new
  implementation must produce the same numbers for the same inputs. The
  `test_rollover_budgets` suite is the regression contract.
- **Follow the pattern in**: `backend/tests/test_rollover_budgets.py` for
  the test-style and fixture conventions when writing new
  `BudgetTarget.with_rollover` unit tests.

## Tasks

- [ ] Extend `BudgetTarget` to support a third flavor:
      - Add a private field `_actuals_by_month: dict[int, Decimal] | None`
        defaulting to `None`.
      - Add classmethod `with_rollover(budget, actuals_by_month)` that
        sets `_apply_overrides=True` AND populates `_actuals_by_month`.
      - In `effective(year, month)`, branch: if `_actuals_by_month is
        None`, return the existing baseline-or-override result; otherwise
        compute `accumulated_carry` by walking months 1..month−1 and add
        to the override-or-baseline for the requested month.
      - The carry walk: `carry = Decimal("0")`; for `m in range(1,
        month)`: `target_m = (override or baseline)`; `actual_m =
        actuals_by_month.get(m, Decimal("0"))`; `carry += target_m -
        actual_m`. Return `(override or baseline) for `month` + `carry`.
- [ ] Write `with_rollover` tests in `tests/test_spending_budget_target.py`:
      - Single month (Jan) with no prior carry: equals
        `with_overrides(budget).effective(year, 1)`.
      - February with January surplus (target 100, actual 80): March's
        effective is `target_march + 20`.
      - February with January deficit (target 100, actual 130):
        February's effective is `target_feb − 30`.
      - Override in March + carry from Jan/Feb: override wins for March's
        baseline-or-override, carry adds.
      - Year-boundary drop: `with_rollover(budget, actuals)` for a
        `budget.year=2026` row never produces results outside Jan–Dec
        2026; `effective(year=2027, month=1)` is undefined behavior — pin
        with a docstring assertion (raise `ValueError` if `year !=
        budget.year`).
      - `actuals_by_month={}` (no actuals data): carry computation uses
        zero actuals, so carry equals cumulative target; effective grows
        each month.
- [ ] Rewrite `budget_service.get_actual_vs_budget` body:
      - Replace the implicit data fetch by querying once with
        `actuals = spending.by_category_and_month(db, Period.year(year))`.
        This returns `dict[(category_id, year, month), Decimal]`.
      - Per `Budget`, build
        `actuals_by_month = {m: actuals.get((budget.category_id, year, m), Decimal("0")) for m in range(1, 13)}`.
      - Construct `target = BudgetTarget.with_rollover(budget,
        actuals_by_month)` when `budget.rollover_mode`, else
        `BudgetTarget.with_overrides(budget)`.
      - Per month: `target_amount = target.effective(year, month)`. If
        `is_pre_tax`: `actual = target_amount`; else `actual =
        actuals_by_month[month]` (already a positive magnitude Decimal,
        coerce to `float` for the response shape).
      - Compute `diff`, `pct`, build `ActualVsBudgetEntry`, accumulate
        `month_totals`. Build `MonthlyRollup` per existing logic.
      - Drop the local `actual_map` dict and the inline `actual_rows`
        query.
- [ ] Drop the unused `from sqlalchemy import extract, func` import in
      `budget_service.py` if `get_historical_analysis` no longer needs
      `extract` (it does — both `get_historical_analysis` and
      `_compute_trend` use `extract`). Confirm the import stays needed.
- [ ] Run `pytest backend/tests/`. Confirm all suites pass.
- [ ] Run the final sweep grep checks listed in acceptance criteria.
- [ ] Run `ruff check backend/` and `ruff format backend/`.

## Implementation notes

### `BudgetTarget.with_rollover` — full effective() logic

```python
def effective(self, year: int, month: int) -> Decimal:
    if self._budget is None:
        return Decimal("0")
    if self._actuals_by_month is None:
        return self._lookup_override_or_baseline(month)
    if year != self._budget.year:
        raise ValueError(
            f"with_rollover only supports the budget's year "
            f"({self._budget.year}); got {year}"
        )
    carry = Decimal("0")
    for m in range(1, month):
        target_m = self._lookup_override_or_baseline(m)
        actual_m = self._actuals_by_month.get(m, Decimal("0"))
        carry += target_m - actual_m
    return self._lookup_override_or_baseline(month) + carry

def _lookup_override_or_baseline(self, month: int) -> Decimal:
    if self._apply_overrides:
        for override in self._budget.monthly_overrides:
            if override.month == month:
                return Decimal(str(override.amount))
    return Decimal(str(self._budget.monthly_amount))
```

### `get_actual_vs_budget` rewrite — sketch

Today (lines ~337–449, ~110 lines). After (sketch, ~75 lines):

```python
def get_actual_vs_budget(db: Session, *, year: int) -> ActualVsBudgetResult:
    period = Period.year(year)
    actuals = spending.by_category_and_month(db, period)  # (cat, y, m) -> Decimal
    budgets = list_budgets(db, year=year)

    entries: list[ActualVsBudgetEntry] = []
    month_totals: dict[int, dict[str, float]] = defaultdict(
        lambda: {"budgeted": 0.0, "actual": 0.0}
    )

    for budget in budgets:
        cat = budget.category
        cat_name = cat.name if cat else "Unknown"
        cat_bucket = cat.csp_bucket if cat else None
        is_pre_tax = bool(cat.is_pre_tax) if cat else False

        actuals_by_month = {
            m: actuals.get((budget.category_id, year, m), Decimal("0"))
            for m in range(1, 13)
        }
        target = (
            BudgetTarget.with_rollover(budget, actuals_by_month)
            if budget.rollover_mode
            else BudgetTarget.with_overrides(budget)
        )

        for month in range(1, 13):
            target_amount = float(target.effective(year, month))
            actual = (
                target_amount
                if is_pre_tax
                else float(actuals_by_month[month])
            )
            diff = round(target_amount - actual, 2)
            pct = round(actual / target_amount * 100, 1) if target_amount > 0 else 0.0

            entries.append(ActualVsBudgetEntry(
                category_id=budget.category_id,
                category_name=cat_name,
                month=month,
                budget_target=round(target_amount, 2),
                actual_spend=round(actual, 2),
                difference=diff,
                percentage=pct,
                csp_bucket=cat_bucket,
                is_pre_tax=is_pre_tax,
            ))
            month_totals[month]["budgeted"] += target_amount
            month_totals[month]["actual"] += actual

    monthly_rollups = []
    for month in range(1, 13):
        totals = month_totals[month]
        budgeted = round(totals["budgeted"], 2)
        actual = round(totals["actual"], 2)
        diff = round(budgeted - actual, 2)
        pct = round(actual / budgeted * 100, 1) if budgeted > 0 else 0.0
        monthly_rollups.append(MonthlyRollup(
            month=month, total_budgeted=budgeted,
            total_actual=actual, difference=diff, percentage=pct,
        ))

    return ActualVsBudgetResult(entries=entries, monthly_rollups=monthly_rollups)
```

The rounding and float coercion match today exactly (lines ~408–409,
425–447). Cross-check: `actuals_by_month[month]` is a positive Decimal
because `spending.by_category_and_month` returns positive magnitudes; the
`float(...)` coercion at the response boundary is identical to today's
implicit `abs(row.total)` cast.

### Final sweep — grep commands

These should run clean after the slice:

```
grep -rn "_effective_budget\b" backend/app/services/
grep -rn "_effective_monthly_budget\b" backend/app/services/
grep -rn "_baseline\b" backend/app/services/
grep -rn "_actuals_by_category\b" backend/app/services/
grep -rn "_months_overlapping\b" backend/app/services/
```

Expected output: no hits (or only inside `spending.py` if a private name
clashes — it shouldn't, but check).

```
grep -n "db.query(Transaction).filter" backend/app/services/{pace,stats,budget,csp_rollup}_service.py
```

Expected output: no hits. All `Transaction` filter-query construction lives
in `spending.py` after this slice.

### Performance note

`spending.by_category_and_month(db, Period.year(year))` runs ONE
aggregation query that returns at most `categories × months` rows
(typically < 200). The pre-migration code ran the same query with
slightly different grouping. No regression expected. If profiling shows a
hotspot, the next step would be a `categories=...` filter parameter on
`spending.by_category_and_month` — out of scope here.
