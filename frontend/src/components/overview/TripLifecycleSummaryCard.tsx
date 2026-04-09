import { Divider, Stack, Typography } from "@mui/material";
import SectionCard from "../common/SectionCard";
import LabeledValue from "../common/LabeledValue";

export default function TripLifecycleSummaryCard({
  totalDistanceMi,
  totalTripTimeHours,
  stopsCount,
  estimatedArrivalText,
}: {
  totalDistanceMi: number;
  totalTripTimeHours: number;
  stopsCount: number;
  estimatedArrivalText: string;
}) {
  return (
    <SectionCard sx={{ flex: { lg: 1 }, minHeight: 0 }}>
      <Stack spacing={1.5} sx={{ flex: 1, minHeight: 0 }}>
        <Typography variant="overline" sx={{ fontWeight: 900 }}>
          Trip Lifecycle Summary
        </Typography>
        <Divider />
        <Stack spacing={1}>
          <LabeledValue label="Distance" value={`${totalDistanceMi.toFixed(1)} miles`} />
          <LabeledValue label="Total Trip Time" value={`${totalTripTimeHours.toFixed(1)} hrs`} />
          <LabeledValue label="Rest Stops" value={`${stopsCount}`} />
          <LabeledValue label="Estimated Arrival" value={estimatedArrivalText} />
        </Stack>
      </Stack>
    </SectionCard>
  );
}

