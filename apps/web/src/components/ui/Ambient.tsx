/**
 * Fixed, low-contrast color fields behind the page so glass surfaces have
 * something to blur. Purely decorative and static.
 */
export function Ambient() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -left-[20%] -top-[30%] size-[70vmax] rounded-full bg-[radial-gradient(closest-side,rgb(var(--fg)/0.07),transparent)]" />
      <div className="absolute -right-[25%] top-[30%] size-[60vmax] rounded-full bg-[radial-gradient(closest-side,rgb(var(--signal)/0.06),transparent)]" />
    </div>
  );
}
