import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MathTooltip } from "../MathTooltip";

// Force desktop (HoverCard) by default. Tests below override for mobile.
function setMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false
    })
  });
}

describe("MathTooltip", () => {
  beforeEach(() => {
    setMatchMedia(false); // desktop
  });

  it("renders trigger content", () => {
    render(
      <MathTooltip formula="FV = PV × (1 + r)" values={{ pv: 1000 }}>
        <span>tooltip target</span>
      </MathTooltip>
    );
    expect(screen.getByText("tooltip target")).toBeInTheDocument();
  });

  it("substitutes formula placeholders with formatted values", async () => {
    const user = userEvent.setup();
    render(
      <MathTooltip
        title="Future Value"
        formula="FV = {principalAmount} × (1 + r)<sup>{years}</sup>"
        values={{ principalAmount: 50000, years: 35 }}
      >
        <span>hover me</span>
      </MathTooltip>
    );

    const trigger = screen.getByText("hover me");
    await user.hover(trigger);

    // Wait for HoverCard content; formula substitution renders via dangerouslySetInnerHTML
    await waitFor(() => {
      // $50,000 substituted; 35 stays as integer in superscript
      expect(screen.getByText(/Future Value/)).toBeInTheDocument();
    });

    // The substituted markup contains $50,000 and the years 35
    const popoverHtml = document.body.innerHTML;
    expect(popoverHtml).toContain("$50,000");
    expect(popoverHtml).toContain("35");
  });

  it("renders calculation steps as ordered list", async () => {
    const user = userEvent.setup();
    render(
      <MathTooltip
        title="Steps"
        calculation={["Step 1: {a}", "Step 2: {b}"]}
        values={{ a: 1, b: 2 }}
      >
        <span>hover me</span>
      </MathTooltip>
    );
    await user.hover(screen.getByText("hover me"));
    await waitFor(() => {
      expect(screen.getByText(/Step 1/)).toBeInTheDocument();
      expect(screen.getByText(/Step 2/)).toBeInTheDocument();
    });
  });

  it("renders explanation text", async () => {
    const user = userEvent.setup();
    render(
      <MathTooltip explanation="This formula compounds interest annually">
        <span>hover me</span>
      </MathTooltip>
    );
    await user.hover(screen.getByText("hover me"));
    await waitFor(() => {
      expect(screen.getByText(/compounds interest annually/)).toBeInTheDocument();
    });
  });

  it("does not render card content when disabled", async () => {
    render(
      <MathTooltip disabled title="Should not show" formula="x = y">
        <span>plain text</span>
      </MathTooltip>
    );
    expect(screen.getByText("plain text")).toBeInTheDocument();
    expect(screen.queryByText("Should not show")).not.toBeInTheDocument();
  });

  it("opens a Dialog on mobile (tap-to-open)", async () => {
    setMatchMedia(true); // mobile
    const user = userEvent.setup();
    render(
      <MathTooltip title="Mobile dialog" formula="x = y" values={{}}>
        <span>tap me</span>
      </MathTooltip>
    );

    await user.click(screen.getByText("tap me"));
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Mobile dialog")).toBeInTheDocument();
    });
  });
});
