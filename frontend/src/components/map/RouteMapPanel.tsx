import { Box, Stack, Typography } from "@mui/material";
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import SectionCard from "../common/SectionCard";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { alpha, useTheme } from "@mui/material/styles";
import type { MapMouseEvent } from "mapbox-gl";

import Map, {
  FullscreenControl,
  Layer,
  NavigationControl,
  Popup,
  Source,
  type LayerProps,
  type MapRef,
} from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";

import type { DutyStatusTotals, EldLogSegment, TripRoute, TripStop } from "../../types/trip";
import { buildFourDutyStatusMarkers, sliceRouteByFractionRange } from "../../utils/routeDutyGeometry";
import {
  formatLocationAlongFractionRangeWindow,
  formatLocationAlongFullRoute,
} from "../../utils/tripRoutePlace";
import { env } from "../../config/env";
import { MAPBOX_DEFAULT_STYLE_DARK, MAPBOX_DEFAULT_STYLE_LIGHT } from "../../config/constants";
import { mapboxReversePlaceName } from "../../utils/mapboxReverseGeocode";

export interface RouteMapPanelProps {
  route?: TripRoute;
  dutyTotals?: DutyStatusTotals;
  dateISO?: string;
  pickup?: TripStop;
  dropoff?: TripStop;
  /** When set with `dayRouteMode`, only this slice of the polyline is drawn and fitted. */
  routeProgress?: { start: number; end: number };
  /** Per-day ELD segments → one dot per status block in time order (Off Duty, Driving, …). */
  eldSegments?: EldLogSegment[];
  /** If true: show only the day's route slice + day endpoints (not full-trip pickup/dropoff). */
  dayRouteMode?: boolean;
  /** Labels for the two ends of the day's route slice (Record of Duty Status From/To). */
  dayStartLabel?: string;
  dayEndLabel?: string;
  /**
   * Grow to fill a flex parent (e.g. draft overview) instead of using a fixed min-height floor.
   */
  fillViewport?: boolean;
}

const routeLineLayer: LayerProps = {
  id: "route-line",
  type: "line",
  paint: {
    "line-color": "#2E7DFF",
    "line-width": 4,
    "line-opacity": 0.9,
  },
  layout: {
    "line-join": "round",
    "line-cap": "round",
  },
};

const LAYER_DUTY_DOTS = "duty-dots";
const LAYER_STOPS = "route-stop-discs";

function formatStopLabel(s: TripStop) {
  return `${s.city}, ${s.state}`;
}

/** Lat/lon for map popups (WGS84). */
function formatLatLonLine(lat: number, lng: number): string {
  const la = Number.isFinite(lat) ? lat.toFixed(5) : "—";
  const lo = Number.isFinite(lng) ? lng.toFixed(5) : "—";
  return `Lat ${la}, Lon ${lo}`;
}

function formatDutyClockWindow(dateISO: string, startHour: number, endHour: number): string {
  const base = new Date(`${dateISO}T00:00:00`);
  const a = new Date(base.getTime() + startHour * 3600 * 1000);
  const b = new Date(base.getTime() + endHour * 3600 * 1000);
  const opt: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  return `${a.toLocaleTimeString(undefined, opt)} – ${b.toLocaleTimeString(undefined, opt)}`;
}

export default function RouteMapPanel({
  route,
  dutyTotals,
  dateISO,
  pickup,
  dropoff,
  routeProgress,
  eldSegments,
  dayRouteMode,
  dayStartLabel,
  dayEndLabel,
  fillViewport = false,
}: RouteMapPanelProps) {
  const theme = useTheme();
  const mapRef = useRef<MapRef | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const mapboxToken = env.mapboxToken ?? "";
  const [mapError, setMapError] = useState<string | null>(null);
  const [hoverTip, setHoverTip] = useState<{
    lng: number;
    lat: number;
    type: string;
    time: string;
    /** Label from trip / ELD (fallback when reverse geocode is unavailable). */
    planLocation: string;
  } | null>(null);
  /** `undefined` = not loaded yet; `""` = no result; otherwise Mapbox `place_name` at the pin. */
  const [pinGeocodedPlace, setPinGeocodedPlace] = useState<string | undefined>(undefined);

  const lightStyle = env.mapboxStyleLight || MAPBOX_DEFAULT_STYLE_LIGHT;
  const darkStyle = env.mapboxStyleDark || MAPBOX_DEFAULT_STYLE_DARK;

  const mapStyle = theme.palette.mode === "dark" ? darkStyle : lightStyle;

  const coords = route?.line?.coordinates;

  const daySliceCoords = useMemo(() => {
    if (!coords?.length || coords.length < 2 || !routeProgress || !dayRouteMode) return null;
    const slice = sliceRouteByFractionRange(coords, routeProgress);
    return slice.length >= 2 ? slice : null;
  }, [coords, dayRouteMode, routeProgress]);

  const lineCoordinates = useMemo(() => {
    if (daySliceCoords) return daySliceCoords;
    return coords?.length && coords.length >= 2 ? coords : null;
  }, [coords, daySliceCoords]);

  const dutyDotsGeoJson = useMemo(() => {
    if (!coords?.length || coords.length < 2 || !dutyTotals) return null;

    let markers: Array<{
      coordinates: [number, number];
      label: string;
      color: string;
      fromHour: number;
      toHour: number;
      pathMidFraction: number;
      location?: string;
    }> = [];

    const routeSpan =
      dayRouteMode && routeProgress ? routeProgress : { start: 0 as number, end: 1 as number };
    const eldForMarkers = dayRouteMode && eldSegments?.length ? eldSegments : null;
    markers = buildFourDutyStatusMarkers(coords, dutyTotals, routeSpan, eldForMarkers).map((m) => ({
      coordinates: m.coordinates as [number, number],
      label: m.label,
      color: m.color,
      fromHour: m.fromHour,
      toHour: m.toHour,
      pathMidFraction: m.pathMidFraction,
      location: m.location,
    }));

    if (!markers.length) return null;

    return {
      type: "FeatureCollection" as const,
      features: markers.map((m) => {
        const timeStr =
          dateISO != null && dateISO.length >= 8
            ? formatDutyClockWindow(dateISO, m.fromHour, m.toHour)
            : `${m.fromHour.toFixed(2)}h – ${m.toHour.toFixed(2)}h`;
        return {
          type: "Feature" as const,
          properties: {
            dotColor: m.color,
            detailType: m.label,
            detailTime: timeStr,
            detailLocation:
              m.location?.trim()
                ? m.location.trim()
                : dayRouteMode && routeProgress && dayStartLabel && dayEndLabel
                  ? formatLocationAlongFractionRangeWindow(
                      m.pathMidFraction,
                      routeProgress,
                      dayStartLabel,
                      dayEndLabel,
                    )
                  : formatLocationAlongFullRoute(m.pathMidFraction, pickup, dropoff),
          },
          geometry: {
            type: "Point" as const,
            coordinates: m.coordinates,
          },
        };
      }),
    };
  }, [
    coords,
    dateISO,
    dayEndLabel,
    dayRouteMode,
    dayStartLabel,
    dutyTotals,
    dropoff,
    eldSegments,
    pickup,
    routeProgress,
  ]);

  const pickupLngLat = route?.pickupLngLat;
  const dropoffLngLat = route?.dropoffLngLat;
  const pickupDotColor = theme.palette.success.main;
  const dropoffDotColor = theme.palette.error.main;

  const stopsGeoJson = useMemo(() => {
    const features: Array<{
      type: "Feature";
      properties: Record<string, string>;
      geometry: { type: "Point"; coordinates: [number, number] };
    }> = [];

    if (dayRouteMode && daySliceCoords?.length && dayStartLabel && dayEndLabel) {
      const a = daySliceCoords[0]!;
      const b = daySliceCoords[daySliceCoords.length - 1]!;
      features.push({
        type: "Feature",
        properties: {
          dotColor: pickupDotColor,
          detailType: "Day start (From)",
          detailTime: "",
          detailLocation: dayStartLabel,
        },
        geometry: { type: "Point", coordinates: [a[0], a[1]] },
      });
      features.push({
        type: "Feature",
        properties: {
          dotColor: dropoffDotColor,
          detailType: "Day end (To)",
          detailTime: "",
          detailLocation: dayEndLabel,
        },
        geometry: { type: "Point", coordinates: [b[0], b[1]] },
      });
    } else {
      if (pickupLngLat) {
        const name =
          route?.pickupLocationName?.trim() ||
          (pickup ? formatStopLabel(pickup) : "Pickup");
        features.push({
          type: "Feature",
          properties: {
            dotColor: pickupDotColor,
            detailType: "Pickup",
            detailTime: "",
            detailLocation: name,
          },
          geometry: { type: "Point", coordinates: pickupLngLat },
        });
      }
      if (dropoffLngLat) {
        const name =
          route?.dropoffLocationName?.trim() ||
          (dropoff ? formatStopLabel(dropoff) : "Drop-off");
        features.push({
          type: "Feature",
          properties: {
            dotColor: dropoffDotColor,
            detailType: "Drop-off",
            detailTime: "",
            detailLocation: name,
          },
          geometry: { type: "Point", coordinates: dropoffLngLat },
        });
      }
    }

    return features.length ? { type: "FeatureCollection" as const, features } : null;
  }, [
    dayEndLabel,
    dayRouteMode,
    daySliceCoords,
    dayStartLabel,
    dropoff,
    dropoffDotColor,
    dropoffLngLat,
    pickup,
    pickupDotColor,
    pickupLngLat,
    route?.dropoffLocationName,
    route?.pickupLocationName,
  ]);

  const initialViewState = useMemo(() => {
    const line = lineCoordinates;
    if (line?.length) {
      const mid = Math.floor(line.length / 2);
      const [lng, lat] = line[mid]!;
      return { longitude: lng, latitude: lat, zoom: dayRouteMode ? 7 : 6 };
    }
    if (route?.pickupLngLat) {
      return {
        longitude: route.pickupLngLat[0],
        latitude: route.pickupLngLat[1],
        zoom: 6,
      };
    }
    return { longitude: -96.8, latitude: 37.8, zoom: 3 };
  }, [dayRouteMode, lineCoordinates, route?.pickupLngLat]);

  const fitRouteBounds = useCallback(() => {
    const pts = lineCoordinates;
    if (!pts?.length) return;
    const lons = pts.map((c) => c[0]);
    const lats = pts.map((c) => c[1]);
    const bounds: [[number, number], [number, number]] = [
      [Math.min(...lons), Math.min(...lats)],
      [Math.max(...lons), Math.max(...lats)],
    ];
    mapRef.current?.resize();
    mapRef.current?.fitBounds(bounds, { padding: 60, duration: 650, maxZoom: dayRouteMode ? 11 : 10 });
  }, [dayRouteMode, lineCoordinates]);

  useEffect(() => {
    if (!mapLoaded) return;
    if (!lineCoordinates?.length) return;
    let cancelled = false;
    let tries = 0;

    const tryFit = () => {
      if (cancelled) return;
      const map = mapRef.current?.getMap();
      if (!map) return;

      const canvas = map.getCanvas();
      const w = canvas?.clientWidth ?? 0;
      const h = canvas?.clientHeight ?? 0;
      const ready = map.loaded() && map.isStyleLoaded && map.isStyleLoaded();
      if (ready && w > 20 && h > 20) {
        fitRouteBounds();
        return;
      }

      tries += 1;
      if (tries < 20) {
        setTimeout(tryFit, 50);
      }
    };

    tryFit();
    return () => {
      cancelled = true;
    };
  }, [fitRouteBounds, lineCoordinates?.length, mapLoaded]);

  useEffect(() => {
    if (hoverTip == null) {
      setPinGeocodedPlace(undefined);
      return;
    }
    if (!mapboxToken) {
      setPinGeocodedPlace(undefined);
      return;
    }

    const { lng, lat } = hoverTip;
    let cancelled = false;
    const ac = new AbortController();
    setPinGeocodedPlace(undefined);

    mapboxReversePlaceName(lng, lat, mapboxToken, ac.signal)
      .then((name) => {
        if (!cancelled) setPinGeocodedPlace(name);
      })
      .catch(() => {
        if (!cancelled) setPinGeocodedPlace("");
      });

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [hoverTip, mapboxToken]);

  const handleMapMouseMove = useCallback(
    (e: MapMouseEvent) => {
      const map = mapRef.current?.getMap();
      if (!map) return;
      const layers: string[] = [];
      if (dutyDotsGeoJson?.features.length) layers.push(LAYER_DUTY_DOTS);
      if (stopsGeoJson?.features.length) layers.push(LAYER_STOPS);
      if (!layers.length) {
        setHoverTip(null);
        return;
      }
      const feats = map.queryRenderedFeatures(e.point, { layers });
      const f = feats[0];
      const t = f?.properties?.detailType;
      const g = f?.geometry;
      if (typeof t === "string" && g && g.type === "Point" && Array.isArray(g.coordinates)) {
        const [lng, lat] = g.coordinates as [number, number];
        const time = typeof f.properties?.detailTime === "string" ? f.properties.detailTime : "";
        const loc = typeof f.properties?.detailLocation === "string" ? f.properties.detailLocation : "";
        setHoverTip((prev) => {
          if (
            prev &&
            prev.type === t &&
            Math.abs(prev.lng - lng) < 1e-8 &&
            Math.abs(prev.lat - lat) < 1e-8
          ) {
            return prev;
          }
          return { lng, lat, type: t, time, planLocation: loc };
        });
      } else {
        setHoverTip(null);
      }
    },
    [dutyDotsGeoJson?.features.length, stopsGeoJson?.features.length],
  );

  const clearHover = useCallback(() => {
    setHoverTip(null);
    setPinGeocodedPlace(undefined);
  }, []);

  const hoverLocationLine = useMemo(() => {
    if (!hoverTip) return "—";
    const fromPin =
      pinGeocodedPlace !== undefined && pinGeocodedPlace !== "" ? pinGeocodedPlace : "";
    const plan = hoverTip.planLocation.trim();
    if (fromPin) return fromPin;
    if (plan) return plan;
    return "—";
  }, [hoverTip, pinGeocodedPlace]);

  const interactiveLayerIds = useMemo(() => {
    const ids: string[] = [];
    if (dutyDotsGeoJson?.features.length) ids.push(LAYER_DUTY_DOTS);
    if (stopsGeoJson?.features.length) ids.push(LAYER_STOPS);
    return ids;
  }, [dutyDotsGeoJson?.features.length, stopsGeoJson?.features.length]);

  const legendItems = useMemo(() => {
    if (!dutyTotals) {
      return [
        { label: "Route", color: "#2E7DFF" },
        { label: "Pickup", color: theme.palette.success.main },
        { label: "Drop-off", color: theme.palette.error.main },
      ];
    }

    const rows: Array<{ label: string; color: string }> = [
      { label: "Off Duty", color: "#9CA3AF" },
      { label: "Sleeper Berth", color: "#3B82F6" },
      { label: "Driving", color: "#10B981" },
      { label: "On Duty", color: "#F59E0B" },
    ];

    return rows.map(({ label, color }) => ({ label, color }));
  }, [dutyTotals, theme.palette.error.main, theme.palette.success.main]);

  const routeGeoJson = useMemo(() => {
    if (!lineCoordinates?.length) return null;
    return {
      type: "Feature" as const,
      properties: {},
      geometry: { type: "LineString" as const, coordinates: lineCoordinates },
    };
  }, [lineCoordinates]);

  return (
    <SectionCard
      padded={false}
      sx={{
        height: "100%",
        ...(fillViewport
          ? { flex: 1, minHeight: 0 }
          : { minHeight: { xs: 380, md: 520 } }),
      }}
    >
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          height: "100%",
          p: 1.5,
          display: "flex",
          flexDirection: "column",
          gap: 1,
        }}
      >
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1, columnGap: 1, minWidth: 0, width: "100%" }}
        >
          <MapOutlinedIcon color="action" sx={{ flexShrink: 0 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 800, minWidth: 0, flex: { xs: "1 1 100%", sm: "0 1 auto" } }}>
            {dayRouteMode ? "Route Map — selected day" : "Route Map"}
          </Typography>
          <Box sx={{ flex: { xs: "none", sm: 1 }, minWidth: 0, display: { xs: "none", sm: "block" } }} />

          <Stack
            direction="row"
            spacing={1.25}
            sx={{
              alignItems: "center",
              flexWrap: "wrap",
              justifyContent: { xs: "flex-start", sm: "flex-end" },
              flex: { xs: "1 1 100%", sm: "0 1 auto" },
              minWidth: 0,
            }}
          >
            {legendItems.map((item) => (
              <LegendDot key={item.label} label={item.label} color={item.color} />
            ))}
          </Stack>
        </Stack>

        <Box
          onMouseLeave={clearHover}
          sx={(t) => ({
            position: "relative",
            flex: 1,
            minHeight: 0,
            borderRadius: 1.5,
            border: `1px solid ${t.palette.divider}`,
            overflow: "hidden",
          })}
        >
          {!mapboxToken ? (
            <Box
              sx={{
                height: "100%",
                minHeight: 160,
                display: "grid",
                placeItems: "center",
                color: "text.secondary",
                fontWeight: 700,
                px: 2,
                textAlign: "center",
              }}
            >
              Add <code>VITE_MAPBOX_TOKEN</code> to your <code>frontend/.env</code> (in the{" "}
              <code>frontend</code> folder), then restart <code>npm run dev</code>.
            </Box>
          ) : (
            <Map
              mapboxAccessToken={mapboxToken}
              initialViewState={initialViewState}
              mapStyle={mapStyle}
              attributionControl={false}
              reuseMaps
              ref={mapRef}
              style={{ width: "100%", height: "100%" }}
              interactiveLayerIds={interactiveLayerIds}
              cursor={hoverTip ? "pointer" : "grab"}
              onMouseMove={handleMapMouseMove}
              onMouseLeave={clearHover}
              onError={(e) => {
                const msg =
                  e.error instanceof Error
                    ? e.error.message
                    : typeof e.error === "object" && e.error && "message" in e.error
                      ? String((e.error as { message?: string }).message)
                      : "Map failed to load.";
                setMapError(msg);
              }}
              onLoad={() => {
                setMapError(null);
                setMapLoaded(true);
                fitRouteBounds();
              }}
            >
              <NavigationControl position="top-left" showCompass={false} />
              <FullscreenControl position="top-right" />

              {routeGeoJson ? (
                <Source id="route-display" type="geojson" data={routeGeoJson}>
                  <Layer {...routeLineLayer} />
                </Source>
              ) : null}

              {dutyDotsGeoJson?.features.length ? (
                <Source id="duty-dots" type="geojson" data={dutyDotsGeoJson}>
                  <Layer
                    id={LAYER_DUTY_DOTS}
                    type="circle"
                    paint={{
                      "circle-radius": 4,
                      "circle-color": ["get", "dotColor"] as unknown as string,
                      "circle-stroke-width": 1.5,
                      "circle-stroke-color": theme.palette.background.paper,
                    }}
                  />
                </Source>
              ) : null}

              {stopsGeoJson?.features.length ? (
                <Source id="route-stops" type="geojson" data={stopsGeoJson}>
                  <Layer
                    id={LAYER_STOPS}
                    type="circle"
                    paint={{
                      "circle-radius": 5,
                      "circle-color": ["get", "dotColor"] as unknown as string,
                      "circle-stroke-width": 1.5,
                      "circle-stroke-color": theme.palette.background.paper,
                    }}
                  />
                </Source>
              ) : null}

              {hoverTip ? (
                <Popup
                  longitude={hoverTip.lng}
                  latitude={hoverTip.lat}
                  anchor="bottom"
                  offset={[0, -10] as [number, number]}
                  closeButton={false}
                  closeOnClick={false}
                  maxWidth="280px"
                  style={{ pointerEvents: "none" }}
                >
                  <Box
                    sx={{
                      px: 0.25,
                      py: 0.25,
                      pointerEvents: "none",
                    }}
                  >
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.4 }}>
                      Type
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 800, display: "block", lineHeight: 1.35, mb: 0.5 }}>
                      {hoverTip.type}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.4 }}>
                      Time
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700, display: "block", lineHeight: 1.35, mb: 0.5 }}>
                      {hoverTip.time.trim() ? hoverTip.time : "—"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.4 }}>
                      Location
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ fontWeight: 700, display: "block", lineHeight: 1.35, whiteSpace: "pre-line" }}
                    >
                      {hoverLocationLine}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.4, mt: 0.5 }}>
                      Coordinates
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700, display: "block", lineHeight: 1.35 }}>
                      {formatLatLonLine(hoverTip.lat, hoverTip.lng)}
                    </Typography>
                  </Box>
                </Popup>
              ) : null}
            </Map>
          )}

          {mapError ? (
            <Box
              sx={(t) => ({
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                p: 2,
                textAlign: "center",
                bgcolor: alpha(t.palette.background.paper, 0.92),
                color: "error.main",
                fontWeight: 600,
                fontSize: 14,
                zIndex: 2,
              })}
            >
              {mapError}
            </Box>
          ) : null}
        </Box>
      </Box>
    </SectionCard>
  );
}

function LegendDot({ label, color }: { label: string; color: string }) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
      <Box
        aria-hidden
        sx={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: color,
          flexShrink: 0,
        }}
      />
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ fontWeight: 700, whiteSpace: { xs: "normal", sm: "nowrap" }, lineHeight: 1.2 }}
      >
        {label}
      </Typography>
    </Stack>
  );
}
