/**
 * Date helpers shared across the Budget tabs.
 *
 * Pure functions plus three module-scope constants (`today`, `currentYear`,
 * `currentMonthKey`) computed at import time. The Budget tabs read these
 * directly — they're not parameters because the page is intrinsically
 * "today"-anchored. No tests mock `Date`; if that changes, switch to
 * function form.
 */

export const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export const today = new Date();
export const currentYear = today.getFullYear();
export const currentMonthKey = `${currentYear}-${String(today.getMonth() + 1).padStart(2, "0")}`;

export function monthKey(year: number, monthIdx1: number): string {
  return `${year}-${String(monthIdx1).padStart(2, "0")}`;
}

export function shortMonth(m: string): string {
  return MONTH_NAMES[parseInt(m.split("-")[1], 10) - 1];
}

export function monthLabel(m: string): string {
  const [y, mo] = m.split("-");
  return `${MONTH_NAMES[parseInt(mo, 10) - 1]} ${y}`;
}

export function allMonthsForYear(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => monthKey(year, i + 1));
}

/** All "YYYY-MM" keys for `year` from January through the current month
 * (inclusive), trimmed to the queried year. For past years, returns the full
 * twelve months. */
export function pastAndCurrentMonthsForYear(year: number): string[] {
  if (year < currentYear) return allMonthsForYear(year);
  if (year > currentYear) return [];
  return Array.from({ length: today.getMonth() + 1 }, (_, i) =>
    monthKey(year, i + 1),
  );
}
