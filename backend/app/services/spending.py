"""Spending math primitives — date-range value type and named queries.

This module is the single home for spending-side math primitives. The full
shape, landed across several plans, is:

  - ``Period`` — frozen value type for an inclusive ``[start, end]`` date
    range, with named constructors (``range``, ``month``, ``year``,
    ``yyyymm``) and derived-fact methods (``months_overlapping``,
    ``is_in_progress``, ``pace_factor``, ``days_remaining``).
  - ``BudgetTarget`` — effective-budget semantics with three flavors
    (baseline, with_overrides, with_rollover). Lands across plans
    ``2026-05-08-07`` and ``2026-05-08-10``.
  - Named outflow / income spending functions (``spending.range_total``,
    ``spending.income_total``, etc.).

The public surface of this module is its imports — every public symbol in
one file. Match the lightweight, focused-purpose service-module style of
``app/services/category_filters.py``.
"""

from calendar import monthrange
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import extract, func, or_
from sqlalchemy.orm import Query, Session

from app.models import Budget, Category, Transaction
from app.services.category_filters import not_excluded_from_budget


@dataclass(frozen=True)
class Period:
    """Inclusive ``[start, end]`` date range.

    Construct via the named classmethods (``range``, ``month``, ``year``,
    ``yyyymm``); they all funnel through ``range`` so the ``start <= end``
    invariant is enforced in one place.
    """

    start: date
    end: date

    def __post_init__(self) -> None:
        if self.start > self.end:
            raise ValueError(f"Period start ({self.start}) must be on or before end ({self.end})")

    # ---- Constructors ----------------------------------------------------

    @classmethod
    def range(cls, start: date, end: date) -> "Period":
        """Inclusive range from ``start`` to ``end``. Raises if ``start > end``."""
        return cls(start=start, end=end)

    @classmethod
    def month(cls, year: int, month: int) -> "Period":
        """Calendar month: first day to last day inclusive."""
        last_day = monthrange(year, month)[1]
        return cls.range(date(year, month, 1), date(year, month, last_day))

    @classmethod
    def year(cls, year: int) -> "Period":
        """Calendar year: Jan 1 to Dec 31 inclusive."""
        return cls.range(date(year, 1, 1), date(year, 12, 31))

    @classmethod
    def yyyymm(cls, yyyymm: int) -> "Period":
        """Convenience: ``yyyymm(202605) == month(2026, 5)``."""
        return cls.month(yyyymm // 100, yyyymm % 100)

    # ---- Derived facts ---------------------------------------------------

    def months_overlapping(self) -> list[tuple[int, int]]:
        """Every ``(year, month)`` whose calendar month overlaps this range.

        Chronological order, inclusive of both endpoints' calendar months.
        Matches the semantics of the former ``pace_service._months_overlapping``.
        """
        out: list[tuple[int, int]] = []
        y, m = self.start.year, self.start.month
        end_y, end_m = self.end.year, self.end.month
        while (y, m) <= (end_y, end_m):
            out.append((y, m))
            if m == 12:
                y, m = y + 1, 1
            else:
                m += 1
        return out

    def is_in_progress(self, today: date) -> bool:
        """True iff this range is the in-progress current month.

        ``start == first-of-today's-month`` AND ``end >= today``. Mirrors
        ``pace_service._is_pace_range``.
        """
        return self.start == date(today.year, today.month, 1) and self.end >= today

    def pace_factor(self, today: date) -> Decimal:
        """Linear ``elapsed / month-length`` for the calendar month containing ``end``.

        Mirrors the inline math in ``pace_service._compute_pace_mode``:
        ``Decimal(elapsed_days) / Decimal(days_in_month)`` where
        ``elapsed_days = today.day`` (inclusive of today) and
        ``days_in_month = monthrange(end.year, end.month)[1]``.
        """
        days_in_month = monthrange(self.end.year, self.end.month)[1]
        elapsed_days = today.day
        return Decimal(elapsed_days) / Decimal(days_in_month)

    def days_remaining(self, today: date) -> int:
        """Inclusive count of days from ``max(today, start)`` to ``end``.

        Returns 0 if ``today`` is past ``end``.
        """
        anchor = today if today > self.start else self.start
        if anchor > self.end:
            return 0
        return (self.end - anchor).days + 1


class BudgetTarget:
    """Effective-budget resolution with explicit, named flavors.

    Each flavor classmethod returns a ``BudgetTarget`` carrying its
    resolution semantics; callers then ask for ``effective(year, month)``
    or ``effective_over(period)`` without having to know which flavor is
    in play. The flavors:

      - :meth:`baseline` — always returns ``Budget.monthly_amount``
        (or ``0`` for a missing budget). Ignores overrides; used by the
        CSP planning rollup, where the user sees their plan, not the
        latest in-flight tweak.
      - :meth:`with_overrides` — returns the per-month override if one
        exists for the requested month, otherwise the baseline. Used by
        pace and stats, where the displayed "expected" must reflect the
        user's most recent intent for that specific month.
      - :meth:`with_rollover` — folds in unused-prior-month carryover for
        rollover-mode budgets. Walks Jan..month-1 of the supplied
        ``Budget`` row, summing ``override-or-baseline − actual`` per
        prior month, then returns ``override-or-baseline + carry`` for
        the requested month.

    The ``year`` parameter on :meth:`effective` is accepted by the
    baseline and with_overrides flavors but unused — it's there so the
    ``with_rollover`` flavor (which needs it for the year-boundary check)
    shares the same signature.
    """

    __slots__ = ("_budget", "_apply_overrides", "_actuals_by_month")

    def __init__(
        self,
        budget: Budget | None,
        apply_overrides: bool,
        actuals_by_month: Mapping[int, Decimal] | None = None,
    ) -> None:
        # Private constructor — callers use the flavor classmethods so
        # the resolution semantics are spelled out at the call site.
        self._budget = budget
        self._apply_overrides = apply_overrides
        self._actuals_by_month: Mapping[int, Decimal] | None = actuals_by_month

    # ---- Flavor classmethods --------------------------------------------

    @classmethod
    def baseline(cls, budget: Budget | None) -> "BudgetTarget":
        """Always-baseline flavor: ignore overrides, return ``monthly_amount``."""
        return cls(budget=budget, apply_overrides=False)

    @classmethod
    def with_overrides(cls, budget: Budget | None) -> "BudgetTarget":
        """Override-or-baseline flavor: per-month override wins, else baseline."""
        return cls(budget=budget, apply_overrides=True)

    @classmethod
    def with_rollover(
        cls,
        budget: Budget | None,
        actuals_by_month: Mapping[int, Decimal],
    ) -> "BudgetTarget":
        """Rollover flavor: override-or-baseline plus accumulated prior-month carry.

        ``actuals_by_month`` is a mapping ``{1..12: Decimal}`` of in-year
        actual outflow magnitudes for the same category. ``effective(year,
        month)`` walks months ``1..month-1`` summing
        ``(override-or-baseline) − actual`` and adds that carry to the
        requested month's override-or-baseline.

        Year boundary: this flavor only walks Jan..Dec of
        ``budget.year``. Carry from December does not propagate to the
        next year. ``effective(year, month)`` raises ``ValueError`` if
        ``year != budget.year``.
        """
        return cls(budget=budget, apply_overrides=True, actuals_by_month=actuals_by_month)

    # ---- Resolution -----------------------------------------------------

    def _lookup_override_or_baseline(self, month: int) -> Decimal:
        """Override-or-baseline lookup for a single month.

        Precondition: ``self._budget is not None`` (callers branch on
        that first). Returns the per-month override when
        ``_apply_overrides`` is set and a matching override exists,
        otherwise the baseline ``monthly_amount``.
        """
        if self._apply_overrides:
            for override in self._budget.monthly_overrides:
                if override.month == month:
                    return Decimal(str(override.amount))
        return Decimal(str(self._budget.monthly_amount))

    def effective(self, year: int, month: int) -> Decimal:
        """Resolve the effective budget for a single ``(year, month)``.

        For the baseline and with_overrides flavors, ``year`` is unused.
        For the with_rollover flavor, ``year`` must equal the supplied
        ``budget.year``; otherwise ``ValueError`` is raised (year-boundary
        carry is intentionally dropped).
        """
        if self._budget is None:
            return Decimal("0")
        if self._actuals_by_month is None:
            return self._lookup_override_or_baseline(month)
        if year != self._budget.year:
            raise ValueError(
                f"with_rollover only supports the budget's year ({self._budget.year}); got {year}"
            )
        carry = Decimal("0")
        for m in range(1, month):
            target_m = self._lookup_override_or_baseline(m)
            actual_m = self._actuals_by_month.get(m, Decimal("0"))
            carry += target_m - actual_m
        return self._lookup_override_or_baseline(month) + carry

    def effective_over(self, period: Period) -> Decimal:
        """Sum :meth:`effective` across every month overlapping ``period``."""
        total = Decimal("0")
        for year, month in period.months_overlapping():
            total += self.effective(year, month)
        return total


# ---------------------------------------------------------------------------
# Outflow query functions
# ---------------------------------------------------------------------------
#
# Single SQL pattern shared across the four functions: structural filter +
# ``Transaction.amount < 0`` + ``[period.start, period.end]`` date range,
# with an optional pre-tax-exclusion axis implemented as an outer-join on
# ``Category`` + ``(is_pre_tax IS FALSE OR Category.id IS NULL)``.
#
# The structural filter is applied unconditionally inside ``_apply_structural_filter``
# — there is no caller-controllable bypass.


def _apply_structural_filter(query: Query) -> Query:
    """Apply the structural filter: drop transfers and exclude-from-budget rows.

    Every outflow query funnels through this helper so the filter rules are
    enforced in exactly one place. Callers cannot opt out.
    """
    return query.filter(
        Transaction.is_transfer.is_(False),
        not_excluded_from_budget(),
    )


def _apply_pre_tax_exclusion(query: Query) -> Query:
    """Outer-join Category and drop pre-tax categories (preserving uncategorized).

    Mirrors the idiom in ``stats_service.get_spending_trend``: rows with
    ``Category.id IS NULL`` (uncategorized transactions) survive the join
    because ``Category.is_pre_tax IS NULL`` is not ``True``.
    """
    return query.join(Category, Transaction.category_id == Category.id, isouter=True).filter(
        or_(Category.is_pre_tax.is_(False), Category.id.is_(None))
    )


def _outflow_base(db: Session, period: Period, *, exclude_pre_tax: bool) -> Query:
    """Build the common outflow query: structural + sign + date-range filters.

    Adds the pre-tax exclusion axis when ``exclude_pre_tax=True``.
    """
    q = _apply_structural_filter(db.query(Transaction)).filter(
        Transaction.amount < 0,
        Transaction.date >= period.start,
        Transaction.date <= period.end,
    )
    if exclude_pre_tax:
        q = _apply_pre_tax_exclusion(q)
    return q


def range_total(db: Session, period: Period, *, exclude_pre_tax: bool = False) -> Decimal:
    """Total outflow magnitude over ``period``.

    Returns a positive-magnitude Decimal (zero if no rows match). Applies the
    structural filter unconditionally; ``exclude_pre_tax=True`` additionally
    drops transactions in pre-tax categories (uncategorized rows are kept).
    """
    result = (
        _outflow_base(db, period, exclude_pre_tax=exclude_pre_tax)
        .with_entities(func.coalesce(func.sum(Transaction.amount), 0.0))
        .scalar()
    )
    return abs(Decimal(str(result or 0)))


def by_category(
    db: Session, period: Period, *, exclude_pre_tax: bool = False
) -> dict[int | None, Decimal]:
    """Per-category outflow magnitudes over ``period``.

    Keyed by ``category_id`` (``None`` for uncategorized rows). Values are
    positive-magnitude Decimals.
    """
    rows = (
        _outflow_base(db, period, exclude_pre_tax=exclude_pre_tax)
        .with_entities(
            Transaction.category_id,
            func.sum(Transaction.amount).label("total"),
        )
        .group_by(Transaction.category_id)
        .all()
    )
    out: dict[int | None, Decimal] = {}
    for row in rows:
        if row.total is None:
            continue
        out[row.category_id] = abs(Decimal(str(row.total)))
    return out


def by_year_month(
    db: Session, period: Period, *, exclude_pre_tax: bool = False
) -> dict[tuple[int, int], Decimal]:
    """Per-(year, month) outflow magnitudes over ``period``.

    Keyed by ``(year, month)``. Values are positive-magnitude Decimals.
    """
    rows = (
        _outflow_base(db, period, exclude_pre_tax=exclude_pre_tax)
        .with_entities(
            extract("year", Transaction.date).label("year"),
            extract("month", Transaction.date).label("month"),
            func.sum(Transaction.amount).label("total"),
        )
        .group_by(
            extract("year", Transaction.date),
            extract("month", Transaction.date),
        )
        .all()
    )
    out: dict[tuple[int, int], Decimal] = {}
    for row in rows:
        if row.total is None:
            continue
        out[(int(row.year), int(row.month))] = abs(Decimal(str(row.total)))
    return out


# ---------------------------------------------------------------------------
# Income query function
# ---------------------------------------------------------------------------
#
# Mirrors ``range_total`` shape but filters ``Transaction.amount > 0``. The
# ``exclude_pre_tax`` flag is included for signature symmetry with the outflow
# functions; pre-tax categories are a spending concept, so the flag is
# effectively a no-op for typical income transactions.


def income_total(db: Session, period: Period, *, exclude_pre_tax: bool = False) -> Decimal:
    """Total inflow magnitude over ``period``.

    Returns a positive Decimal (zero if no rows match). Applies the structural
    filter unconditionally and ``Transaction.amount > 0``. ``exclude_pre_tax``
    is supported for signature symmetry with the outflow functions but is
    typically a no-op (pre-tax categories are spending categories).
    """
    q = _apply_structural_filter(db.query(Transaction)).filter(
        Transaction.amount > 0,
        Transaction.date >= period.start,
        Transaction.date <= period.end,
    )
    if exclude_pre_tax:
        q = _apply_pre_tax_exclusion(q)
    result = q.with_entities(func.coalesce(func.sum(Transaction.amount), 0.0)).scalar()
    return Decimal(str(result or 0))


def by_category_and_month(
    db: Session, period: Period, *, exclude_pre_tax: bool = False
) -> dict[tuple[int | None, int, int], Decimal]:
    """Per-(category_id, year, month) outflow magnitudes over ``period``.

    Keyed by ``(category_id | None, year, month)``. Values are positive-magnitude
    Decimals.
    """
    rows = (
        _outflow_base(db, period, exclude_pre_tax=exclude_pre_tax)
        .with_entities(
            Transaction.category_id,
            extract("year", Transaction.date).label("year"),
            extract("month", Transaction.date).label("month"),
            func.sum(Transaction.amount).label("total"),
        )
        .group_by(
            Transaction.category_id,
            extract("year", Transaction.date),
            extract("month", Transaction.date),
        )
        .all()
    )
    out: dict[tuple[int | None, int, int], Decimal] = {}
    for row in rows:
        if row.total is None:
            continue
        out[(row.category_id, int(row.year), int(row.month))] = abs(Decimal(str(row.total)))
    return out
