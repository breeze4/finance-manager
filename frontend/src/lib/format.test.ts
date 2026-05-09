import { describe, it, expect } from "vitest";

import { formatCurrency } from "./format";

describe("formatCurrency", () => {
  it("defaults to 0 decimals", () => {
    expect(formatCurrency(1234.56)).toBe("$1,235");
  });

  it("honors explicit decimals: 2", () => {
    expect(formatCurrency(1234.56, 2)).toBe("$1,234.56");
  });

  it("renders zero with no decimals", () => {
    expect(formatCurrency(0)).toBe("$0");
  });

  it("renders negatives with a leading minus and the absolute amount", () => {
    const result = formatCurrency(-50);
    expect(result).toContain("-");
    expect(result).toContain("$50");
  });

  it("renders large values with grouping separators", () => {
    expect(formatCurrency(1_000_000)).toContain("$1,000,000");
  });
});
