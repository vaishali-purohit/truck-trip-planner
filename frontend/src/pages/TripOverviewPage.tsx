import { Box, Button, Stack, Tab, Tabs, Typography } from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";

import type { TripDetails } from "../types/trip";
import { createTripPlan, getTripByTripNo } from "../api/tripApi";
import SectionCard from "../components/common/SectionCard";
import PageHeader from "../components/common/PageHeader";
import RouteMapPanel from "../components/map/RouteMapPanel";
import RouteDetailsForm from "../components/overview/RouteDetailsForm";
import GenerateRouteButton from "../components/overview/GenerateRouteButton";
import DailyStatusTotalsCard from "../components/overview/DailyStatusTotalsCard";
import TripLifecycleSummaryCard from "../components/overview/TripLifecycleSummaryCard";
import DutyStatusCard from "../components/overview/DutyStatusCard";
import RemarksCard from "../components/overview/RemarksCard";
import { env } from "../config/env";
import { useReverseGeocodeLabeledPoints } from "../hooks/useReverseGeocodeLabeledPoints";
import {
  formatDateTimeEastern,
  formatStop,
  parseStop,
} from "../utils/tripFormat";
import { formatClockShort } from "../utils/clock";
import { dayRouteFractionRange } from "../utils/tripDayMiles";
import { eldSheetFromToLabels } from "../utils/tripEldEndpoints";
import {
  formatFullJourneyLine,
  formatLocationAlongFractionRangeWindow,
} from "../utils/tripRoutePlace";
import { globalRouteFractionForClockHour, pointAtGlobalRouteFraction } from "../utils/routeDutyGeometry";
import { parseTripNoParam, tripOverviewPath } from "../utils/tripRoutes";

export default function TripOverviewPage() {
  const { tripNo: tripNoParam } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [trip, setTrip] = useState<TripDetails | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const routeTripNo = useMemo(() => parseTripNoParam(tripNoParam), [tripNoParam]);
  const invalidTripNoInUrl =
    tripNoParam != null && tripNoParam !== "" && routeTripNo == null;

  const [currentLocation, setCurrentLocation] = useState("");
  const [pickupLocation, setPickupLocation] = useState("");
  const [dropoffLocation, setDropoffLocation] = useState("");
  const [cycleHoursUsed, setCycleHoursUsed] = useState(0);
  /** Default to first day so the EOD graph is visible (Full Journey hides the daily log). */
  const [logTab, setLogTab] = useState<"full" | number>(0);

  useEffect(() => {
    let mounted = true;
    setFetchError(null);

    if (tripNoParam == null || tripNoParam === "") {
      setTrip(null);
      setLoading(false);
      return () => {
        mounted = false;
      };
    }

    if (routeTripNo == null) {
      setTrip(null);
      setLoading(false);
      return () => {
        mounted = false;
      };
    }

    setLoading(true);
    getTripByTripNo(routeTripNo)
      .then((data) => {
        if (!mounted) return;
        setTrip(data);
        const sheetCount = data.eldLogSheets?.length ?? 0;
        setLogTab(sheetCount > 0 ? 0 : "full");
        setCurrentLocation(
          data.inputs?.currentLocation || formatStop(data.pickup),
        );
        setPickupLocation(
          data.inputs?.pickupLocation || formatStop(data.pickup),
        );
        setDropoffLocation(
          data.inputs?.dropoffLocation || formatStop(data.dropoff),
        );
        setCycleHoursUsed(
          Math.min(70, Math.max(0, data.inputs?.cycleHoursUsed ?? 0)),
        );
      })
      .catch(() => {
        if (!mounted) return;
        setTrip(null);
        setFetchError("Trip not found.");
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [tripNoParam, routeTripNo]);

  const displayTrip: TripDetails = useMemo(() => {
    if (trip) return trip;
    const now = new Date();
    const dateISO = now.toISOString().slice(0, 10);
    const pickup = parseStop(pickupLocation);
    const dropoff = parseStop(dropoffLocation);
    return {
      id: "DRAFT",
      dateISO,
      driverName: "",
      truckId: "",
      trailerId: "",
      pickup,
      dropoff,
      totalDistanceMi: 0,
      drivingHours: 0,
      totalTripTimeHours: 0,
      compliance: "compliant",
      driverLogs: "pending",
      carrierName: "",
      mainOfficeAddress: "",
      totalMilesToday: 0,
      dutyTotals: {
        offDutyHours: 0,
        sleeperBerthHours: 0,
        drivingHours: 0,
        onDutyHours: 0,
      },
      estimatedArrivalISO: now.toISOString(),
      stopsCount: 0,
      route: undefined,
      inputs: {
        currentLocation,
        pickupLocation,
        dropoffLocation,
        cycleHoursUsed,
      },
      stopPlan: { fuelStops: 0, breakStops: 0, breakMinutes: 0, stopCount: 0 },
      routeInstructions: [],
      totalLogDays: 0,
      eldLogSheets: [],
    };
  }, [cycleHoursUsed, currentLocation, dropoffLocation, pickupLocation, trip]);

  const canGenerateRoute = useMemo(() => {
    const locationsFilled =
      currentLocation.trim() !== "" &&
      pickupLocation.trim() !== "" &&
      dropoffLocation.trim() !== "";
    const cycleInRange =
      cycleHoursUsed >= 0 && cycleHoursUsed <= 70;
    return locationsFilled && cycleInRange;
  }, [
    currentLocation,
    cycleHoursUsed,
    dropoffLocation,
    pickupLocation,
  ]);

  const isDraft =
    trip == null &&
    (tripNoParam == null || tripNoParam === "") &&
    !fetchError;
  const dutyCardRef = useRef<HTMLDivElement | null>(null);
  const [dutyCardHeight, setDutyCardHeight] = useState<number | null>(null);

  useEffect(() => {
    const el = dutyCardRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect?.height;
      if (typeof h === "number" && Number.isFinite(h) && h > 0)
        setDutyCardHeight(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fullJourneyLine = useMemo(
    () => formatFullJourneyLine(displayTrip.pickup, displayTrip.dropoff),
    [displayTrip.dropoff, displayTrip.pickup],
  );

  const logSheets = useMemo(
    () => (isDraft ? [] : (trip?.eldLogSheets ?? [])),
    [isDraft, trip?.eldLogSheets],
  );
  const isSingleDayTrip = logSheets.length === 1;
  const totalLogDays =
    trip != null ? (trip.totalLogDays ?? Math.max(1, logSheets.length)) : 0;
  const effectiveLogTab: "full" | number = isSingleDayTrip ? 0 : logTab;
  const activeDayIndex =
    effectiveLogTab === "full" || logSheets.length === 0
      ? null
      : Math.min(Math.max(0, effectiveLogTab), logSheets.length - 1);
  const selectedDaySheet =
    activeDayIndex === null ? null : logSheets[activeDayIndex] ?? null;

  const mapDutyTotals = selectedDaySheet?.dutyTotals ?? displayTrip.dutyTotals;
  const mapLogDateISO = selectedDaySheet?.dateISO ?? displayTrip.dateISO;

  const dayRouteProgress = useMemo(() => {
    if (!selectedDaySheet || activeDayIndex === null || !logSheets.length) return null;
    return dayRouteFractionRange(
      activeDayIndex,
      logSheets,
      displayTrip.totalDistanceMi,
      displayTrip.drivingHours,
    );
  }, [activeDayIndex, displayTrip.drivingHours, displayTrip.totalDistanceMi, logSheets, selectedDaySheet]);

  const fallbackLoc = `${formatStop(displayTrip.pickup)} → ${formatStop(displayTrip.dropoff)}`;

  const dayRouteEndpoints = useMemo(() => {
    if (activeDayIndex === null || !selectedDaySheet || !logSheets.length) {
      return {
        from: formatStop(displayTrip.pickup),
        to: formatStop(displayTrip.dropoff),
        miles:
          selectedDaySheet != null
            ? (Number(selectedDaySheet.totalMilesDrivingToday) || displayTrip.totalMilesToday)
            : displayTrip.totalMilesToday,
      };
    }
    const e = eldSheetFromToLabels(
      selectedDaySheet,
      activeDayIndex,
      logSheets,
      displayTrip.pickup,
      displayTrip.dropoff,
      displayTrip.totalDistanceMi,
      displayTrip.drivingHours,
    );
    return { from: e.from, to: e.to, miles: e.miles };
  }, [
    activeDayIndex,
    displayTrip.drivingHours,
    displayTrip.dropoff,
    displayTrip.pickup,
    displayTrip.totalDistanceMi,
    displayTrip.totalMilesToday,
    logSheets,
    selectedDaySheet,
  ]);

  const routeLineCoords = displayTrip.route?.line?.coordinates;
  const dayGeocodePoints = useMemo(() => {
    if (!routeLineCoords || routeLineCoords.length < 2) return null;
    if (activeDayIndex === null || !selectedDaySheet || !logSheets.length || !dayRouteProgress) return null;
    const pts: { id: string; lng: number; lat: number }[] = [];
    const [lngS, latS] = pointAtGlobalRouteFraction(routeLineCoords, dayRouteProgress.start);
    const [lngE, latE] = pointAtGlobalRouteFraction(routeLineCoords, dayRouteProgress.end);
    pts.push({ id: "dayFrom", lng: lngS, lat: latS }, { id: "dayTo", lng: lngE, lat: latE });
    const segments = selectedDaySheet.segments?.filter((s) => s.toHour > s.fromHour) ?? [];
    const allSegs = selectedDaySheet.segments ?? [];
    segments.forEach((s, i) => {
      const midHour = (s.fromHour + s.toHour) / 2;
      const fr = globalRouteFractionForClockHour(allSegs, midHour, dayRouteProgress);
      const [lng, lat] = pointAtGlobalRouteFraction(routeLineCoords, fr);
      pts.push({ id: `seg-${i}`, lng, lat });
    });
    return pts;
  }, [activeDayIndex, dayRouteProgress, logSheets.length, routeLineCoords, selectedDaySheet]);

  const { labels: routePinPlaceNames } = useReverseGeocodeLabeledPoints(env.mapboxToken, dayGeocodePoints);

  const dayMilesDriving = dayRouteEndpoints.miles;
  const dayFromLocation =
    routePinPlaceNames.dayFrom?.trim() ? routePinPlaceNames.dayFrom.trim() : dayRouteEndpoints.from;
  const dayToLocation =
    routePinPlaceNames.dayTo?.trim() ? routePinPlaceNames.dayTo.trim() : dayRouteEndpoints.to;
  const dayDateISO = selectedDaySheet?.dateISO ?? displayTrip.dateISO;

  const remarkEntries = useMemo(() => {
    if (effectiveLogTab === "full" || selectedDaySheet == null) return [];
    const segments = selectedDaySheet.segments?.filter((s) => s.toHour > s.fromHour) ?? [];
    return segments.map((s, i) => {
      const midHour = (s.fromHour + s.toHour) / 2;
      const segs = selectedDaySheet.segments ?? [];
      const pinName = routePinPlaceNames[`seg-${i}`]?.trim() ?? "";
      const apiLoc = typeof s.location === "string" ? s.location.trim() : "";
      const routeLoc =
        pinName
          ? pinName
          : apiLoc
            ? apiLoc
            : dayRouteProgress && segs.length
              ? formatLocationAlongFractionRangeWindow(
                  globalRouteFractionForClockHour(segs, midHour, dayRouteProgress),
                  dayRouteProgress,
                  dayFromLocation,
                  dayToLocation,
                )
              : fallbackLoc;
      return {
        time: formatClockShort(s.fromHour),
        status: s.status,
        location: routeLoc,
        description: s.label || "Duty status change",
      };
    });
  }, [
    dayFromLocation,
    dayRouteProgress,
    dayToLocation,
    fallbackLoc,
    effectiveLogTab,
    routePinPlaceNames,
    selectedDaySheet,
  ]);

  const normalizedDayNumber = (raw: number | undefined, fallback: number) => {
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 1) return fallback;
    return raw;
  };

  const dailyTotalsForSidebar = selectedDaySheet?.dutyTotals ?? displayTrip.dutyTotals;
  const sidebarLogDayNumber =
    selectedDaySheet != null && activeDayIndex != null
      ? normalizedDayNumber(selectedDaySheet.dayIndex, activeDayIndex + 1)
      : 1;

  const tabValue =
    effectiveLogTab === "full" || logSheets.length === 0 ? "full" : String(activeDayIndex ?? 0);

  const stopPlan = displayTrip.stopPlan;
  const fuelStops = stopPlan?.fuelStops ?? 0;
  const breakStops = stopPlan?.breakStops ?? 0;
  const totalStopsAll = stopPlan?.stopCount ?? displayTrip.stopsCount;
  const overnightResetsBetweenDays = Math.max(0, totalLogDays - 1);

  /** Full Journey tab: hide per-day sidebar totals and remarks (day tabs only). */
  const showDayDetail = selectedDaySheet != null;

  const getPlanErrorMessage = (e: unknown): string => {
    const err = e as { response?: { data?: unknown } } | null;
    const data = err?.response?.data;
    if (data && typeof data === "object") {
      const record = data as Record<string, unknown>;
      const msg = record["message"];
      if (typeof msg === "string" && msg.trim()) return msg;

      const parts: string[] = [];
      for (const [k, v] of Object.entries(record)) {
        if (k === "error") continue;
        if (Array.isArray(v)) parts.push(`${k}: ${v.map((x) => String(x)).join(", ")}`);
        else if (typeof v === "string") parts.push(`${k}: ${v}`);
      }
      if (parts.length) return parts.join(" · ");
    }
    return "Trip planning failed. Please try again.";
  };

  if (loading) {
    return (
      <Typography variant="body2" color="text.secondary">
        Loading trip overview…
      </Typography>
    );
  }

  if (invalidTripNoInUrl) {
    return (
      <Typography variant="body2" color="text.secondary">
        Invalid trip number in the URL. Use a number such as{" "}
        <strong>{tripOverviewPath(1900)}</strong>, or open Trip History to pick a trip.
      </Typography>
    );
  }

  if (fetchError) {
    return (
      <Typography variant="body2" color="text.secondary">
        {fetchError}
      </Typography>
    );
  }

  return (
    <Stack
      spacing={2}
      sx={{
        maxWidth: "100%",
        minWidth: 0,
        ...(isDraft
          ? {
              height: {
                xs: "calc(100dvh - 56px - 40px)",
                sm: "calc(100dvh - 64px - 56px)",
              },
              minHeight: 0,
            }
          : {}),
      }}
    >
      <PageHeader
        title={
          isDraft ?
            "Trip Plan & HOS Overview (Draft)"
          : "Trip Plan & HOS Overview"
        }
        subtitle={
          <>
            Generated on{" "}
            {new Date(displayTrip.dateISO + "T00:00:00").toLocaleDateString()} •
            Trip No.:{" "}
            <strong>{isDraft ? "—" : (displayTrip.tripNo != null ? String(displayTrip.tripNo) : "—")}</strong>
          </>
        }
        actions={
          <Button
            component={RouterLink}
            to="/history"
            variant="outlined"
            size="small"
          >
            Trip History
          </Button>
        }
      />

      <Stack
        direction={{ xs: "column", lg: "row" }}
        spacing={2}
        sx={{
          alignItems: "stretch",
          maxWidth: "100%",
          minWidth: 0,
          ...(isDraft && { flex: 1, minHeight: 0, overflow: "auto" }),
        }}
      >
        <Stack
          spacing={2}
          sx={{
            width: { xs: "100%", lg: 320 },
            maxWidth: "100%",
            minWidth: 0,
            flexShrink: { lg: 0 },
          }}
        >
          <SectionCard>
            <RouteDetailsForm
              currentLocation={currentLocation}
              pickupLocation={pickupLocation}
              dropoffLocation={dropoffLocation}
              cycleHoursUsed={cycleHoursUsed}
              onCurrentChange={setCurrentLocation}
              onPickupChange={setPickupLocation}
              onDropoffChange={setDropoffLocation}
              onCycleChange={setCycleHoursUsed}
            />
          </SectionCard>

          <GenerateRouteButton
            disabled={!canGenerateRoute}
            submitting={submitting}
            error={submitError}
            onClick={async () => {
              setSubmitting(true);
              setSubmitError(null);
              try {
                const created = await createTripPlan({
                  currentLocation,
                  pickupLocation,
                  dropoffLocation,
                  cycleHoursUsed,
                });
                if (created.tripNo != null) {
                  navigate(tripOverviewPath(created.tripNo));
                }
              } catch (e: unknown) {
                setSubmitError(getPlanErrorMessage(e));
              } finally {
                setSubmitting(false);
              }
            }}
          />
        </Stack>

        {isDraft ? (
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <RouteMapPanel
              fillViewport
              route={displayTrip.route}
              dutyTotals={mapDutyTotals}
              dateISO={mapLogDateISO}
              pickup={displayTrip.pickup}
              dropoff={displayTrip.dropoff}
              routeProgress={selectedDaySheet ? (dayRouteProgress ?? undefined) : undefined}
              eldSegments={selectedDaySheet?.segments}
              dayRouteMode={Boolean(selectedDaySheet && dayRouteProgress)}
              dayStartLabel={dayRouteEndpoints.from}
              dayEndLabel={dayRouteEndpoints.to}
            />
          </Box>
        ) : (
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              maxWidth: "100%",
              display: "grid",
              gap: 2,
              gridTemplateColumns: { xs: "1fr", lg: "1fr minmax(0, 320px)" },
              gridTemplateRows: { xs: "auto", lg: "minmax(520px, auto) auto" },
              gridTemplateAreas: showDayDetail
                ? {
                    xs: `"map" "rightTop" "duty" "remarks"`,
                    lg: `"map rightTop" "duty remarks"`,
                  }
                : {
                    xs: `"map" "rightTop" "duty"`,
                    lg: `"map rightTop" "duty duty"`,
                  },
              alignItems: "stretch",
            }}
          >
            <Box sx={{ gridArea: "map", minWidth: 0 }}>
              <RouteMapPanel
                route={displayTrip.route}
                dutyTotals={mapDutyTotals}
                dateISO={mapLogDateISO}
                pickup={displayTrip.pickup}
                dropoff={displayTrip.dropoff}
                routeProgress={selectedDaySheet ? (dayRouteProgress ?? undefined) : undefined}
                eldSegments={selectedDaySheet?.segments}
                dayRouteMode={Boolean(selectedDaySheet && dayRouteProgress)}
                dayStartLabel={dayRouteEndpoints.from}
                dayEndLabel={dayRouteEndpoints.to}
              />
            </Box>

            <Stack
              spacing={2}
              sx={{
                gridArea: "rightTop",
                height: { lg: "100%" },
                minHeight: 0,
                minWidth: 0,
                maxWidth: "100%",
              }}
            >
              <TripLifecycleSummaryCard
                totalDistanceMi={displayTrip.totalDistanceMi}
                totalTripTimeHours={displayTrip.totalTripTimeHours}
                drivingTimeHours={displayTrip.drivingHours}
                totalDays={totalLogDays}
                overnightResetsBetweenDays={overnightResetsBetweenDays}
                breakStops={breakStops}
                fuelStops={fuelStops}
                totalStopsAll={totalStopsAll}
                estimatedArrivalText={formatDateTimeEastern(displayTrip.estimatedArrivalISO)}
              />
              {showDayDetail ? (
                <DailyStatusTotalsCard
                  dutyTotals={dailyTotalsForSidebar}
                  dayNumber={sidebarLogDayNumber}
                />
              ) : null}
            </Stack>

            <Box sx={{ gridArea: "duty", minWidth: 0, maxWidth: "100%" }}>
              <DutyStatusCard
                dutyCardRef={(el) => {
                  dutyCardRef.current = el;
                }}
                showDayLog={selectedDaySheet != null}
                tabs={
                  isSingleDayTrip ? null : (
                    <Box sx={{ borderBottom: 1, borderColor: "divider", pb: 0, mb: 0 }}>
                      <Tabs
                        value={tabValue}
                        onChange={(_, v) => {
                          if (v === "full") setLogTab("full");
                          else setLogTab(Number(v));
                        }}
                        variant="scrollable"
                        scrollButtons="auto"
                        allowScrollButtonsMobile
                        sx={{
                          width: "100%",
                          minWidth: 0,
                          minHeight: 44,
                          "& .MuiTabs-scroller": { maxWidth: "100%" },
                          "& .MuiTab-root": { minHeight: 44, textTransform: "none", fontWeight: 700 },
                        }}
                      >
                        <Tab label="Full Journey" value="full" />
                        {logSheets.map((sheet, i) => (
                          <Tab
                            key={`${sheet.dateISO}-${i}`}
                            label={`Day ${normalizedDayNumber(sheet.dayIndex, i + 1)}`}
                            value={String(i)}
                          />
                        ))}
                      </Tabs>
                    </Box>
                  )
                }
                fullJourneyLine={fullJourneyLine}
                dateISO={dayDateISO}
                totalMilesToday={dayMilesDriving}
                fromLocation={dayFromLocation}
                toLocation={dayToLocation}
                truckId={displayTrip.truckId?.trim() ? displayTrip.truckId : String(displayTrip.tripNo ?? "")}
                trailerId={displayTrip.trailerId}
                driverName={displayTrip.driverName}
                carrierName={displayTrip.carrierName}
                mainOfficeAddress={displayTrip.mainOfficeAddress}
                dutyTotals={selectedDaySheet?.dutyTotals ?? displayTrip.dutyTotals}
                segments={selectedDaySheet?.segments}
              />
            </Box>

            {showDayDetail ? (
              <Box sx={{ gridArea: "remarks", minWidth: 0, maxWidth: "100%" }}>
                <RemarksCard entries={remarkEntries} maxHeight={dutyCardHeight ?? 520} />
              </Box>
            ) : null}
          </Box>
        )}
      </Stack>
    </Stack>
  );
}
