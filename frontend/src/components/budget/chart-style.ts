/**
 * Chart styling shared by Budget tab visualizations (Historical and
 * Actual vs Budget). The `tooltipStyle` is spread directly into a recharts
 * `<Tooltip>`; `chartColors` is indexed by series position.
 */

export const tooltipStyle = {
  contentStyle: {
    backgroundColor: "hsl(225, 22%, 11%)",
    border: "1px solid hsl(225, 15%, 18%)",
    borderRadius: 8,
    fontSize: 12,
  },
};

export const chartColors = [
  "hsl(220, 70%, 55%)",
  "hsl(173, 58%, 39%)",
  "hsl(280, 60%, 55%)",
  "hsl(45, 90%, 50%)",
  "hsl(350, 70%, 55%)",
  "hsl(150, 60%, 45%)",
];
