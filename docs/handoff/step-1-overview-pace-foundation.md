# Step 1 — Overview pace foundation

End-to-end tracer-bullet for the Overview redesign. This step adds:

- a backend `pace_service` that computes per-category and per-bucket pace
  for the in-progress current month
- a `subscription_due_service` helper module (already-hit + remaining-due)
- a new `GET /api/stats/monthly-pace` endpoint
- a rewritten Overview page with a single query, the on-track headline,
  and four CSP bucket cards with inline accordion drill-down.

## 1. Files created / modified

### Created
- `backend/app/services/pace_service.py` — pace math; public entry point
  `compute_monthly_pace(db, date_from, date_to)`. Uses
  `subscription_due_service`, `category_filters`, and Budget overrides.
- `backend/app/services/subscription_due_service.py` — two helpers:
  `subscriptions_already_hit(db, year_month)` and
  `subscriptions_remaining(db, date_from, date_to)`.
- `backend/tests/test_pace_service.py` — 16 unit tests covering the
  acceptance criteria.
- `backend/tests/test_subscription_due_service.py` — 19 unit tests
  covering match-window edges, all five frequencies, and remaining-due
  semantics.
- `frontend/src/api/overview.ts` — typed client; exports
  `getMonthlyPace`, plus types `MonthlyPaceResponse`, `BucketPaceRollup`,
  `CategoryPaceRow`, `PaceHeadline`, `CspBucket`, `PaceMode`.
- `frontend/src/components/overview/PaceHeadline.tsx` — top-of-page
  headline with the spec's verbatim copy.
- `frontend/src/components/overview/BucketCard.tsx` — bucket card with
  inline accordion drill-down to per-category rows.

### Modified
- `backend/app/schemas/stats.py` — added `MonthlyPaceResponse`,
  `BucketPaceRollup`, `CategoryPaceRow`, `PaceHeadline`. Existing
  `SummaryResponse` / `MonthlyStatsResponse` untouched.
- `backend/app/routers/stats_router.py` — added `GET /api/stats/monthly-pace`.
  Existing `/summary` and `/monthly` untouched.
- `backend/tests/test_stats_api.py` — added `TestMonthlyPaceEndpoint`
  class with 7 integration tests (200, 400 cases, transfer + pre-tax
  exclusion, uncategorized synthetic row, headline math).
- `frontend/src/pages/Overview.tsx` — rewritten end-to-end. Old three
  queries dropped; single pace query drives the page.

## 2. Authoritative `MonthlyPaceResponse` shape (as emitted)

```python
class CategoryPaceRow(BaseModel):
    category_id: int | None
    category_name: str
    bucket: str | None
    actual_mtd: float
    expected_mtd: float
    full_budget: float

class BucketPaceRollup(BaseModel):
    bucket: str
    actual: float
    expected: float
    budget: float
    categories: list[CategoryPaceRow]

class PaceHeadline(BaseModel):
    actual_total: float
    expected_total: float
    variance: float

class MonthlyPaceResponse(BaseModel):
    mode: Literal["pace", "actual_vs_budget"]
    headline: PaceHeadline
    buckets: list[BucketPaceRollup]
    categories: list[CategoryPaceRow]
    date_from: date
    date_to: date
```

The synthetic Uncategorized row appears in `categories[]` only when
non-transfer transactions with `category_id IS NULL` exist in the
range. It has `category_id=None`, `category_name="Uncategorized"`,
`bucket=None`, `full_budget=0.00`, `expected_mtd=0.00`, and
`actual_mtd = sum of those transactions' absolute values`. It does NOT
appear in any `buckets[].categories[]` and does NOT contribute to bucket
totals (only to the top-level headline `actual_total`).

`buckets` is always length 4 in canonical order: `fixed`, `investments`,
`savings`, `guilt_free`. Empty buckets render with `actual = expected =
budget = 0` and `categories = []`.

`headline.variance` = `actual_total - expected_total`. Sign drives the
copy: variance ≤ 0 → "On pace — $X under expected"; variance > 0 → "Over
pace — $X over expected".

`mode` is always `"pace"` in this slice. Step 5 adds `"actual_vs_budget"`.

## 3. Service signatures

```python
# backend/app/services/pace_service.py
def compute_monthly_pace(
    db: Session, date_from: date, date_to: date
) -> MonthlyPace:
    """Step 1 only accepts [first-of-current-month, today-or-later];
    raises ValueError otherwise. The router converts to a 400."""
```

`MonthlyPace` is a dataclass with the same field names as
`MonthlyPaceResponse` but Decimal money. The router converts to floats
at the wire boundary.

```python
# backend/app/services/subscription_due_service.py
def subscriptions_already_hit(
    db: Session, year_month: int
) -> dict[int, Decimal]:
    """Returns {category_id: hit_amount} for active subs whose expected
    charge has matched a current-month transaction by the ±5%/±7-day
    rule. NULL-category and inactive subs are excluded."""

def subscriptions_remaining(
    db: Session, date_from: date, date_to: date
) -> dict:
    """Returns {"total": Decimal, "count": int, "subscriptions": [...]}
    for active subs whose next-expected-charge falls in [date_from,
    date_to] and has NOT yet been matched. Each subscription record:
    {id, vendor, expected_date, expected_amount, category_id,
    category_name}. Uncategorized subs are INCLUDED (with
    category_name='(uncategorized)'); inactive subs are excluded."""
```

Step 4 will wrap `subscriptions_remaining` in an HTTP endpoint without
changing the helper.

## 4. Endpoint contract

```
GET /api/stats/monthly-pace?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
response_model: MonthlyPaceResponse

200 OK   when date_from = first-of-current-month AND date_to >= today
400      when date_from != first-of-current-month
400      when date_to < today
```

The router checks against wall-clock `date.today()`. Step 5 will widen
the validator and switch `mode` based on the requested range.

## 5. Frontend `api/overview.ts` contract

```typescript
export type CspBucket = "fixed" | "investments" | "savings" | "guilt_free";
export type PaceMode = "pace" | "actual_vs_budget";

export interface CategoryPaceRow {
  category_id: number | null;
  category_name: string;
  bucket: CspBucket | null;
  actual_mtd: number;
  expected_mtd: number;
  full_budget: number;
}
export interface BucketPaceRollup {
  bucket: CspBucket;
  actual: number;
  expected: number;
  budget: number;
  categories: CategoryPaceRow[];
}
export interface PaceHeadline {
  actual_total: number;
  expected_total: number;
  variance: number;
}
export interface MonthlyPaceResponse {
  mode: PaceMode;
  headline: PaceHeadline;
  buckets: BucketPaceRollup[];
  categories: CategoryPaceRow[];
  date_from: string;
  date_to: string;
}

export function getMonthlyPace(args: {
  dateFrom: string; dateTo: string;
}): Promise<MonthlyPaceResponse>;
```

Field names are snake_case to mirror Pydantic exactly (matches
`csp.ts` style). The API client function takes camelCase params for the
caller's convenience, then encodes to snake_case query params.

## 6. Section order in Overview.tsx after this slice

Top-to-bottom:

1. `<PaceHeadline headline={...} />` (full-width card)
2. Four-column `<BucketCard>` grid in canonical order — fixed,
   investments, savings, guilt_free.

Step 2 should append top-movers + recent-txns sections under (2).

## 7. Deviations from the plan

None. Notable in-scope decisions (resolved per the prompt's "If
unclear, stop" rules):

- Inlined the override-or-baseline lookup inside `pace_service` (the
  prompt resolved this — `budget_service` has no standalone helper and
  is must-not-touch). One-line comment in `_effective_budget` notes
  that pace v1 ignores rollover (spec: Out of Scope).
- The category-row inclusion test in `pace_service` keeps a category if
  it has either a budget, actual transactions, or subscription signal —
  categories with nothing going on are dropped to avoid noise. Step 5's
  actual-vs-budget branch may want to revisit this.
- `subscription_due_service.subscriptions_remaining` returns
  `expected_amount` and `total` as `Decimal`. Step 4's HTTP endpoint
  will convert to float at the schema boundary, same convention as the
  pace router does today.

## 8. Things Step 2 / 3 / 4 / 5 will need to know

- **Bucket strings are snake_case**: `"fixed"`, `"investments"`,
  `"savings"`, `"guilt_free"`. These come straight from `CspBucket`
  enum values; same strings the existing `csp.ts` already uses. Step 2
  should reuse the union type from `@/api/overview` (`CspBucket`)
  rather than redefining.
- **Categories appear in BOTH `categories[]` and `buckets[].categories[]`**
  by design. Step 2's top-movers ranking should iterate
  `categories[]` (the flat list, including the synthetic Uncategorized
  row) so it doesn't miss uncategorized variance.
- **Uncategorized synthetic row** has `category_id = null` — Step 2 / 5
  must handle that. It has `bucket = null` and is intentionally NOT in
  any bucket's category list.
- **Pre-tax categories are completely absent** from the pace response.
  Step 5's actual-vs-budget mode must keep this exclusion (the spec
  applies it cross-cutting, not per-mode).
- **`CategoryPaceRow.full_budget`** is the full-month effective budget
  (override-or-baseline). For Step 5's actual-vs-budget mode where the
  range may span multiple months, you'll likely need to extend this
  shape (the field name "full_budget" was deliberately chosen so it
  reads as "monthly" rather than "range total"). One option: keep
  `full_budget` per-row as the monthly figure and add a
  `range_budget` field at the bucket/headline level. Negotiate the
  exact shape when you start Step 5.
- **Pace formula uses `pace_factor = elapsed_days / days_in_month`**
  where `elapsed_days = date_to.day` (inclusive of today). Day 1 →
  factor = 1/days_in_month. Last day → factor = 1.
- **`subscriptions_already_hit` returns the SUBSCRIPTION's expected
  amount (NOT the transaction's amount)** when summing into hits. This
  is intentional and matches the spec — the locked-in portion of
  expected MTD is what the user committed to, not what cleared (which
  may have drifted by ±5%).
- **`subscription_due_service._expected_date_in_month`** is the
  authoritative function for "when does this sub expect to charge in
  month X?". It's marked private but Step 4 may call it directly from
  the HTTP layer (same way `pace_service` does). If you do, lock down
  the contract before relying on it.
- **Frontend route base is `/finance/`** (vite `base` setting). The
  `_client.ts` helper handles this; nothing in Step 1 needs to be
  aware of it.

## 9. Smoke test status

Not run — verified via test gates only (459 backend tests + 286 vitest
+ clean `npm run build`). The bucket card visual treatment mirrors
`Budget.tsx`'s Set Budget bucket cards but is a separate component
(must-not-touch list). Worth a manual eyeballing once Step 2 lands and
the page has more content.
