import { Box, Button, Divider, Stack, Typography } from "@mui/material";
import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";

import type { TripDetails } from "../types/trip";
import { getTripByTripNo } from "../api/tripApi";
import SectionCard from "../components/common/SectionCard";
import PageHeader from "../components/common/PageHeader";
import EldDutyGraph from "../components/overview/EldDutyGraph";
import RemarksTimeline, { type RemarkEntry } from "../components/overview/RemarksTimeline";
import { formatStop } from "../utils/tripFormat";
import { formatClockShort } from "../utils/clock";
import { eldSheetFromToLabels } from "../utils/tripEldEndpoints";
import { formatFullJourneyLine, formatLocationAlongFractionRangeWindow } from "../utils/tripRoutePlace";
import { globalRouteFractionForClockHour } from "../utils/routeDutyGeometry";
import { parseTripNoParam, tripOverviewPath } from "../utils/tripRoutes";

export default function TripLogsPage() {
  const { tripNo: tripNoParam } = useParams();
  const [loading, setLoading] = useState(true);
  const [trip, setTrip] = useState<TripDetails | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const routeTripNo = useMemo(() => parseTripNoParam(tripNoParam), [tripNoParam]);
  const invalidTripNoInUrl =
    tripNoParam != null && tripNoParam !== "" && routeTripNo == null;

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

    queueMicrotask(() => {
      if (!mounted) return;
      setLoading(true);
    });
    getTripByTripNo(routeTripNo)
      .then((data) => {
        if (!mounted) return;
        setTrip(data);
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

  const remarkEntries: RemarkEntry[] = useMemo(() => {
    if (!trip) return [];
    const fallbackLoc = `${formatStop(trip.pickup)} → ${formatStop(trip.dropoff)}`;
    const sheets = trip.eldLogSheets?.length ? trip.eldLogSheets : [];
    const dist = Number(trip.totalDistanceMi) || 0;
    const tripH = Number(trip.drivingHours) || 0;
    const out: RemarkEntry[] = [];
    sheets.forEach((sheet, sheetIdx) => {
      const dayStamp = new Date(sheet.dateISO + "T12:00:00").toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
      const segments = sheet.segments?.filter((s) => s.toHour > s.fromHour) ?? [];
      const { from: dayFrom, to: dayTo, range } = eldSheetFromToLabels(
        sheet,
        sheetIdx,
        sheets,
        trip.pickup,
        trip.dropoff,
        dist,
        tripH,
      );
      const segs = sheet.segments ?? [];
      for (const s of segments) {
        const midHour = (s.fromHour + s.toHour) / 2;
        const apiLoc = typeof s.location === "string" ? s.location.trim() : "";
        const routeLoc =
          apiLoc
            ? apiLoc
            : segs.length > 0
              ? formatLocationAlongFractionRangeWindow(
                  globalRouteFractionForClockHour(segs, midHour, range),
                  range,
                  dayFrom,
                  dayTo,
                )
              : fallbackLoc;
        out.push({
          time: `${dayStamp} · ${formatClockShort(s.fromHour)}`,
          status: s.status,
          location: routeLoc,
          description: s.label || "Duty status change",
        });
      }
    });
    return out;
  }, [trip]);

  if (loading) {
    return (
      <Typography variant="body2" color="text.secondary">
        Loading driver logs…
      </Typography>
    );
  }

  if (invalidTripNoInUrl) {
    return (
      <Typography variant="body2" color="text.secondary">
        Invalid trip number in the URL. Open Trip History and use a valid trip link (for example{" "}
        <strong>{tripOverviewPath(1900)}/logs</strong>).
      </Typography>
    );
  }

  if (fetchError || !trip) {
    return (
      <Typography variant="body2" color="text.secondary">
        {fetchError ?? "Missing trip number."}
      </Typography>
    );
  }

  const sheets = trip.eldLogSheets?.length ? trip.eldLogSheets : [{ dateISO: trip.dateISO, dutyTotals: trip.dutyTotals }];
  const dist = Number(trip.totalDistanceMi) || 0;
  const tripH = Number(trip.drivingHours) || 0;

  return (
    <Stack spacing={2} sx={{ maxWidth: "100%", minWidth: 0 }}>
      <PageHeader
        title="Driver Logs"
        subtitle={
          <>
            Trip No.: <strong>{trip.tripNo != null ? String(trip.tripNo) : "—"}</strong> •{" "}
            {formatFullJourneyLine(trip.pickup, trip.dropoff)}
          </>
        }
        actions={
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
            <Button
              component={RouterLink}
              to={trip.tripNo != null ? tripOverviewPath(trip.tripNo) : "/overview"}
              variant="outlined"
              size="small"
              startIcon={<ArrowBackOutlinedIcon />}
            >
              Back to Overview
            </Button>
            <Button component={RouterLink} to="/history" variant="outlined" size="small">
              Trip History
            </Button>
          </Stack>
        }
      />

      {sheets.map((sheet, idx) => {
        const { from: dayFrom, to: dayTo } = eldSheetFromToLabels(
          sheet,
          idx,
          sheets,
          trip.pickup,
          trip.dropoff,
          dist,
          tripH,
        );
        return (
          <SectionCard key={`${sheet.dateISO}-${idx}`}>
            <Stack spacing={1.5}>
              <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>
                Record of Duty Status (24-hour) — {new Date(sheet.dateISO + "T00:00:00").toDateString()}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                From: {dayFrom}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                To: {dayTo}
              </Typography>
              <Divider />
              <EldDutyGraph dutyTotals={sheet.dutyTotals} segments={sheet.segments} />
            </Stack>
          </SectionCard>
        );
      })}

      <SectionCard>
        <Stack spacing={1.5} sx={{ minHeight: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>
            Remarks &amp; Duty Changes
          </Typography>
          <Divider />
          <Box
            sx={{
              overflowY: "auto",
              maxHeight: { xs: 420, md: 520 },
              pr: 0.5,
            }}
          >
            <RemarksTimeline entries={remarkEntries} />
          </Box>
        </Stack>
      </SectionCard>
    </Stack>
  );
}
