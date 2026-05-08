/**
 * useOverviewRange — URL-persisted range picker state for the Overview page.
 *
 * The picker writes its selection to the URL so reloading or sharing the
 * URL restores the view. URL contract (Step 5 spec, Resolved Decisions →
 * "Picker state persistence"):
 *
 *   ?range=current-mtd     // any of the six preset keys
 *   ?range=last-30-days
 *   ?range=3-months
 *   ?range=ytd
 *   ?range=1-year
 *   ?range=last-year
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD   // custom
 *   (bare URL)             // defaults to current-mtd
 *
 * Preset → range mapping (verbatim from the spec):
 *   current-mtd   → [first-of-current-month, today]            pace mode
 *   last-30-days  → [today − 30 days, today]                   actual_vs_budget
 *   3-months      → [today − 3 calendar months, today]         actual_vs_budget
 *   ytd           → [Jan 1 of current year, today]             actual_vs_budget
 *   1-year        → [today − 1 calendar year, today]           actual_vs_budget
 *   last-year     → [Jan 1 prior year, Dec 31 prior year]      actual_vs_budget
 *   custom        → user-supplied                              mode discriminator runs server-side
 *
 * Mode is decided server-side by ``pace_service``: pace iff
 * ``date_from == first-of-current-month AND date_to >= today``. The hook
 * just emits ranges; the API decides the mode.
 *
 * On initial mount with a bare URL we DO NOT write the URL — we want
 * deep-linkable shares to round-trip without history pollution. The URL
 * is only written when the user explicitly changes the picker.
 */

import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

export type RangePresetKey =
  | "current-mtd"
  | "last-30-days"
  | "3-months"
  | "ytd"
  | "1-year"
  | "last-year"
  | "custom";

export interface RangeState {
  preset: RangePresetKey;
  date_from: string; // YYYY-MM-DD
  date_to: string; // YYYY-MM-DD
}

export interface RangePresetDescriptor {
  key: RangePresetKey;
  label: string;
}

/**
 * Preset descriptors for the dropdown. Order matches the dropdown order.
 * "custom" is included so the dropdown can show a "Custom" option that
 * surfaces the date inputs.
 */
export const PRESETS: RangePresetDescriptor[] = [
  { key: "current-mtd", label: "Current month to date" },
  { key: "last-30-days", label: "Last 30 days" },
  { key: "3-months", label: "Last 3 months" },
  { key: "ytd", label: "Year to date" },
  { key: "1-year", label: "Last 1 year" },
  { key: "last-year", label: "Last year" },
  { key: "custom", label: "Custom" },
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function lastDayOfMonth(year: number, month0: number): number {
  // month0 is 0-indexed (JS convention). Day 0 of next month = last day.
  return new Date(year, month0 + 1, 0).getDate();
}

/**
 * Resolve a preset key to its concrete date range against the supplied
 * "today" anchor. Custom is intentionally NOT resolvable — callers handle
 * it separately (the user supplies the dates).
 */
export function resolvePresetRange(
  key: Exclude<RangePresetKey, "custom">,
  today: Date,
): { date_from: string; date_to: string } {
  const todayIso = isoDate(today);
  const y = today.getFullYear();
  const m = today.getMonth(); // 0-indexed

  switch (key) {
    case "current-mtd": {
      const start = new Date(y, m, 1);
      return { date_from: isoDate(start), date_to: todayIso };
    }
    case "last-30-days": {
      const start = new Date(today);
      start.setDate(start.getDate() - 30);
      return { date_from: isoDate(start), date_to: todayIso };
    }
    case "3-months": {
      // Subtract 3 calendar months. Snap day to last-day-of-month if the
      // target month has fewer days than today's day.
      const targetMonth = m - 3;
      const targetYear = y + Math.floor(targetMonth / 12);
      const normalizedMonth = ((targetMonth % 12) + 12) % 12;
      const day = Math.min(today.getDate(), lastDayOfMonth(targetYear, normalizedMonth));
      const start = new Date(targetYear, normalizedMonth, day);
      return { date_from: isoDate(start), date_to: todayIso };
    }
    case "ytd": {
      const start = new Date(y, 0, 1);
      return { date_from: isoDate(start), date_to: todayIso };
    }
    case "1-year": {
      // Subtract 1 calendar year. Handle Feb 29 → Feb 28 of non-leap year.
      const day = Math.min(today.getDate(), lastDayOfMonth(y - 1, m));
      const start = new Date(y - 1, m, day);
      return { date_from: isoDate(start), date_to: todayIso };
    }
    case "last-year": {
      const start = new Date(y - 1, 0, 1);
      const end = new Date(y - 1, 11, 31);
      return { date_from: isoDate(start), date_to: isoDate(end) };
    }
  }
}

const PRESET_KEYS: ReadonlySet<string> = new Set(
  PRESETS.map((p) => p.key).filter((k) => k !== "custom"),
);

function isValidPresetKey(s: string | null): s is Exclude<RangePresetKey, "custom"> {
  return s !== null && PRESET_KEYS.has(s);
}

function isIsoDate(s: string | null): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/**
 * Read the current range from the URL query string.
 *
 * Resolution order:
 *   1. ?range=<preset-key> — look up + resolve to concrete dates
 *   2. ?from=YYYY-MM-DD&to=YYYY-MM-DD — custom range
 *   3. (bare URL) — default to current-mtd
 */
function readRangeFromParams(
  params: URLSearchParams,
  today: Date,
): RangeState {
  const range = params.get("range");
  if (isValidPresetKey(range)) {
    const { date_from, date_to } = resolvePresetRange(range, today);
    return { preset: range, date_from, date_to };
  }

  const from = params.get("from");
  const to = params.get("to");
  if (isIsoDate(from) && isIsoDate(to)) {
    return { preset: "custom", date_from: from, date_to: to };
  }

  // Default: current MTD.
  const { date_from, date_to } = resolvePresetRange("current-mtd", today);
  return { preset: "current-mtd", date_from, date_to };
}

export interface UseOverviewRangeResult {
  range: RangeState;
  setRange: (
    key: RangePresetKey,
    custom?: { date_from: string; date_to: string },
  ) => void;
  presets: RangePresetDescriptor[];
}

/**
 * Hook surface — the picker reads `range`, calls `setRange` on user
 * change. `presets` is the dropdown options (in display order).
 */
export function useOverviewRange(): UseOverviewRangeResult {
  const [searchParams, setSearchParams] = useSearchParams();

  const range = useMemo(() => {
    // `today` is computed on each render (read-side); for tests this is
    // fine because the URL-driven path doesn't depend on Date for any
    // preset other than current-mtd (whose tests pin a deterministic
    // date_from string in the URL).
    return readRangeFromParams(searchParams, new Date());
  }, [searchParams]);

  const setRange = useCallback(
    (
      key: RangePresetKey,
      custom?: { date_from: string; date_to: string },
    ) => {
      const next = new URLSearchParams(searchParams);
      // Clear all keys we own so we never have both `range` and
      // `from`/`to` in the URL at once.
      next.delete("range");
      next.delete("from");
      next.delete("to");

      if (key === "custom") {
        if (custom?.date_from) next.set("from", custom.date_from);
        if (custom?.date_to) next.set("to", custom.date_to);
      } else {
        next.set("range", key);
      }
      setSearchParams(next);
    },
    [searchParams, setSearchParams],
  );

  return { range, setRange, presets: PRESETS };
}
