/**
 * Reads a design token (stored as "r g b" channels in globals.css) and returns a
 * color string for canvas renderers such as lightweight-charts.
 */
export function tokenColor(name: string, alpha = 1): string {
  const channels = getComputedStyle(document.documentElement)
    .getPropertyValue(`--${name}`)
    .trim()
    .split(/\s+/);
  const [r = '0', g = '0', b = '0'] = channels;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
