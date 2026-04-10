import axios from "axios";
import { env } from "../config/env";

export type LocationSuggestion = {
  label: string;
  lat?: string | null;
  lon?: string | null;
};

export async function searchLocations(q: string, limit = 8): Promise<LocationSuggestion[]> {
  const query = q.trim();
  if (!query) return [];

  const res = await axios.get(`${env.apiUrl}/api/locations/search/`, {
    params: { q: query, limit },
    ...(env.apiKey ? { headers: { "X-API-Key": env.apiKey } } : {}),
  });
  const data = res.data;
  if (!Array.isArray(data)) return [];
  return data as LocationSuggestion[];
}

