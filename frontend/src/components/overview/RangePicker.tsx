/**
 * RangePicker — preset dropdown + custom date entry for the Overview page.
 *
 * Visual: shadcn `<Select>` with the seven preset labels. When the user
 * picks "Custom", the existing `<DateRangePicker>` is rendered beside the
 * dropdown so the user can type the from/to dates.
 *
 * State is held by `useOverviewRange`; this component is purely
 * presentational. Picker changes propagate through `setRange`, which the
 * hook persists to the URL.
 */

import { DateRangePicker } from "@/components/DateRangePicker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  RangePresetDescriptor,
  RangePresetKey,
  RangeState,
} from "@/hooks/useOverviewRange";

export interface RangePickerProps {
  range: RangeState;
  setRange: (
    key: RangePresetKey,
    custom?: { date_from: string; date_to: string },
  ) => void;
  presets: RangePresetDescriptor[];
}

export function RangePicker({ range, setRange, presets }: RangePickerProps) {
  const handlePresetChange = (key: string) => {
    if (key === range.preset) return;
    setRange(key as RangePresetKey);
  };

  const handleCustomDates = (start: string | null, end: string | null) => {
    // Both bounds are required to form a valid custom range; if either is
    // cleared we leave the picker in custom mode but don't push a partial
    // range to the URL.
    if (!start || !end) return;
    setRange("custom", { date_from: start, date_to: end });
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="overview-range-preset">
          Range
        </label>
        <Select value={range.preset} onValueChange={handlePresetChange}>
          <SelectTrigger id="overview-range-preset" className="w-56 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {presets.map((preset) => (
              <SelectItem key={preset.key} value={preset.key}>
                {preset.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {range.preset === "custom" && (
        <DateRangePicker
          start={range.date_from || null}
          end={range.date_to || null}
          onChange={handleCustomDates}
        />
      )}
    </div>
  );
}
