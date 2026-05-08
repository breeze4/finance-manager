/**
 * Top movers table for the Overview pace dashboard.
 *
 * Ranks the per-category pace rows from `MonthlyPaceResponse.categories[]`
 * by absolute variance from the expected MTD spend, descending. Renders
 * the top 10 (or fewer if not enough rows have non-zero variance).
 *
 * Pure presentation component — no query, no endpoint. It iterates the
 * flat `categories[]` list (which already excludes pre-tax categories
 * server-side and includes the synthetic Uncategorized row when relevant),
 * sorts and slices client-side, and renders a small table styled to
 * match the subscriptions-page tables.
 *
 * Step 5 will wire range-aware variance, but the visual contract here
 * (sort key, slice size) is deliberately frozen at v1 per the spec's
 * resolved decisions.
 */
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { CategoryPaceRow, CspBucket } from "@/api/overview";

const BUCKET_LABEL: Record<CspBucket, string> = {
  fixed: "Fixed",
  investments: "Investments",
  savings: "Savings",
  guilt_free: "Guilt-Free",
};

const TOP_N = 10;

interface TopMoversTableProps {
  categories: CategoryPaceRow[];
}

interface RankedRow extends CategoryPaceRow {
  variance: number;
  absVariance: number;
}

function rankRows(categories: CategoryPaceRow[]): RankedRow[] {
  const ranked: RankedRow[] = categories.map((c) => {
    const variance = c.actual_mtd - c.expected_mtd;
    return { ...c, variance, absVariance: Math.abs(variance) };
  });
  ranked.sort((a, b) => {
    if (b.absVariance !== a.absVariance) return b.absVariance - a.absVariance;
    // Stable tiebreaker so deterministic ordering for tests.
    return a.category_name.localeCompare(b.category_name);
  });
  return ranked.filter((r) => r.absVariance > 0).slice(0, TOP_N);
}

function bucketBadge(bucket: CspBucket | null) {
  if (bucket === null) {
    return (
      <Badge variant="outline" className="text-xs font-normal">
        Uncategorized
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-xs font-normal">
      {BUCKET_LABEL[bucket]}
    </Badge>
  );
}

function formatSignedCurrency(amount: number): string {
  // formatCurrency already prepends "-" for negatives; we only need to
  // add an explicit "+" for positives to make the direction unambiguous.
  if (amount > 0) return `+${formatCurrency(amount)}`;
  return formatCurrency(amount);
}

export function TopMoversTable({ categories }: TopMoversTableProps) {
  const rows = useMemo(() => rankRows(categories), [categories]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top movers</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No variance from expected this month.
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary/50 border-b border-border">
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">
                    Category
                  </th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">
                    Bucket
                  </th>
                  <th className="p-3 text-right text-xs font-medium text-muted-foreground uppercase">
                    Actual MTD
                  </th>
                  <th className="p-3 text-right text-xs font-medium text-muted-foreground uppercase">
                    Expected MTD
                  </th>
                  <th className="p-3 text-right text-xs font-medium text-muted-foreground uppercase">
                    Variance
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const overPace = r.variance > 0;
                  return (
                    <tr
                      key={r.category_id ?? `uncategorized:${r.category_name}`}
                      className={`border-b border-border last:border-b-0 ${
                        i % 2 === 0 ? "bg-card" : "bg-card/50"
                      }`}
                    >
                      <td className="p-3 font-medium">{r.category_name}</td>
                      <td className="p-3">{bucketBadge(r.bucket)}</td>
                      <td className="p-3 text-right font-mono">
                        {formatCurrency(r.actual_mtd)}
                      </td>
                      <td className="p-3 text-right font-mono text-muted-foreground">
                        {formatCurrency(r.expected_mtd)}
                      </td>
                      <td
                        className={`p-3 text-right font-mono font-medium ${
                          overPace ? "text-destructive" : "text-success"
                        }`}
                      >
                        {formatSignedCurrency(r.variance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
