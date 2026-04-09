export function formatClockEastern(fromHour: number): string {
  const h = Math.floor(fromHour) % 24;
  const m = Math.round((fromHour - Math.floor(fromHour)) * 60);
  const mm = String(m).padStart(2, "0");
  return `${String(h).padStart(2, "0")}:${mm} ET`;
}

