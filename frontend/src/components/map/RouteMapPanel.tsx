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

import type { DutyStatusTotals, TripRoute, TripStop } from "../../types/trip";
import { buildDutyRouteSegments, midpointAlongLine } from "../../utils/routeDutyGeometry";
import { env } from "../../config/env";
import { MAPBOX_DEFAULT_STYLE_DARK, MAPBOX_DEFAULT_STYLE_LIGHT } from "../../config/constants";
export interface RouteMapPanelProps {
  route?: TripRoute;
  dutyTotals?: DutyStatusTotals;
  dateISO?: string;
  pickup?: TripStop;
  dropoff?: TripStop;
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

function formatDutyClockWindow(dateISO: string, startHour: number, endHour: number): string {
  const base = new Date(`${dateISO}T00:00:00`);
  const a = new Date(base.getTime() + startHour * 3600 * 1000);
  const b = new Date(base.getTime() + endHour * 3600 * 1000);
  const opt: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  return `${a.toLocaleTimeString(undefined, opt)} – ${b.toLocaleTimeString(undefined, opt)}`;
}

function locationAlongRoute(
  t: number,
  pickup: TripStop | undefined,
  dropoff: TripStop | undefined,
): string {
  if (pickup && dropoff) {
    if (t <= 0.2) return formatStopLabel(pickup);
    if (t >= 0.8) return formatStopLabel(dropoff);
    return `En route · ${formatStopLabel(pickup)} → ${formatStopLabel(dropoff)}`;
  }
  return "En route";
}

export default function RouteMapPanel({
  route,
  dutyTotals,
  dateISO,
  pickup,
  dropoff,
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
    location: string;
  } | null>(null);

  const lightStyle = env.mapboxStyleLight || MAPBOX_DEFAULT_STYLE_LIGHT;
  const darkStyle = env.mapboxStyleDark || MAPBOX_DEFAULT_STYLE_DARK;

  const mapStyle = theme.palette.mode === "dark" ? darkStyle : lightStyle;

  const coords = route?.line?.coordinates;
  const dutySegments = useMemo(() => {
    if (!coords?.length || coords.length < 2 || !dutyTotals) return [];
    return buildDutyRouteSegments(coords, dutyTotals);
  }, [coords, dutyTotals]);

  const dutyDotsGeoJson = useMemo(() => {
    if (!dutySegments.length) return null;
    return {
      type: "FeatureCollection" as const,
      features: dutySegments
        .filter((s) => s.hours > 0 && s.coordinates.length >= 2)
        .map((s) => {
          const timeStr =
            dateISO != null && dateISO.length >= 8
              ? formatDutyClockWindow(dateISO, s.startHour, s.endHour)
              : `${s.startHour.toFixed(2)}h – ${s.endHour.toFixed(2)}h`;
          return {
            type: "Feature" as const,
            properties: {
              dotColor: s.color,
              detailType: s.label,
              detailTime: timeStr,
              detailLocation: locationAlongRoute(s.pathMidFraction, pickup, dropoff),
            },
            geometry: {
              type: "Point" as const,
              coordinates: midpointAlongLine(s.coordinates),
            },
          };
        }),
    };
  }, [dateISO, dutySegments, dropoff, pickup]);

  const pickupLngLat = route?.pickupLngLat;
  const dropoffLngLat = route?.dropoffLngLat;
  const pickupDotColor = theme.palette.success.main;
  const dropoffDotColor = theme.palette.error.main;

  const stopsGeoJson = useMemo(() => {
    if (!pickupLngLat && !dropoffLngLat) return null;
    const features: Array<{
      type: "Feature";
      properties: Record<string, string>;
      geometry: { type: "Point"; coordinates: [number, number] };
    }> = [];
    if (pickupLngLat) {
      features.push({
        type: "Feature",
        properties: {
          dotColor: pickupDotColor,
          detailType: "Pickup",
          detailTime: "",
          detailLocation: pickup ? formatStopLabel(pickup) : "Pickup",
        },
        geometry: { type: "Point", coordinates: pickupLngLat },
      });
    }
    if (dropoffLngLat) {
      features.push({
        type: "Feature",
        properties: {
          dotColor: dropoffDotColor,
          detailType: "Drop-off",
          detailTime: "",
          detailLocation: dropoff ? formatStopLabel(dropoff) : "Drop-off",
        },
        geometry: { type: "Point", coordinates: dropoffLngLat },
      });
    }
    return { type: "FeatureCollection" as const, features };
  }, [dropoff, pickup, dropoffDotColor, dropoffLngLat, pickupDotColor, pickupLngLat]);

  const initialViewState = useMemo(() => {
    if (route?.pickupLngLat) {
      return {
        longitude: route.pickupLngLat[0],
        latitude: route.pickupLngLat[1],
        zoom: 6,
      };
    }
    return { longitude: -96.8, latitude: 37.8, zoom: 3 };
  }, [route]);

  const fitRouteBounds = useCallback(() => {
    if (!route?.line?.coordinates?.length) return;
    const allPts = route.line.coordinates;
    const lons = allPts.map((c) => c[0]);
    const lats = allPts.map((c) => c[1]);
    const bounds: [[number, number], [number, number]] = [
      [Math.min(...lons), Math.min(...lats)],
      [Math.max(...lons), Math.max(...lats)],
    ];
    mapRef.current?.resize();
    mapRef.current?.fitBounds(bounds, { padding: 60, duration: 650, maxZoom: 10 });
  }, [route]);

  useEffect(() => {
    if (!mapLoaded) return;
    if (!route?.line?.coordinates?.length) return;
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
  }, [fitRouteBounds, mapLoaded, route?.line?.coordinates?.length]);

  const handleMapMouseMove = useCallback((e: MapMouseEvent) => {
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
      setHoverTip({ lng, lat, type: t, time, location: loc });
    } else {
      setHoverTip(null);
    }
  }, [dutyDotsGeoJson?.features.length, stopsGeoJson?.features.length]);

  const clearHover = useCallback(() => setHoverTip(null), []);

  const interactiveLayerIds = useMemo(() => {
    const ids: string[] = [];
    if (dutyDotsGeoJson?.features.length) ids.push(LAYER_DUTY_DOTS);
    if (stopsGeoJson?.features.length) ids.push(LAYER_STOPS);
    return ids;
  }, [dutyDotsGeoJson?.features.length, stopsGeoJson?.features.length]);

  const legendItems = useMemo(() => {
    if (dutyTotals) {
      return [
        { label: "Off Duty", color: "#9CA3AF" },
        { label: "Sleeper Berth", color: "#3B82F6" },
        { label: "Driving", color: "#10B981" },
        { label: "On Duty", color: "#F59E0B" },
      ];
    }
    return [
      { label: "Route", color: "#2E7DFF" },
      { label: "Pickup", color: theme.palette.success.main },
      { label: "Drop-off", color: theme.palette.error.main },
    ];
  }, [dutyTotals, theme.palette.error.main, theme.palette.success.main]);

  return (
    <SectionCard
      padded={false}
      sx={{
        height: "100%",
        minHeight: { xs: 380, md: 520 },
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
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <MapOutlinedIcon color="action" />
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
            Route Map
          </Typography>
          <Box sx={{ flex: 1 }} />

          <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
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

              {route?.line?.coordinates?.length ? (
                <Source
                  id="route"
                  type="geojson"
                  data={{ type: "Feature", properties: {}, geometry: route.line }}
                >
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
                    <Typography variant="caption" sx={{ fontWeight: 700, display: "block", lineHeight: 1.35 }}>
                      {hoverTip.location}
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
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
        {label}
      </Typography>
    </Stack>
  );
}
