import { useEffect, useMemo, useState } from "react";
import { mapboxReversePlaceName } from "../utils/mapboxReverseGeocode";

export type LabeledLngLat = { id: string; lng: number; lat: number };

/**
 * Batch reverse geocode for map display names at exact coordinates.
 * Coordinate groups (4-decimal key) share one request; results are copied to every id in the group.
 */
export function useReverseGeocodeLabeledPoints(
  accessToken: string | undefined,
  points: ReadonlyArray<LabeledLngLat> | null,
): { labels: Readonly<Record<string, string>>; loading: boolean } {
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const signature = useMemo(() => {
    if (!points?.length) return "";
    return JSON.stringify(
      points.map((p) => [p.id, Math.round(p.lng * 1e4) / 1e4, Math.round(p.lat * 1e4) / 1e4]),
    );
  }, [points]);

  useEffect(() => {
    if (!accessToken?.trim() || !signature) {
      queueMicrotask(() => {
        setLabels({});
        setLoading(false);
      });
      return;
    }

    const list = points;
    if (!list?.length) {
      queueMicrotask(() => {
        setLabels({});
        setLoading(false);
      });
      return;
    }

    let cancelled = false;
    const ac = new AbortController();
    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true);
      setLabels({});
    });

    const groups = new Map<string, { lng: number; lat: number; ids: string[] }>();
    for (const p of list) {
      const ck = `${p.lng.toFixed(4)},${p.lat.toFixed(4)}`;
      const g = groups.get(ck);
      if (g) g.ids.push(p.id);
      else groups.set(ck, { lng: p.lng, lat: p.lat, ids: [p.id] });
    }

    void (async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        [...groups.values()].map(async ({ lng, lat, ids }) => {
          try {
            const name = await mapboxReversePlaceName(lng, lat, accessToken, ac.signal);
            for (const id of ids) next[id] = name;
          } catch {
            for (const id of ids) next[id] = "";
          }
        }),
      );
      if (!cancelled) {
        queueMicrotask(() => {
          if (cancelled) return;
          setLabels(next);
          setLoading(false);
        });
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [accessToken, points, signature]);

  return { labels, loading };
}
