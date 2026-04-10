/** In-memory cache to limit Geocoding API calls (same token as the map). */
const cache = new Map<string, string>();
const MAX_CACHE = 128;

function cacheKey(lng: number, lat: number): string {
  return `${lng.toFixed(4)},${lat.toFixed(4)}`;
}

function trimCache(): void {
  while (cache.size > MAX_CACHE) {
    const first = cache.keys().next().value;
    if (first === undefined) break;
    cache.delete(first);
  }
}

/** True if the first comma-separated block looks like a street / highway line (not city-level). */
const STREETISH_FIRST_SEGMENT =
  /^\d+[\s\-.]|\b(highway|hwy|freeway|expressway|route|rt\.?|road|rd\.?|street|st\.?|avenue|ave\.?|boulevard|blvd\.?|drive|dr\.?|lane|ln\.?|court|ct\.?|way|circle|cir\.?|parkway|pkwy\.?|trail|interstate|i-\d+)\b/i;

/**
 * Mapbox `place_name` often starts with a road name. For UI we show from locality onward, e.g.
 * `Grand Army of the Republic Highway, Frisco, Colorado 80443, United States`
 * → `Frisco, Colorado 80443, United States`
 */
export function shortenMapboxPlaceName(full: string): string {
  const t = full.trim();
  if (!t) return t;
  const parts = t
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 4) {
    return parts.slice(1).join(", ");
  }
  if (parts.length === 3 && STREETISH_FIRST_SEGMENT.test(parts[0]!)) {
    return parts.slice(1).join(", ");
  }
  return t;
}

/**
 * US `place_name` tail is often `City, State ZIP, United States`. UI shows state + ZIP + short country, e.g.
 * `Moapa, Nevada 89025, United States` → `Nevada 89025, US`
 */
export function compactUsMapboxPlaceName(s: string): string {
  const t = s.trim();
  if (!t) return t;
  const usTail = /,?\s*(United States|USA)\s*$/i;
  if (!usTail.test(t)) return t;
  const core = t.replace(usTail, "").trim();
  const parts = core.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return t;

  const last = parts[parts.length - 1]!;
  const stateZip = last.match(/^([A-Za-z][A-Za-z\s.'-]*?)\s+(\d{5}(?:-\d{4})?)$/);
  if (stateZip) {
    const state = stateZip[1].trim().replace(/\s+/g, " ");
    return `${state} ${stateZip[2]}, US`;
  }

  if (parts.length >= 2) {
    const maybeState = last;
    if (/^[A-Za-z][A-Za-z\s.'-]{0,35}$/.test(maybeState) && !/\d/.test(maybeState)) {
      return `${maybeState}, US`;
    }
  }

  return `${core}, US`;
}

export function formatMapboxPlaceNameForDisplay(rawPlaceName: string): string {
  return compactUsMapboxPlaceName(shortenMapboxPlaceName(rawPlaceName));
}

/**
 * Reverse geocode WGS84 coordinates via Mapbox Geocoding API.
 * Returns a compact US-style line when applicable, or "" on failure / empty response.
 */
export async function mapboxReversePlaceName(
  lng: number,
  lat: number,
  accessToken: string,
  signal?: AbortSignal,
): Promise<string> {
  if (!accessToken?.trim() || !Number.isFinite(lng) || !Number.isFinite(lat)) {
    return "";
  }

  const key = cacheKey(lng, lat);
  if (cache.has(key)) {
    return cache.get(key) ?? "";
  }

  const path = `${lng},${lat}`;
  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(path)}.json`,
  );
  url.searchParams.set("access_token", accessToken.trim());
  url.searchParams.set("limit", "1");

  const res = await fetch(url.toString(), { signal });
  if (!res.ok) {
    return "";
  }

  const data: unknown = await res.json();
  const features =
    data && typeof data === "object" && Array.isArray((data as { features?: unknown }).features)
      ? (data as { features: Array<{ place_name?: unknown }> }).features
      : [];
  const raw = features[0]?.place_name;
  const rawName = typeof raw === "string" ? raw.trim() : "";
  const name = formatMapboxPlaceNameForDisplay(rawName);
  cache.set(key, name);
  trimCache();
  return name;
}
