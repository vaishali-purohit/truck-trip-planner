export function formatClockEastern(fromHour: number): string {
  const h = Math.floor(fromHour) % 24;
  const m = Math.round((fromHour - Math.floor(fromHour)) * 60);
  const mm = String(m).padStart(2, "0");
  return `${String(h).padStart(2, "0")}:${mm} ET`;
}

/** HH:mm on the 24h log axis (for remarks timeline). */
export function formatClockShort(fromHour: number): string {
  const h = Math.floor(fromHour) % 24;
  const m = Math.round((fromHour - Math.floor(fromHour)) * 60) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

