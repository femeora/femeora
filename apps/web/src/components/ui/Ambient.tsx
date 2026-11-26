/**
 * Fixed, low-contrast light fields behind the page so glass surfaces have
 * something to blur and refract. Monochrome; the fields drift slowly (static
 * under reduced motion via the global rule).
 */
export function Ambient() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -left-[20%] -top-[30%] size-[70vmax] animate-[drift_38s_ease-in-out_infinite] rounded-full bg-[radial-gradient(closest-side,rgb(var(--fg)/0.07),transparent)]" />
      <div className="absolute -right-[25%] top-[30%] size-[60vmax] animate-[drift_46s_ease-in-out_infinite_reverse] rounded-full bg-[radial-gradient(closest-side,rgb(var(--signal)/0.06),transparent)]" />
      <div className="absolute bottom-[-30%] left-[20%] size-[45vmax] animate-[drift_54s_ease-in-out_infinite] rounded-full bg-[radial-gradient(closest-side,rgb(var(--fg)/0.045),transparent)] [animation-delay:-20s]" />
    </div>
  );
}
