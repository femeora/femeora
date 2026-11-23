'use client';

import { SegmentedControl } from '@/components/ui/SegmentedControl';

import type { ValueUnit } from '../model/format';

export type ChartInterval = '5m' | '15m' | '1h' | '4h';

export const INTERVAL_SECONDS: Record<ChartInterval, number> = {
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14_400,
};

const intervalOptions: readonly { value: ChartInterval; label: string }[] = [
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1h' },
  { value: '4h', label: '4h' },
];

const unitOptions: readonly { value: ValueUnit; label: string }[] = [
  { value: 'mcap', label: 'MCap' },
  { value: 'price', label: 'Price' },
];

const calloutOptions = [
  { value: 'on', label: 'Callouts' },
  { value: 'off', label: 'Off' },
] as const;

const binOptions = [
  { value: 'on', label: 'Bins' },
  { value: 'off', label: 'Off' },
] as const;

interface ChartToolbarProps {
  interval: ChartInterval;
  onIntervalChange: (interval: ChartInterval) => void;
  unit: ValueUnit;
  onUnitChange: (unit: ValueUnit) => void;
  marketCapAvailable: boolean;
  showCallouts: boolean;
  onShowCalloutsChange: (show: boolean) => void;
  showBins: boolean;
  onShowBinsChange: (show: boolean) => void;
}

/** Chart controls (brief 8.1 toolbar). */
export function ChartToolbar({
  interval,
  onIntervalChange,
  unit,
  onUnitChange,
  marketCapAvailable,
  showCallouts,
  onShowCalloutsChange,
  showBins,
  onShowBinsChange,
}: ChartToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 py-3">
      <SegmentedControl
        label="Interval"
        options={intervalOptions}
        value={interval}
        onChange={onIntervalChange}
      />
      {marketCapAvailable ? (
        <SegmentedControl
          label="Chart unit"
          options={unitOptions}
          value={unit}
          onChange={onUnitChange}
        />
      ) : null}
      <SegmentedControl
        label="Callout markers"
        options={calloutOptions}
        value={showCallouts ? 'on' : 'off'}
        onChange={value => onShowCalloutsChange(value === 'on')}
      />
      <SegmentedControl
        label="Liquidity bins"
        options={binOptions}
        value={showBins ? 'on' : 'off'}
        onChange={value => onShowBinsChange(value === 'on')}
      />
      <p className="t-label ml-auto hidden text-faint lg:block">
        Drag to pan · scroll or pinch to zoom
      </p>
    </div>
  );
}
