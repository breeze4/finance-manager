/**
 * Overview dashboard — execution-monitoring view.
 *
 * The page subscribes to a URL-persisted range picker (`useOverviewRange`)
 * and pipes the resulting `[date_from, date_to]` into all four queries:
 *   - paceQ        — `/api/stats/monthly-pace` (mode discriminator)
 *   - trendQ       — `/api/stats/spending-trend`
 *   - remainingQ   — `/api/subscriptions/remaining` (returns 204 outside
 *                     current MTD; the card is hidden in that case)
 *   - recent-txns  — `/api/transactions` (filtered to the range)
 *
 * Section order (top to bottom):
 *   1. RangePicker
 *   2. PaceHeadline (mode-aware copy)
 *   3. BucketCard grid (4 buckets in canonical order; mode-aware visual)
 *   4. SpendingTrendChart
 *   5. RecurringRemainingCard (hidden when remainingQ.data is undefined
 *      AND not loading — i.e. when the server returned 204)
 *   6. TopMoversTable
 *   7. RecentTransactionsList (filtered to range)
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { getMonthlyPace, getSpendingTrend, type CspBucket } from "@/api/overview";
import { getRemainingSubscriptions } from "@/api/subscriptions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PaceHeadline } from "@/components/overview/PaceHeadline";
import { BucketCard } from "@/components/overview/BucketCard";
import { SpendingTrendChart } from "@/components/overview/SpendingTrendChart";
import { RecurringRemainingCard } from "@/components/overview/RecurringRemainingCard";
import { TopMoversTable } from "@/components/overview/TopMoversTable";
import { RecentTransactionsList } from "@/components/overview/RecentTransactionsList";
import { RangePicker } from "@/components/overview/RangePicker";
import { useOverviewRange } from "@/hooks/useOverviewRange";

const BUCKET_ORDER: CspBucket[] = ["fixed", "investments", "savings", "guilt_free"];
const TREND_MONTH_COUNT = 6;

function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function trailingCalendarMonthsRange(anchorIso: string, monthCount: number) {
  const anchor = parseIsoDate(anchorIso);
  const start = new Date(anchor.getFullYear(), anchor.getMonth() - monthCount + 1, 1);
  return {
    dateFrom: toIsoDate(start),
    dateTo: anchorIso,
    currentMonth: `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, "0")}`,
  };
}

export default function Overview() {
  const navigate = useNavigate();
  const { range, setRange, presets } = useOverviewRange();
  const dateFrom = range.date_from;
  const dateTo = range.date_to;
  const trendRange = trailingCalendarMonthsRange(dateTo, TREND_MONTH_COUNT);
  const selectedMonth = dateTo.slice(0, 7);

  const paceQ = useQuery({
    queryKey: ["overview", "monthly-pace", { dateFrom, dateTo }],
    queryFn: () => getMonthlyPace({ dateFrom, dateTo }),
  });

  const trendQ = useQuery({
    queryKey: [
      "overview",
      "spending-trend",
      { dateFrom: trendRange.dateFrom, dateTo: trendRange.dateTo },
    ],
    queryFn: () =>
      getSpendingTrend({
        dateFrom: trendRange.dateFrom,
        dateTo: trendRange.dateTo,
      }),
  });

  const remainingQ = useQuery({
    queryKey: ["overview", "subs-remaining", { dateFrom, dateTo }],
    queryFn: () => getRemainingSubscriptions({ dateFrom, dateTo }),
  });

  const [bucketsExpanded, setBucketsExpanded] = useState(true);
  const toggleBuckets = () => setBucketsExpanded((expanded) => !expanded);
  const openBudgetDrilldown = (categoryId: number) => {
    navigate(`/budget/actual?month=${encodeURIComponent(selectedMonth)}&category=${categoryId}`);
  };

  // Endpoint returns 204 for ranges that aren't the in-progress current
  // month; the client coerces that to `null`. Hide the card when null.
  const showRemaining = remainingQ.isLoading || remainingQ.data != null;

  return (
    <div className="space-y-6">
      <RangePicker range={range} setRange={setRange} presets={presets} />
      {paceQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : paceQ.error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load overview:{" "}
          {paceQ.error instanceof Error ? paceQ.error.message : String(paceQ.error)}
        </div>
      ) : !paceQ.data ? null : (
        <>
          <PaceHeadline headline={paceQ.data.headline} mode={paceQ.data.mode} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {BUCKET_ORDER.map((name) => {
              const bucket = paceQ.data!.buckets.find((b) => b.bucket === name);
              if (!bucket) return null;
              return (
                <BucketCard
                  key={bucket.bucket}
                  bucket={bucket}
                  expanded={bucketsExpanded}
                  onToggle={toggleBuckets}
                  onCategoryClick={openBudgetDrilldown}
                  mode={paceQ.data!.mode}
                />
              );
            })}
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Spending Trend</CardTitle>
              <p className="text-sm text-muted-foreground">
                Last {TREND_MONTH_COUNT} months. Current month compares spending so far
                against the full-month budget.
              </p>
            </CardHeader>
            <CardContent>
              <SpendingTrendChart
                data={trendQ.data?.months ?? []}
                loading={trendQ.isLoading}
                currentMonth={trendRange.currentMonth}
              />
            </CardContent>
          </Card>
          {showRemaining && (
            <RecurringRemainingCard
              total={remainingQ.data?.total ?? 0}
              count={remainingQ.data?.count ?? 0}
              loading={remainingQ.isLoading}
            />
          )}
          <TopMoversTable categories={paceQ.data.categories} />
          <RecentTransactionsList dateFrom={dateFrom} dateTo={dateTo} />
        </>
      )}
    </div>
  );
}
