'use client';

import { Tabs } from '@/components/ui/Tabs';

import type { PositionDraftState } from '../hooks/usePositionDraft';
import type { ValueUnit } from '../model/format';
import type { Pool } from '../model/pool';

import { CreatePositionForm } from './CreatePositionForm';
import { SwapForm } from './SwapForm';

export type PanelTab = 'create' | 'swap';

const tabItems: readonly { value: PanelTab; label: string }[] = [
  { value: 'create', label: 'Create position' },
  { value: 'swap', label: 'Swap' },
];

interface TradePanelProps {
  pool: Pool;
  unit: ValueUnit;
  position: PositionDraftState;
  tab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
}

/** Right-hand panel: Create Position | Swap (brief 8.1). */
export function TradePanel({ pool, unit, position, tab, onTabChange }: TradePanelProps) {
  return (
    <Tabs label="Trade" items={tabItems} value={tab} onChange={onTabChange} listClassName="px-4">
      <div className="p-4">
        {tab === 'create' ? (
          <CreatePositionForm pool={pool} unit={unit} position={position} />
        ) : (
          <SwapForm pool={pool} />
        )}
      </div>
    </Tabs>
  );
}
