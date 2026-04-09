import { Box, Button, Divider, Stack, Typography } from "@mui/material";
import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";

import type { EldLogSegment, TripDetails } from "../types/trip";
import { getTripById } from "../api/tripApi";
import SectionCard from "../components/common/SectionCard";
import PageHeader from "../components/common/PageHeader";
import EldDutyGraph from "../components/overview/EldDutyGraph";
import RemarksTimeline, { type RemarkEntry } from "../components/overview/RemarksTimeline";
import { formatStop } from "../utils/tripFormat";
import { formatClockEastern } from "../utils/clock";

export default function TripLogsPage() {
  const { tripId } = useParams();
  const [loading, setLoading] = useState(true);
  const [trip, setTrip] = useState<TripDetails | null>(null);

  useEffect(() => {
    if (!tripId) {
      setLoading(false);
      setTrip(null);
      return;
    }
    let mounted = true;
    queueMicrotask(() => {
      if (!mounted) return;
      setLoading(true);
    });
    getTripById(tripId)
      .then((data) => {
        if (!mounted) return;
        setTrip(data);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [tripId]);

  const remarkEntries: RemarkEntry[] = useMemo(() => {
    if (!trip) return [];
    const firstSheet = trip.eldLogSheets?.[0];
    const segments: EldLogSegment[] = firstSheet?.segments?.length ? firstSheet.segments : [];
    if (!segments.length) return [];
    const loc = `${formatStop(trip.pickup)} → ${formatStop(trip.dropoff)}`;
    return segments
      .filter((s) => s.toHour > s.fromHour)
      .map((s) => ({
        time: formatClockEastern(s.fromHour),
        status: s.status,
        location: loc,
        description: s.label || "Duty status change",
      }));
  }, [trip]);

  if (loading) {
    return (
      <Typography variant="body2" color="text.secondary">
        Loading driver logs…
      </Typography>
    );
  }

  if (!trip) {
    return (
      <Typography variant="body2" color="text.secondary">
        {tripId ? "Trip not found." : "Missing trip id."}
      </Typography>
    );
  }

  const sheets = trip.eldLogSheets?.length ? trip.eldLogSheets : [{ dateISO: trip.dateISO, dutyTotals: trip.dutyTotals }];

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Driver Logs"
        subtitle={
          <>
            Trip ID: <strong>{trip.tripNo ?? trip.id}</strong> • {formatStop(trip.pickup)} → {formatStop(trip.dropoff)}
          </>
        }
        actions={
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
            <Button
              component={RouterLink}
              to={`/overview/${trip.id}`}
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

      {sheets.map((sheet, idx) => (
        <SectionCard key={`${sheet.dateISO}-${idx}`}>
          <Stack spacing={1.5}>
            <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>
              Record of Duty Status (24-hour) — {new Date(sheet.dateISO + "T00:00:00").toDateString()}
            </Typography>
            <Divider />
            <EldDutyGraph dutyTotals={sheet.dutyTotals} segments={sheet.segments} />
          </Stack>
        </SectionCard>
      ))}

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
