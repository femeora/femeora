import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Femeora',
    short_name: 'Femeora',
    description: 'Liquidity, launchpads, and proof-backed callouts on Robinhood Chain.',
    start_url: '/feed',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#08090b',
    theme_color: '#08090b',
    icons: [
      { src: '/icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
    ],
    shortcuts: [
      { name: 'Feed', short_name: 'Feed', url: '/feed' },
      { name: 'Pools', short_name: 'Pools', url: '/pools' },
      { name: 'Launch', short_name: 'Launch', url: '/launch' },
      { name: 'Portfolio', short_name: 'Portfolio', url: '/portfolio' },
    ],
  };
}
