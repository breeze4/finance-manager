import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceDot, CartesianGrid, Legend } from "recharts";

export interface ComparisonSeries<TRow> {
  /** Row key for the series values. */
  key: keyof TRow & string;
  /** Display label (legend + tooltip). */
  label: string;
  /** Stroke color (CSS color or `hsl(var(...))`). */
  color: string;
  /** Optional dashed style. */
  strokeDasharray?: string;
}

/**
 * Multi-series line chart with optional crossover annotation.
 * Used for mortgage balance / interest / investment-comparison views.
 *
 * `crossoverMonth`, when supplied, draws a `ReferenceDot` at the row whose
 * `xKey` value matches it, on whichever series the caller picks via
 * `crossoverSeriesKey`.
 */
export interface ComparisonLineChartProps<TRow extends Record<string, unknown>> {
  data: TRow[];
  xKey: keyof TRow & string;
  series: ComparisonSeries<TRow>[];
  /** Optional crossover-month annotation (in the unit of `xKey`). */
  crossoverMonth?: number;
  /**
   * Series whose y-value to anchor the crossover dot on. Defaults to the
   * first series.
   */
  crossoverSeriesKey?: keyof TRow & string;
  crossoverColor?: string;
  crossoverLabel?: string;
  valueFormatter?: (value: number) => string;
  height?: number;
}

export function ComparisonLineChart<TRow extends Record<string, unknown>>({
  data,
  xKey,
  series,
  crossoverMonth,
  crossoverSeriesKey,
  crossoverColor = "hsl(var(--chart-3))",
  crossoverLabel = "Crossover",
  valueFormatter,
  height = 300
}: ComparisonLineChartProps<TRow>) {
  const crossoverRow =
    crossoverMonth !== undefined
      ? data.find(row => (row[xKey] as unknown as number) === crossoverMonth)
      : undefined;
  const dotKey = crossoverSeriesKey ?? series[0]?.key;
  const crossoverY =
    crossoverRow && dotKey ? (crossoverRow[dotKey] as unknown as number) : undefined;

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
        {series.map(s => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            strokeDasharray={s.strokeDasharray}
            dot={false}
            isAnimationActive={false}
          />
        ))}
        {crossoverMonth !== undefined && crossoverY !== undefined && (
          <ReferenceDot
            x={crossoverMonth}
            y={crossoverY}
            r={6}
            fill={crossoverColor}
            stroke={crossoverColor}
            label={{ value: crossoverLabel, position: "top", fill: crossoverColor, fontSize: 12 }}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
