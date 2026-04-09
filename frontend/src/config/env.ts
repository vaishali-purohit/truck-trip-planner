function readEnv(name: string): string {
  const v = (import.meta.env as Record<string, unknown>)[name];
  return typeof v === "string" ? v.trim() : "";
}

function optionalEnv(name: string): string | undefined {
  const s = readEnv(name);
  return s || undefined;
}

const missing: string[] = [];
function requiredEnv(name: string): string {
  const s = readEnv(name);
  if (!s) missing.push(name);
  return s;
}

export const env = {
  apiUrl: requiredEnv("VITE_API_URL"),
  apiKey: optionalEnv("VITE_API_KEY"),
  mapboxToken: optionalEnv("VITE_MAPBOX_TOKEN"),
  mapboxStyleLight: optionalEnv("VITE_MAPBOX_STYLE_LIGHT"),
  mapboxStyleDark: optionalEnv("VITE_MAPBOX_STYLE_DARK"),
};

export const envErrors = missing.length
  ? missing.map((k) => `Missing required environment variable: ${k}`)
  : [];

