# Budget Variance Chart - Image Generation Prompts

Three variations of the "Budget vs Actual" diverging bar chart for the finance dashboard.
Use with: `bash ~/.claude/skills/image-gen/scripts/generate-image.sh "<prompt>" "docs/images" "<filename>"`

## Data Reference

All categories are under budget for Feb 2026:
- Groceries: $312 actual / $555 budget = -$243
- Shopping: $98 / $244 = -$146
- Transportation: $87 / $150 = -$63
- Dining: $189 / $250 = -$61
- Entertainment: $52 / $108 = -$56
- Health: $65 / $100 = -$35
- Utilities: $285 / $300 = -$15
- Subscriptions: $113 / $120 = -$7
- Insurance: $156 / $160 = -$4

---

## Variation 1 - Variance-Based Diverging Bar Chart

**Filename:** `budget-variance-diverging.png`

**Prompt:**
Dark-themed finance dashboard chart, 800x500px, background color #0f1729. Title "Budget vs Actual — Feb 2026" in white. A horizontal diverging bar chart with a vertical center divider line. Left side labeled "Under Budget", right side labeled "Over Budget". Each bar's LENGTH represents the VARIANCE amount (not absolute spending). Categories sorted by variance magnitude, largest at top: Groceries (-$243), Shopping (-$146), Transportation (-$63), Dining (-$61), Entertainment (-$56), Health (-$35), Utilities (-$15), Subscriptions (-$7), Insurance (-$4). Category labels on the left side in light gray. Bars are teal/cyan colored (hsl 173, 40%, 35%) for under budget. Right-aligned dollar amounts showing actual / budget / variance. Subtle muted grid lines. Clean, minimal, modern data visualization style. No 3D effects.

---

## Variation 2 - Single-Direction Sorted Variance Bar Chart

**Filename:** `budget-variance-single-direction.png`

**Prompt:**
Dark-themed finance dashboard chart, 800x500px, background color #0f1729. Title "Budget Variance — Feb 2026" in white. A horizontal bar chart where all bars extend left-to-right from a vertical zero-line reference. Bar length represents variance from budget. Categories sorted from most under budget (top) to least: Groceries (-$243), Shopping (-$146), Transportation (-$63), Dining (-$61), Entertainment (-$56), Health (-$35), Utilities (-$15), Subscriptions (-$7), Insurance (-$4). Bars extend LEFT of the zero line for under-budget categories. Teal colored bars for under budget, red/amber for over budget. Each row shows: category name on left, bar, variance dollar amount, and actual/budget in muted text. Compact rows, minimal whitespace. Clean modern data visualization, no 3D effects.

---

## Variation 3 - Proportional Variance with Budget Context

**Filename:** `budget-variance-proportional.png`

**Prompt:**
Dark-themed finance dashboard chart, 800x500px, background color #0f1729. Title "Spending vs Budget — Feb 2026" in white. A horizontal bar chart where each row has two layered elements: a thin semi-transparent background bar showing the full budget amount, and a solid teal overlay bar showing actual spending. The GAP between actual and budget is highlighted with a subtle green/teal stripe pattern to show remaining budget. Categories sorted by percentage of budget used (lowest % at top): Shopping (40%), Entertainment (48%), Groceries (56%), Transportation (58%), Health (65%), Dining (76%), Subscriptions (94%), Utilities (95%), Insurance (98%). Each row shows category name, the layered bar, a percentage label, and actual/budget amounts. Clean modern data visualization style, no 3D effects, minimal whitespace.
