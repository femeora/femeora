'use client';

import { useEffect, useRef } from 'react';

/** Hairline under the header that fills as the page scrolls. */
export function PageProgress() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      node.style.setProperty('--page-progress', String(max > 0 ? window.scrollY / max : 0));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  return (
    <div ref={ref} aria-hidden="true" className="absolute inset-x-0 -bottom-px h-px">
      <div className="page-progress metal h-px w-full" />
    </div>
  );
}
