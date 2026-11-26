import { ImageResponse } from 'next/og';

import { calloutBins, calloutStatus, formatCalloutValue, rangeLabel, sideLabel } from '@/features/callouts/model/callout';
import { apiFeedCalloutToCallout } from '@/features/callouts/model/fromApi';
import { getCallout, getPoolAssets } from '@/lib/api/server';

export const alt = 'Femeora proof-backed liquidity callout';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 60;

export default async function CalloutOpenGraphImage({ params }: { params: { id: string } }) {
  const [apiCallout, assetResponse] = await Promise.all([
    getCallout(params.id),
    getPoolAssets().catch(() => ({ data: [] })),
  ]);
  const assets = new Map(assetResponse.data.map(asset => [asset.address.toLowerCase(), asset]));
  const callout = apiFeedCalloutToCallout(apiCallout, new Date(), assets);
  const range = rangeLabel(callout);
  const rangeText = typeof range === 'string' ? range : `${range[0]} — ${range[1]}`;
  const status = calloutStatus(callout).replaceAll('-', ' ');

  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#08090b', color: '#f2f3f5', padding: '54px 62px', fontFamily: 'monospace' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {callout.caller.avatarUrl ? <img alt="" src={callout.caller.avatarUrl} width="72" height="72" style={{ borderRadius: 999, border: '2px solid #9298a1', objectFit: 'cover' }} /> : <div style={{ width: 72, height: 72, borderRadius: 999, border: '2px solid #9298a1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>{callout.caller.initials}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div style={{ fontSize: 28 }}>{callout.caller.name}</div>
            <div style={{ fontSize: 20, color: '#9298a1' }}>@{callout.caller.handle}</div>
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: 23, letterSpacing: 4, color: '#c7cbd1' }}>FEMEORA</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {callout.caption ? <div style={{ fontSize: 30, maxWidth: 980, lineHeight: 1.25 }}>{callout.caption}</div> : null}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ fontSize: 54, letterSpacing: -2 }}>{callout.pool.base} / {callout.pool.quote}</div>
          <div style={{ display: 'flex', border: '1px solid #4e535b', padding: '8px 13px', fontSize: 18, color: '#c7cbd1' }}>{callout.pool.type}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        {[
          ['Strategy', sideLabel(callout)],
          ['Range', rangeText],
          ['Bins', callout.pool.type === 'DLMM' ? String(calloutBins(callout)) : 'Full range'],
          ['Position', callout.showSize ? formatCalloutValue(callout, callout.sizeUsd) : 'Hidden'],
          ['Earned', formatCalloutValue(callout, callout.earnedUsd)],
          ['Status', status],
        ].map(([label, value]) => (
          <div key={label} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 9, borderTop: '1px solid #34383e', paddingTop: 15 }}>
            <div style={{ color: '#777d86', fontSize: 15, textTransform: 'uppercase', letterSpacing: 2 }}>{label}</div>
            <div style={{ fontSize: 18, color: label === 'Earned' ? '#55e696' : '#f2f3f5' }}>{value}</div>
          </div>
        ))}
      </div>
    </div>,
    size,
  );
}
