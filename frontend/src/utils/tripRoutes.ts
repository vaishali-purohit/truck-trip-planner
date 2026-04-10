/** Parse `/overview/:tripNo` segment; `null` if missing or not a positive integer string. */
export function parseTripNoParam(raw: string | undefined): number | null {
  if (raw == null || raw === "") return null;
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 1) return null;
  return n;
}

export function tripOverviewPath(tripNo: number): string {
  return `/overview/${tripNo}`;
}

export function tripLogsPath(tripNo: number): string {
  return `/overview/${tripNo}/logs`;
}
