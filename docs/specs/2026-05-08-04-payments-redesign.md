# Payments Page Redesign

## Problem Statement

Today's Payments page leans on a checking↔CC matching algorithm that misses most of the activity. Matched payments come from a derived `payment_match` table, with an "unmatched candidates" table cobbled together client-side from BECU descriptions containing "CHASE CREDIT CRD". The user can't see the full picture of credit card pay-down because matching is fragile and the page is structured around the *match*, not around the *payments themselves*. There's also no temporal view — no chart of charges vs. pay-down over time, which is the actual question the user wants answered.

## Solution

Make the credit-card account the single source of truth for payment activity. Every positive-amount transaction on an account of type `credit_card` is treated as money flowing back into the card (payment, refund, credit — bundled together). Drop the matching infrastructure entirely; the user manually classifies the corresponding checking-side debits as transfers via the existing classification UI.

The page becomes a chart + a list:
- Side-by-side bar chart by period: total charges vs. total positive activity, per period (month / quarter / year, auto-grouped from the active global date range)
- List of every positive-amount CC transaction in the active range — date, account, vendor, amount

A page-level account selector defaults to "All CCs" and lets the user drill into a single card.

## User Stories

1. As a single-user finance-app owner, I want to see every credit-card payment on one page, so that the count and total reflect reality instead of just the subset that happened to match a checking debit.
2. As a user, I want a charges-vs-payments bar chart, so that I can see at a glance whether I paid off as much as I charged in any given month/quarter/year.
3. As a user, I want the chart's bar grouping (monthly vs. quarterly vs. yearly) to follow the global date range picker, so that I don't have to fiddle with a second control.
4. As a user with multiple credit cards, I want a single "All CCs" view by default and an account selector to drill into one card, so that I can answer both "am I paying off all my cards" and "what's happening on this one card."
5. As a user, I want returns/refunds bundled with payments rather than tracked separately, so that the chart and list aren't fragmented by a distinction I don't care about.
6. As a user, I want the existing `is_transfer=true` flags on already-matched payments to stay flagged, so that historical spending stats don't suddenly inflate when matching is removed.
7. As a user, I want to manually mark new checking-side CC payments as transfers (or assign them to the Transfers category) using the existing transactions UI, so that they don't pollute spending stats — without needing the Payments page to do it for me.

## Data Flow

1. **Backend list endpoint** (`/api/payments`, redefined): given an optional account filter and a date range, returns every transaction where the joined account has `type = 'credit_card'` and `amount > 0`. Sorted by date descending.
2. **Backend series endpoint** (`/api/payments/series`): given an account filter, date range, and a derived bucket size (`month` | `quarter` | `year`), returns per-bucket totals: `charges_total` (sum of negatives' absolute value) and `payments_total` (sum of positives) across credit_card accounts.
3. **Bucket size derivation**: a small pure function maps active range span → bucket size. Range ≤ ~12 months → `month`; ~13 months to ~4 years → `quarter`; ≥ ~5 years → `year`. Implemented backend-side; frontend just consumes the bucket size returned with the series.
4. **Frontend page** reads the global date range picker and the page-level account selector, calls both endpoints, renders the chart on top and the list below.

## Behavior

- **Source of truth**: a transaction is a "CC payment" iff `accounts.type = 'credit_card'` AND `amount > 0`. No reliance on parser-specific `type` columns. Returns and refunds count.
- **List**: paginated or scrolled; shows date, account, vendor, amount. Date desc.
- **Chart**: two bars per bucket, side-by-side. X-axis = bucket label; Y-axis = magnitude in dollars. Charges bar shows sum of negatives' absolute value; payments bar shows sum of positives.
- **Empty buckets**: rendered as zero-height bars (don't skip empty months — keeps the time axis continuous).
- **Account selector**: default "All CCs" aggregates across all `credit_card` accounts. Selecting a specific account scopes both chart and list.
- **Date range**: page consumes the global date range picker. No page-local range control.
- **Existing data**: `payment_match` table is dropped via migration. `is_transfer = true` flags on transactions are preserved as-is — already-matched legacy payments stay hidden from spending views, but no longer have a corresponding match row.
- **Auto-matcher**: removed from import pipeline. New imports do not auto-set `is_transfer` on checking-side CC payments; user classifies manually.
- **Currency precision**: chart axes/tooltips and list amounts render at 0 decimals (per the currency-display spec). The Transactions list elsewhere keeps 2 decimals; this page does not.

## Modules

- **Payments service** (backend): defines the contract for the two endpoints. Pure aggregation over the transactions table joined to accounts. Deep module: simple interface (account_id?, range, bucket-size?), encapsulates SQL.
  - Role: **defines** the Payments API shape.
  - Test: yes — boundary tests over a seeded transactions/accounts fixture.
- **Bucket-size deriver** (backend): pure function, range span → `month|quarter|year`. Trivial in-process module.
  - Role: internal helper to the Payments service.
  - Test: yes — table-driven unit tests across the breakpoints.
- **Payments router** (backend): thin HTTP layer for the two endpoints.
  - Role: **defines** the wire shape.
  - Test: minimal — service is where logic lives.
- **Charges-vs-payments chart** (frontend): reusable Recharts grouped-bar component. Inputs: array of `{bucket_label, charges, payments}` plus the bucket size for axis formatting.
  - Role: **consumes** the series endpoint shape.
  - Test: no — visual.
- **Payments page** (frontend): hosts the global-range-aware data fetches, account selector, chart, list.
  - Role: **consumes** both endpoints.
  - Test: no — visual + integration.
- **Migration** (backend): drop `payment_match` table; delete payment-match model; delete matcher service and detect endpoint.
  - Role: schema change.
  - Test: alembic up/down round-trip.

## Resolved Decisions

- **CC payment definition**: any positive-amount transaction on a `credit_card` account, parser-agnostic — chosen over Chase-specific `Type='Payment'` filtering for forward compatibility with new card parsers.
- **Returns/refunds handled with payments**: bundled into the same bucket — chosen over separate tracking because the user thinks of any positive flow on the card as "money back," and separating refunds adds noise without insight.
- **Chart shape**: side-by-side two-bar (charges vs. payments) — chosen over diverging stacks, three-series variants, or a running-balance line overlay. Simplest answer to the user's actual question.
- **Bucket grouping**: auto-derived from the global date range, not user-controlled — chosen over a separate per-page lookback control to avoid a redundant filter UI.
- **Account scoping**: page-level account selector with "All CCs" default — chosen over per-account stacked bars or separate sections per card. One chart, one list, one filter.
- **Drop matching infrastructure**: matcher code, `payment_match` table, detect endpoint all removed — chosen over keeping them dormant. Single-user app, less code to carry.
- **Existing `is_transfer` flags preserved**: don't reset previously-matched transactions — chosen to avoid retroactively breaking spending stats for already-categorized history.

## Testing Decisions

- Payments service: boundary tests with a seeded fixture covering: single-CC account, multi-CC accounts, date range edges, negative-only buckets, positive-only buckets, mixed.
- Bucket-size deriver: pure unit tests at each breakpoint.
- Migration: alembic up + down round-trips against the test DB; assert no `payment_match` references remain in code.
- Frontend verification: agent-browser smoke check that chart renders for a 12-month and a 5-year range with the expected bar grouping. No automated component tests.

## Out of Scope

- Manual one-click "mark as transfer" affordance on the Payments page itself — user uses the existing Transactions classification UI.
- Cross-checking-account validation (catching a CC payment that came from an untracked checking account).
- A running CC balance line overlay on the chart (would require balance snapshots; deferred).
- Support for reactivating matching infrastructure later. If reintroduced, it's a new spec.
- Backend-side surfacing of "unmatched candidates" — gone.
