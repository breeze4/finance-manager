# Period value type + months_overlapping migration

## Parent spec

`docs/specs/2026-05-08-02-spending-math-primitives.md`

## What to build

Introduce the `Period` frozen value type as the first primitive of the new
`app/services/spending.py` module. `Period` carries the four named
constructors (`.range`, `.month`, `.year`, `.yyyymm`) and the derived-fact
methods called out in the spec (`months_overlapping`, `is_in_progress`,
`pace_factor`, `days_remaining`).

Migrate the two existing call sites that re-derive month enumeration:
`pace_service._months_overlapping` (private helper, used by both pace and
actual-vs-budget modes) and the inline month-walk inside
`stats_service.get_spending_trend` (lines ~163–172). Both call sites switch
to `period.months_overlapping()`. Delete `pace_service._months_overlapping`.

No public-facing behavior changes; this is a refactor. The slice is verifiable
by the existing `test_pace_service` and `test_stats_service` suites continuing
to pass plus new direct unit tests for `Period`.

## Type

AFK

## Blocked by

None — can start immediately.

## Spec sections addressed

This is a refactor spec without numbered user stories. Sections covered:

- "Solution" — point 1 (the `Period` value type)
- "Behavior" → "What the module owns" — month enumeration over a range,
  pace factor, in-progress predicate
- "Behavior" → "What it hides" — `month_yyyymm` ↔ `(year, month)` arithmetic
- "Testing Strategy" → "New boundary tests" → `Period` bullets

## Acceptance criteria

- [ ] `app/services/spending.py` exists and exports `Period` with the
      constructors `range`, `month(year, month)`, `year(year)`,
      `yyyymm(yyyymm)` plus methods `months_overlapping() -> list[tuple[int, int]]`,
      `is_in_progress(today: date) -> bool`,
      `pace_factor(today: date) -> Decimal`, `days_remaining(today: date) -> int`.
- [ ] `Period` is a frozen `@dataclass(frozen=True)`; constructing
      `Period.range(d1, d2)` with `d1 > d2` raises `ValueError`.
- [ ] `pace_service` no longer defines `_months_overlapping`; it imports
      `Period` and calls `period.months_overlapping()` at the two existing
      sites (pace mode and actual-vs-budget mode).
- [ ] `stats_service.get_spending_trend` no longer contains the inline
      `while (y, m) <= (end_y, end_m)` walk; it constructs a `Period.range(...)`
      and calls `period.months_overlapping()`.
- [ ] `tests/test_spending_period.py` exists with at least the cases enumerated
      below.
- [ ] Full `pytest` and `ruff` pass; no new lint warnings.

## Owns

- `backend/app/services/spending.py` — new file, this plan creates it and
  defines `Period` (only). `BudgetTarget` and the `spending.*` query
  functions are added by later plans and are out of scope here.
- `backend/app/services/pace_service.py` — replaces `_months_overlapping`
  call sites at the pace-mode `_compute_actual_vs_budget_mode` (line ~297)
  and deletes the helper definition (lines ~378–395).
- `backend/app/services/stats_service.py` — replaces the inline month walk
  in `get_spending_trend` (lines ~162–172) with a call to
  `period.months_overlapping()`.
- `backend/tests/test_spending_period.py` — new file, unit tests for `Period`.

## Must not touch

- `backend/app/services/budget_service.py` — `_effective_*` helpers and the
  rollover walk are owned by plan `2026-05-08-07` and `2026-05-08-10`.
- `backend/app/services/csp_rollup_service.py` — owned by plans
  `2026-05-08-07` and `2026-05-08-08`.
- The internals of `stats_service.get_summary` / `get_monthly_stats` —
  these don't use month-overlapping logic; they're owned by plan
  `2026-05-08-08` and `2026-05-08-09`.
- `_effective_monthly_budget` in `stats_service.py` — owned by plan
  `2026-05-08-07`.
- `_actuals_by_category` and `_effective_budget` in `pace_service.py` —
  owned by plans `2026-05-08-07` and `2026-05-08-08`.

## Defines interfaces

- `Period` value type in `backend/app/services/spending.py` — consumed by
  plans `2026-05-08-07`, `2026-05-08-08`, `2026-05-08-09`,
  `2026-05-08-10`.

## Pattern exemplar

- **Follow the pattern in**: `backend/app/services/category_filters.py` —
  match the lightweight, focused-purpose service-module style (module
  docstring at top, small typed exports, no class hierarchy). For the
  `@dataclass(frozen=True)` shape with classmethod constructors, use
  Python stdlib idioms — no codebase precedent for a pure value type.
- **Follow the pattern in**: `backend/tests/test_pace_service.py` for the
  test-file style (module-level `_seed_*` helpers, test functions taking
  `db: Session`, parametrized cases via `pytest.mark.parametrize` where
  appropriate). `Period` tests don't need a `db` fixture — they're pure.

## Tasks

- [ ] Add `Period` dataclass with constructors `range`, `month`, `year`,
      `yyyymm` and a `__post_init__` validation that `start <= end`.
- [ ] Add `months_overlapping() -> list[tuple[int, int]]` matching
      semantics of `pace_service._months_overlapping` exactly (chronological
      order, inclusive of both endpoints' calendar months, empty list when
      `start > end` is unreachable due to the constructor guard).
- [ ] Add `is_in_progress(today: date) -> bool` matching
      `pace_service._is_pace_range`: `start == date(today.year, today.month, 1)
      AND end >= today`.
- [ ] Add `pace_factor(today: date) -> Decimal` matching the inline math in
      `pace_service._compute_pace_mode`: `Decimal(elapsed_days) /
      Decimal(days_in_month)` for the calendar month containing `end`.
- [ ] Add `days_remaining(today: date) -> int` (inclusive count of days from
      `max(today, start)` to `end`).
- [ ] Write `tests/test_spending_period.py` with cases: single-month range;
      cross-year December→January range; leap February; constructor `month(2026, 1)`
      equivalent to `range(date(2026,1,1), date(2026,1,31))`; constructor
      `year(2026)` equivalent to twelve months Jan–Dec; constructor
      `yyyymm(202605)` equivalent to `month(2026, 5)`; `range(d1, d2)` with
      `d1 > d2` raises `ValueError`; `is_in_progress` matrix (today inside,
      today before start, today after end, end equals today, end after today);
      `pace_factor` for first-of-month, mid-month, last-of-month, leap
      February.
- [ ] Migrate `pace_service._compute_actual_vs_budget_mode` (line ~297) from
      `_months_overlapping(date_from, date_to)` to
      `Period.range(date_from, date_to).months_overlapping()`.
- [ ] Migrate `stats_service.get_spending_trend` (lines ~162–172) from the
      inline `while` walk to `Period.range(date_from, date_to).months_overlapping()`.
      Drop the local `months: list[tuple[int, int]] = []` setup.
- [ ] Delete `pace_service._months_overlapping` (lines ~378–395).
- [ ] Run `pytest backend/tests/`. Confirm all suites pass without
      modification (the migration is behavior-preserving).
- [ ] Run `ruff check backend/`. Fix any flagged unused imports left by the
      deletion.

## Implementation notes

The `Period.month`, `Period.year`, and `Period.yyyymm` constructors are
convenience wrappers around `Period.range`:

```
Period.month(year, month) → Period.range(date(year, month, 1),
                                          date(year, month, monthrange(year, month)[1]))
Period.year(year)         → Period.range(date(year, 1, 1), date(year, 12, 31))
Period.yyyymm(yyyymm)     → Period.month(yyyymm // 100, yyyymm % 100)
```

The `months_overlapping` walk is identical to today's
`_months_overlapping` in `pace_service.py`:

```
y, m = self.start.year, self.start.month
end_y, end_m = self.end.year, self.end.month
out = []
while (y, m) <= (end_y, end_m):
    out.append((y, m))
    if m == 12: y, m = y + 1, 1
    else: m += 1
return out
```

Two call-site reminders:

1. `pace_service._compute_pace_mode` (line ~174) currently computes
   `days_in_month = monthrange(year, month)[1]` and `elapsed_days = date_to.day`
   and `pace_factor = Decimal(elapsed_days) / Decimal(days_in_month)`. This
   migration leaves that math in pace_service for now (this slice migrates
   only `_months_overlapping` callers). The pace_factor migration onto
   `Period` is part of this slice's `pace_factor` method addition, but pace
   mode's caller stays as-is until plan `2026-05-08-10` or a future cleanup
   touches it. The method exists for `Period`'s contract to be complete and
   for the unit tests; the production migration of pace mode is deferred.

   *Decision: delete the local computation in `_compute_pace_mode` and call
   `period.pace_factor(today)` as part of this slice if it's a one-line
   change. Otherwise leave it for later.* The implementer decides based on
   what the diff actually looks like.

2. `stats_service.get_spending_trend` builds a Period from `(date_from,
   date_to)`. The function signature stays `(date_from, date_to)` — the
   Period is constructed inside the function. No router signature change.
