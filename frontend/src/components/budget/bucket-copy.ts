/**
 * Static copy for the four CSP buckets — labels, descriptions, and the
 * Ramit-range header line — shared across Set Budget and Actual vs Budget.
 *
 * No React imports; pure data + one string formatter.
 */
import type { CspBucket } from "@/api/categories";
import type { BucketRollup } from "@/api/csp";

export const BUCKET_LABEL: Record<CspBucket, string> = {
  fixed: "Fixed Costs",
  investments: "Investments",
  savings: "Savings",
  guilt_free: "Guilt-Free Spending",
};

export const BUCKET_DESCRIPTION: Record<CspBucket, string> = {
  fixed: "Rent, utilities, groceries — predictable monthly costs.",
  investments: "401(k), IRA, brokerage — pay your future first.",
  savings: "Emergency fund, gifts, big purchases.",
  guilt_free: "Dining, entertainment, hobbies — spend without guilt.",
};

export function bucketRangeLabel(b: BucketRollup): string {
  if (b.ramit_max == null) return `Range: ≥${b.ramit_min}%`;
  return `Range: ${b.ramit_min}–${b.ramit_max}%`;
}
