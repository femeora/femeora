'use client';

import { useEffect, useState } from 'react';

/**
 * True while the user scrolls down past `threshold`; false as soon as they
 * scroll up. Used to tuck the fixed header away while reading.
 */
export function useHideOnScroll(threshold = 120): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    let frame = 0;

    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const y = window.scrollY;
        setHidden(y > threshold && y > lastY);
        lastY = y;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, [threshold]);

  return hidden;
}
