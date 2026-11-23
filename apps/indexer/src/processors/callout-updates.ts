import type { PositionEventProjection } from '../position-events.js';

export type CalloutUpdateType = 'Added' | 'Removed' | 'Rebalanced' | 'Closed';

function eventKey(event: PositionEventProjection): string {
  return `${event.transactionHash.toLowerCase()}:${event.logIndex}`;
}

/** Produces at most one semantic update per position/transaction lifecycle operation. */
export function classifyCalloutUpdates(
  events: readonly PositionEventProjection[],
): ReadonlyMap<string, CalloutUpdateType> {
  const groups = new Map<string, PositionEventProjection[]>();
  for (const event of events) {
    if (event.kind === 'created' || event.kind === 'transferred') continue;
    const key = `${event.positionId}:${event.transactionHash.toLowerCase()}`;
    const group = groups.get(key) ?? [];
    group.push(event);
    groups.set(key, group);
  }

  const result = new Map<string, CalloutUpdateType>();
  for (const group of groups.values()) {
    const ordered = [...group].sort((left, right) => left.logIndex - right.logIndex);
    const closed = [...ordered].reverse().find(event => event.kind === 'closed');
    if (closed) {
      result.set(eventKey(closed), 'Closed');
      continue;
    }
    const hasIncrease = ordered.some(event => event.kind === 'increased');
    const hasDecrease = ordered.some(event => event.kind === 'decreased');
    if (hasIncrease && hasDecrease) {
      const finalEvent = ordered.at(-1);
      if (!finalEvent) throw new Error('CALLOUT_UPDATE_EVENT_MISSING');
      result.set(eventKey(finalEvent), 'Rebalanced');
      continue;
    }
    for (const event of ordered) {
      result.set(eventKey(event), event.kind === 'increased' ? 'Added' : 'Removed');
    }
  }
  return result;
}

export function calloutUpdateEventKey(event: PositionEventProjection): string {
  return eventKey(event);
}
