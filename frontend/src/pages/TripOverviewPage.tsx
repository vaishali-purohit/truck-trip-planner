import { Box, Button, Stack, Typography } from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";

import type { TripDetails } from "../types/trip";
import { createTripPlan, getTripById } from "../api/tripApi";
import SectionCard from "../components/common/SectionCard";
import PageHeader from "../components/common/PageHeader";
import RouteMapPanel from "../components/map/RouteMapPanel";
import RouteDetailsForm from "../components/overview/RouteDetailsForm";
import SystemAssumptionsCard from "../components/overview/SystemAssumptionsCard";
import GenerateRouteButton from "../components/overview/GenerateRouteButton";
import DailyStatusTotalsCard from "../components/overview/DailyStatusTotalsCard";
import TripLifecycleSummaryCard from "../components/overview/TripLifecycleSummaryCard";
import DutyStatusCard from "../components/overview/DutyStatusCard";
import RemarksCard from "../components/overview/RemarksCard";
import {
  formatDateTimeEastern,
  formatStop,
  parseStop,
} from "../utils/tripFormat";
import { formatClockEastern } from "../utils/clock";

export default function TripOverviewPage() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [trip, setTrip] = useState<TripDetails | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [currentLocation, setCurrentLocation] = useState("");
  const [pickupLocation, setPickupLocation] = useState("");
  const [dropoffLocation, setDropoffLocation] = useState("");
  const [cycleHoursUsed, setCycleHoursUsed] = useState(0);

  useEffect(() => {
    let mounted = true;
    if (!tripId) {
      setLoading(false);
      return () => {
        mounted = false;
      };
    }
    getTripById(tripId)
      .then((data) => {
        if (!mounted) return;
        setTrip(data);
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
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [tripId]);

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
      eldLogSheets: [
        {
          dateISO,
          dutyTotals: {
            offDutyHours: 0,
            sleeperBerthHours: 0,
            drivingHours: 0,
            onDutyHours: 0,
          },
          segments: [],
        },
      ],
    };
  }, [cycleHoursUsed, currentLocation, dropoffLocation, pickupLocation, trip]);

  const isDraft = trip == null;
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

  const routeLabel = useMemo(() => {
    return `${formatStop(displayTrip.pickup)} → ${formatStop(displayTrip.dropoff)}`;
  }, [displayTrip.dropoff, displayTrip.pickup]);

  const remarkEntries = useMemo(() => {
    const sheet = displayTrip.eldLogSheets?.[0];
    const segments = sheet?.segments?.length ? sheet.segments : [];
    if (!segments.length) return [];
    const loc = `${formatStop(displayTrip.pickup)} → ${formatStop(displayTrip.dropoff)}`;
    return segments
      .filter((s) => s.toHour > s.fromHour)
      .map((s) => ({
        time: formatClockEastern(s.fromHour),
        status: s.status,
        location: loc,
        description: s.label || "Duty status change",
      }));
  }, [displayTrip.dropoff, displayTrip.eldLogSheets, displayTrip.pickup]);

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

  return (
    <Stack spacing={2}>
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
            Trip ID:{" "}
            <strong>
              {isDraft ? "—" : (displayTrip.tripNo ?? displayTrip.id)}
            </strong>
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
        sx={{ alignItems: "stretch" }}
      >
        <Stack spacing={2} sx={{ width: { xs: "100%", lg: 320 } }}>
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

          <SystemAssumptionsCard />

          <GenerateRouteButton
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
                navigate(`/overview/${created.id}`);
              } catch (e: unknown) {
                setSubmitError(getPlanErrorMessage(e));
              } finally {
                setSubmitting(false);
              }
            }}
          />
        </Stack>

        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: "grid",
            gap: 2,
            gridTemplateColumns: { xs: "1fr", lg: "1fr 320px" },
            gridTemplateRows: { xs: "auto", lg: "minmax(520px, auto) auto" },
            gridTemplateAreas: {
              xs: `"map" "rightTop" "duty" "remarks"`,
              lg: `"map rightTop" "duty remarks"`,
            },
            alignItems: "stretch",
          }}
        >
          <Box sx={{ gridArea: "map", minWidth: 0 }}>
            <RouteMapPanel
              route={displayTrip.route}
              dutyTotals={
                displayTrip.eldLogSheets?.[0]?.dutyTotals ||
                displayTrip.dutyTotals
              }
              dateISO={displayTrip.dateISO}
              pickup={displayTrip.pickup}
              dropoff={displayTrip.dropoff}
            />
          </Box>

          <Stack
            spacing={2}
            sx={{
              gridArea: "rightTop",
              height: { lg: "100%" },
              minHeight: 0,
            }}
          >
            <DailyStatusTotalsCard dutyTotals={displayTrip.dutyTotals} />
            <TripLifecycleSummaryCard
              totalDistanceMi={displayTrip.totalDistanceMi}
              totalTripTimeHours={displayTrip.totalTripTimeHours}
              stopsCount={displayTrip.stopsCount}
              estimatedArrivalText={formatDateTimeEastern(displayTrip.estimatedArrivalISO)}
            />
          </Stack>

          <Box sx={{ gridArea: "duty" }}>
            <DutyStatusCard
              dutyCardRef={(el) => {
                dutyCardRef.current = el;
              }}
              routeLabel={routeLabel}
              dateISO={displayTrip.dateISO}
              totalMilesToday={displayTrip.totalMilesToday}
              truckId={displayTrip.truckId}
              trailerId={displayTrip.trailerId}
              carrierName={displayTrip.carrierName}
              mainOfficeAddress={displayTrip.mainOfficeAddress}
              dutyTotals={displayTrip.eldLogSheets?.[0]?.dutyTotals || displayTrip.dutyTotals}
              segments={displayTrip.eldLogSheets?.[0]?.segments}
            />
          </Box>

          <Box sx={{ gridArea: "remarks" }}>
            <RemarksCard entries={remarkEntries} maxHeight={dutyCardHeight ?? 520} />
          </Box>
        </Box>
      </Stack>
    </Stack>
  );
}
