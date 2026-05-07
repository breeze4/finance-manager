import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid, Legend } from "recharts";

/**
 * Generic projection-line chart for Coast FIRE-style "value grows toward target" displays.
 * The caller supplies the row array (already adapted from the math lib's chart-data
 * generator via `coastFireProjectionToRecharts` or similar).
 *
 * One main series + optional horizontal reference line for a fixed target.
 */
export interface ProjectionLineChartProps<TRow extends Record<string, unknown>> {
  data: TRow[];
  /** Key in each row to use for the X-axis (e.g. `"age"`). */
  xKey: keyof TRow & string;
  /** Key in each row for the main projected-value series. */
  valueKey: keyof TRow & string;
  /**
   * Optional second series (e.g. inflation-adjusted target line per-row).
   * When omitted, no second line is drawn.
   */
  targetKey?: keyof TRow & string;
  /**
   * Optional fixed horizontal reference line (a single y-value drawn across).
   * Use when the target is a constant rather than per-row.
   */
  targetReference?: number;
  /** Stroke colors. */
  valueColor?: string;
  targetColor?: string;
  /** Friendly labels for legend/tooltip. */
  valueLabel?: string;
  targetLabel?: string;
  /** Format function for Y-axis ticks and tooltip values. */
  valueFormatter?: (value: number) => string;
  height?: number;
}

export function ProjectionLineChart<TRow extends Record<string, unknown>>({
  data,
  xKey,
  valueKey,
  targetKey,
  targetReference,
  valueColor = "hsl(var(--chart-1))",
  targetColor = "hsl(var(--chart-2))",
  valueLabel = "Projected",
  targetLabel = "Target",
  valueFormatter,
  height = 300
}: ProjectionLineChartProps<TRow>) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey={xKey} className="text-xs" />
        <YAxis tickFormatter={valueFormatter} className="text-xs" width={80} />
        <Tooltip
          formatter={(value: number) => (valueFormatter ? valueFormatter(value) : value)}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey={valueKey}
          name={valueLabel}
          stroke={valueColor}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
        {targetKey && (
          <Line
            type="monotone"
            dataKey={targetKey}
            name={targetLabel}
            stroke={targetColor}
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            isAnimationActive={false}
          />
        )}
        {targetReference !== undefined && (
          <ReferenceLine
            y={targetReference}
            stroke={targetColor}
            strokeDasharray="5 5"
            label={{ value: targetLabel, position: "right", fill: targetColor, fontSize: 12 }}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
