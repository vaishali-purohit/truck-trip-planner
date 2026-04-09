import { Divider, Stack, Typography } from "@mui/material";
import SectionCard from "../common/SectionCard";
import DotRow from "../common/DotRow";
import type { TripDetails } from "../../types/trip";

export default function DailyStatusTotalsCard({ dutyTotals }: { dutyTotals: TripDetails["dutyTotals"] }) {
  const total =
    dutyTotals.offDutyHours + dutyTotals.sleeperBerthHours + dutyTotals.drivingHours + dutyTotals.onDutyHours;

  return (
    <SectionCard sx={{ flex: { lg: "0 0 auto" } }}>
      <Stack spacing={1.5}>
        <Typography variant="overline" sx={{ fontWeight: 900 }}>
          Daily Status Totals
        </Typography>
        <Divider />
        <Stack spacing={1.25}>
          <DotRow label="Off Duty" value={`${dutyTotals.offDutyHours.toFixed(2)} hrs`} color="#9CA3AF" />
          <DotRow label="Sleeper Berth" value={`${dutyTotals.sleeperBerthHours.toFixed(2)} hrs`} color="#3B82F6" />
          <DotRow label="Driving" value={`${dutyTotals.drivingHours.toFixed(2)} hrs`} color="#10B981" />
          <DotRow label="On Duty" value={`${dutyTotals.onDutyHours.toFixed(2)} hrs`} color="#F59E0B" />
        </Stack>
        <Divider />
        <Stack direction="row" sx={{ justifyContent: "space-between" }}>
          <Typography variant="body2" sx={{ fontWeight: 800 }}>
            Total
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 900 }}>
            {`${total.toFixed(2)} hrs`}
          </Typography>
        </Stack>
      </Stack>
    </SectionCard>
  );
}

