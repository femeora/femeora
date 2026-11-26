'use client';

import type { CSSProperties, ElementType, ReactNode } from 'react';

import { useScrollProgress, type ScrollProgressOptions } from '@/hooks/useScrollProgress';

interface ScrollSceneProps extends ScrollProgressOptions {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  as?: ElementType;
}

/**
 * Element that exposes its scroll progress as `--progress` for CSS-driven motion
 * (`.scroll-depth`, `.scroll-rule`, `.hero-exit` ... in globals.css).
 */
export function ScrollScene({
  children,
  className,
  style,
  as: Tag = 'div',
  ...options
}: ScrollSceneProps) {
  const ref = useScrollProgress<HTMLElement>(options);
  return (
    <Tag ref={ref} className={className} style={style}>
      {children}
    </Tag>
  );
}
