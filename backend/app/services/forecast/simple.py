import statistics
from collections import defaultdict
from datetime import date

from sqlalchemy import extract, func
from sqlalchemy.orm import Session

from app.models import Category, Subscription, Transaction
from app.services.forecast.base import (
    BaseForecaster,
    ForecastLineItem,
    ForecastResult,
    MonthForecast,
)


class SimpleForecaster(BaseForecaster):
    """Simple forecaster: seasonal + trend + subscriptions.

    For each month:
    - Past months: use actual spending data.
    - Current month: actual-to-date + projected remainder.
    - Future months: same-month-last-year (seasonal) with trend adjustment,
      plus subscription amounts at their detected frequency.
    """

    @property
    def name(self) -> str:
        return "simple"

    def forecast(self, db: Session, year: int) -> ForecastResult:
        today = date.today()
        current_month = today.month if today.year == year else (13 if today.year > year else 0)

        # Get actual monthly spending per category for the target year.
        actuals = self._get_monthly_actuals(db, year)

        # Get prior year data for seasonal projection.
        prior_year = self._get_monthly_actuals(db, year - 1)

        # Get overall averages per category (all years).
        overall_avgs = self._get_category_averages(db)

        # Get trend adjustments.
        trends = self._get_trend_factors(db, year)

        # Get subscriptions for known recurring amounts.
        subscriptions = self._get_subscription_monthly(db)

        months = []
        annual_total = 0.0

        for month in range(1, 13):
            if month < current_month:
                # Past month: use actual data.
                line_items = self._actual_line_items(actuals, month)
                total = sum(li.amount for li in line_items)
                status = "actual"
            elif month == current_month:
                # Current month: actual to date + projected remainder.
                line_items = self._partial_month_items(
                    db, year, month, today.day, actuals, prior_year, overall_avgs, subscriptions
                )
                total = sum(li.amount for li in line_items)
                status = "partial"
            else:
                # Future month: project.
                line_items = self._project_month(
                    month, prior_year, overall_avgs, trends, subscriptions
                )
                total = sum(li.amount for li in line_items)
                status = "projected"

            months.append(MonthForecast(
                month=month,
                status=status,
                total=round(total, 2),
                line_items=line_items,
            ))
            annual_total += total

        return ForecastResult(
            year=year,
            method=self.name,
            months=months,
            annual_total=round(annual_total, 2),
        )

    def _get_monthly_actuals(
        self, db: Session, year: int
    ) -> dict[int, dict[int | None, float]]:
        """Returns {month: {category_id: abs(total)}} for a year."""
        rows = (
            db.query(Transaction)
            .filter(
                Transaction.is_transfer.is_(False),
                Transaction.amount < 0,
                extract("year", Transaction.date) == year,
            )
            .join(Category, Transaction.category_id == Category.id, isouter=True)
            .with_entities(
                extract("month", Transaction.date).label("mo"),
                Transaction.category_id,
                func.coalesce(Category.name, "Uncategorized").label("category_name"),
                func.sum(Transaction.amount).label("total"),
            )
            .group_by(
                extract("month", Transaction.date),
                Transaction.category_id,
            )
            .all()
        )

        result: dict[int, dict[int | None, float]] = defaultdict(dict)
        for row in rows:
            result[int(row.mo)][row.category_id] = abs(row.total)

        return result

    def _get_category_averages(self, db: Session) -> dict[int | None, tuple[str, float]]:
        """Returns {category_id: (category_name, monthly_avg)} across all data."""
        rows = (
            db.query(Transaction)
            .filter(
                Transaction.is_transfer.is_(False),
                Transaction.amount < 0,
            )
            .join(Category, Transaction.category_id == Category.id, isouter=True)
            .with_entities(
                Transaction.category_id,
                func.coalesce(Category.name, "Uncategorized").label("category_name"),
                extract("year", Transaction.date).label("yr"),
                extract("month", Transaction.date).label("mo"),
                func.sum(Transaction.amount).label("total"),
            )
            .group_by(
                Transaction.category_id,
                extract("year", Transaction.date),
                extract("month", Transaction.date),
            )
            .all()
        )

        # Group by category, then average across months.
        cat_months: dict[int | None, list[tuple[str, float]]] = defaultdict(list)
        for row in rows:
            cat_months[row.category_id].append((row.category_name, abs(row.total)))

        averages = {}
        for cat_id, entries in cat_months.items():
            name = entries[0][0]
            amounts = [e[1] for e in entries]
            averages[cat_id] = (name, statistics.mean(amounts))

        return averages

    def _get_trend_factors(self, db: Session, year: int) -> dict[int | None, float]:
        """Returns {category_id: trend_factor} where factor > 1 means increasing.

        Compares the most recent 6 months average to overall average.
        """
        # This is a simplified trend: ratio of recent avg to overall avg.
        overall = self._get_category_averages(db)

        # Get the 6 most recent months of data.
        recent_rows = (
            db.query(Transaction)
            .filter(
                Transaction.is_transfer.is_(False),
                Transaction.amount < 0,
            )
            .join(Category, Transaction.category_id == Category.id, isouter=True)
            .with_entities(
                Transaction.category_id,
                extract("year", Transaction.date).label("yr"),
                extract("month", Transaction.date).label("mo"),
                func.sum(Transaction.amount).label("total"),
            )
            .group_by(
                Transaction.category_id,
                extract("year", Transaction.date),
                extract("month", Transaction.date),
            )
            .order_by(
                extract("year", Transaction.date).desc(),
                extract("month", Transaction.date).desc(),
            )
            .all()
        )

        # Group recent data by category, take last 6 months.
        cat_recent: dict[int | None, list[float]] = defaultdict(list)
        cat_month_count: dict[int | None, int] = defaultdict(int)
        for row in recent_rows:
            if cat_month_count[row.category_id] < 6:
                cat_recent[row.category_id].append(abs(row.total))
                cat_month_count[row.category_id] += 1

        factors = {}
        for cat_id, amounts in cat_recent.items():
            if cat_id in overall and overall[cat_id][1] > 0 and len(amounts) >= 3:
                recent_avg = statistics.mean(amounts)
                factors[cat_id] = recent_avg / overall[cat_id][1]
            else:
                factors[cat_id] = 1.0

        return factors

    def _get_subscription_monthly(self, db: Session) -> dict[int | None, float]:
        """Returns {category_id: monthly_equivalent} from active subscriptions."""
        subs = db.query(Subscription).filter(Subscription.is_active.is_(True)).all()

        multipliers = {
            "weekly": 52 / 12,
            "bi-weekly": 26 / 12,
            "monthly": 1,
            "quarterly": 1 / 3,
            "annual": 1 / 12,
        }

        result: dict[int | None, float] = defaultdict(float)
        for sub in subs:
            amt = sub.amount if sub.amount else (
                (sub.amount_min + sub.amount_max) / 2 if sub.amount_min and sub.amount_max else 0
            )
            mult = multipliers.get(sub.frequency, 1)
            result[sub.category_id] += amt * mult

        return result

    def _actual_line_items(
        self,
        actuals: dict[int, dict[int | None, float]],
        month: int,
    ) -> list[ForecastLineItem]:
        """Build line items from actual data for a past month."""
        items = []
        month_data = actuals.get(month, {})
        for cat_id, amount in month_data.items():
            items.append(ForecastLineItem(
                category_id=cat_id,
                category_name="",  # will be filled by caller if needed
                amount=round(amount, 2),
                basis="actual",
            ))
        return items

    def _partial_month_items(
        self,
        db: Session,
        year: int,
        month: int,
        day_of_month: int,
        actuals: dict[int, dict[int | None, float]],
        prior_year: dict[int, dict[int | None, float]],
        overall_avgs: dict[int | None, tuple[str, float]],
        subscriptions: dict[int | None, float],
    ) -> list[ForecastLineItem]:
        """Current month: actual to date + projected remainder."""
        import calendar
        days_in_month = calendar.monthrange(year, month)[1]
        fraction_elapsed = day_of_month / days_in_month
        fraction_remaining = 1 - fraction_elapsed

        items = []
        month_data = actuals.get(month, {})
        all_cat_ids = set(month_data.keys()) | set(overall_avgs.keys())

        for cat_id in all_cat_ids:
            actual_so_far = month_data.get(cat_id, 0.0)

            # Project remainder: use prior year same month or overall average.
            if month in prior_year and cat_id in prior_year[month]:
                full_month_est = prior_year[month][cat_id]
            elif cat_id in overall_avgs:
                full_month_est = overall_avgs[cat_id][1]
            else:
                full_month_est = 0.0

            projected_remainder = full_month_est * fraction_remaining
            total = actual_so_far + projected_remainder

            items.append(ForecastLineItem(
                category_id=cat_id,
                category_name=overall_avgs.get(cat_id, ("Unknown", 0))[0],
                amount=round(total, 2),
                basis="partial",
            ))

        return items

    def _project_month(
        self,
        month: int,
        prior_year: dict[int, dict[int | None, float]],
        overall_avgs: dict[int | None, tuple[str, float]],
        trends: dict[int | None, float],
        subscriptions: dict[int | None, float],
    ) -> list[ForecastLineItem]:
        """Project a future month."""
        items = []
        all_cat_ids = set()

        if month in prior_year:
            all_cat_ids.update(prior_year[month].keys())
        all_cat_ids.update(overall_avgs.keys())

        seen_sub_cats: set[int | None] = set()

        for cat_id in all_cat_ids:
            # Prefer same-month-last-year (seasonal).
            if month in prior_year and cat_id in prior_year[month]:
                base_amount = prior_year[month][cat_id]
                basis = "seasonal"
            elif cat_id in overall_avgs:
                base_amount = overall_avgs[cat_id][1]
                basis = "average"
            else:
                continue

            # Apply trend factor.
            factor = trends.get(cat_id, 1.0)
            adjusted = base_amount * factor

            # If this category has subscription data, use the higher of
            # subscription estimate vs trend-adjusted historical.
            sub_amount = subscriptions.get(cat_id, 0.0)
            if sub_amount > 0:
                adjusted = max(adjusted, sub_amount)
                if sub_amount >= adjusted:
                    basis = "subscription"
                seen_sub_cats.add(cat_id)

            cat_name = overall_avgs.get(cat_id, ("Unknown", 0))[0]
            items.append(ForecastLineItem(
                category_id=cat_id,
                category_name=cat_name,
                amount=round(adjusted, 2),
                basis=basis,
            ))

        # Add subscription categories not covered by historical data.
        for cat_id, sub_amount in subscriptions.items():
            if cat_id not in seen_sub_cats and sub_amount > 0:
                items.append(ForecastLineItem(
                    category_id=cat_id,
                    category_name=overall_avgs.get(cat_id, ("Unknown", 0))[0],
                    amount=round(sub_amount, 2),
                    basis="subscription",
                ))

        return items
