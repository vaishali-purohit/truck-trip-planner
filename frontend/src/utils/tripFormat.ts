import { TIME_ZONE_EASTERN } from "./timeZones";

export type CityState = { city: string; state: string };

export function formatStop(stop: CityState): string {
  const city = (stop.city || "").trim();
  const state = (stop.state || "").trim();
  if (city && state) return `${city}, ${state}`;
  if (state) return state;
  if (city) return city;
  return "-";
}

export function parseStop(raw: string): CityState {
  const s = (raw || "").trim();
  if (!s) return { city: "-", state: "" };
  const parts = s.split(",").map((p) => p.trim());
  if (parts.length >= 2)
    return { city: parts[0] || "-", state: (parts[1] || "").toUpperCase() };
  return { city: s, state: "" };
}

/** UI uses local date formatting from yyyy-mm-dd. */
export function formatDateOnly(dateISO: string): string {
  return new Date(dateISO + "T00:00:00").toDateString();
}

/** Display all "trip timestamps" in US Eastern Time. */
export function formatDateTimeEastern(iso: string): string {
  const dt = new Date(iso);
  return dt.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIME_ZONE_EASTERN,
    timeZoneName: "short",
  });
}

/** Deterministic-ish date formatting for yyyy-mm-dd. */
export function formatDateISOShort(dateISO: string): string {
  const dt = new Date(`${dateISO}T00:00:00`);
  return dt.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
