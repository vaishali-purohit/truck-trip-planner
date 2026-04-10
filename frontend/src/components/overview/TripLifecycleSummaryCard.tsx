import { Box, Divider, Stack, Typography } from "@mui/material";
import SectionCard from "../common/SectionCard";
import LabeledValue from "../common/LabeledValue";

export default function TripLifecycleSummaryCard({
  totalDistanceMi,
  totalTripTimeHours,
  drivingTimeHours,
  totalDays,
  overnightResetsBetweenDays,
  breakStops,
  fuelStops,
  totalStopsAll,
  estimatedArrivalText,
}: {
  totalDistanceMi: number;
  totalTripTimeHours: number;
  drivingTimeHours: number;
  totalDays: number;
  /** Count of minimum 10 h off-duty periods between consecutive driving log days (HOS-style). */
  overnightResetsBetweenDays: number;
  breakStops: number;
  fuelStops: number;
  totalStopsAll: number;
  estimatedArrivalText: string;
}) {
  return (
    <SectionCard sx={{ flex: { lg: 1 }, minHeight: 0 }}>
      <Stack spacing={1.5} sx={{ flex: 1, minHeight: 0 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, color: "primary.dark", letterSpacing: -0.2 }}>
          Trip Summary
        </Typography>
        <Divider />
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
            gap: { xs: 1.25, sm: 2 },
            columnGap: 3,
          }}
        >
          <Stack spacing={1.1}>
            <LabeledValue
              label="Distance"
              value={`${totalDistanceMi.toLocaleString(undefined, { maximumFractionDigits: 1 })} mi`}
            />
            <LabeledValue label="Total trip time" value={`${totalTripTimeHours.toFixed(1)} hrs`} />
            <LabeledValue label="Overnight resets" value={`${overnightResetsBetweenDays}`} />
            <LabeledValue label="Break stops" value={`${breakStops}`} />
          </Stack>
          <Stack spacing={1.1}>
            <LabeledValue label="Driving time" value={`${drivingTimeHours.toFixed(1)} hrs`} />
            <LabeledValue label="Total days" value={`${totalDays}`} />
            <LabeledValue label="Fuel stops" value={`${fuelStops}`} />
            <LabeledValue label="Total stops" value={`${totalStopsAll}`} />
          </Stack>
        </Box>
        <Divider />
        <LabeledValue label="Estimated arrival" value={estimatedArrivalText} />
      </Stack>
    </SectionCard>
  );
}
