Build a complete UI mockup for the Finance Analyzer app based on the specification in `docs/SPEC.md`.

Read the spec thoroughly. Every feature, view, and interaction described in the spec should be represented in the mockup. Use the spec as the single source of truth for what the app does and how it's organized.

## Tech Stack

- React + TypeScript
- shadcn/ui components
- Tailwind CSS
- Recharts for charts

## Design Guidelines

- Clean, minimal design with a dark-friendly color palette
- Muted, professional colors. Finance app, not social media.
- All monetary values formatted with $ and commas, 2 decimal places
- Tables should have alternating row backgrounds for readability
- Charts should have tooltips on hover showing exact values
- Responsive: sidebar collapses on mobile, tables become card lists on small screens
- No login screen, no auth UI — it's a local single-user app
- Use placeholder/mock data that looks realistic (grocery stores, restaurants, utility companies, subscription services like Netflix/Spotify, realistic dollar amounts)

## Layout

- Fixed left sidebar with icon+label navigation for each tab defined in the spec
- Highlight the active tab. Sidebar collapses to icons only on narrow screens.
- Main content area to the right of the sidebar with a top bar showing the current tab name and a global date range picker (preset options: This Month, Last 30 Days, This Year, Last Year, All Time, Custom Range)
- Account filter dropdown in the top bar (options derived from the accounts in the spec)

## Implementation Notes

- Build every tab and sub-view described in the spec
- Wire up interactive chart filtering as described in the spec (clicking chart segments filters data)
- All inline editing (category dropdowns, budget amounts) should be functional in the mockup
- Use mock data generators that produce enough volume to test pagination, scrolling, and chart rendering
