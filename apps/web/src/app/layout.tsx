import { loadWebEnvironment } from '@fomeora/env';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { SiteFooter } from '@/components/landing/SiteFooter';
import { PwaBootstrap } from '@/components/pwa/PwaBootstrap';
import { site } from '@/content/landing';

import './globals.css';

export const metadata: Metadata = {
  title: `${site.name} · ${site.tagline}`,
  description: site.description,
  applicationName: site.name,
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: site.name,
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#08090b',
};

/**
 * Flags the document as scripted before paint so reveal styles never hide content
 * for no-JS visitors. Because it mutates `<html>` before hydration, the element
 * opts out of the className hydration check.
 */
const JS_FLAG = "document.documentElement.classList.add('js')";

export default function RootLayout({ children }: { children: ReactNode }) {
  const { APP_NETWORK: network } = loadWebEnvironment();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: JS_FLAG }} />
      </head>
      <body>
        {children}
        <PwaBootstrap />
        <SiteFooter network={network} />
      </body>
    </html>
  );
}
