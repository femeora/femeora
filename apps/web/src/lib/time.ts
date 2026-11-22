const pad = (value: number) => value.toString().padStart(2, '0');

/** `17:13:25` in the viewer's local time. */
export function formatClock(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** `GMT+7`, `GMT-3:30`, from the viewer's offset. */
export function formatUtcOffset(date: Date): string {
  const minutes = -date.getTimezoneOffset();
  const sign = minutes >= 0 ? '+' : '-';
  const hours = Math.floor(Math.abs(minutes) / 60);
  const rest = Math.abs(minutes) % 60;
  return `GMT${sign}${hours}${rest ? `:${pad(rest)}` : ''}`;
}
