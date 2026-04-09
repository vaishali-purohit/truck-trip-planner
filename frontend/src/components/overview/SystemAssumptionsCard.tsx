import { Divider, Stack, Typography } from "@mui/material";
import SectionCard from "../common/SectionCard";

export default function SystemAssumptionsCard() {
  return (
    <SectionCard>
      <Stack spacing={1.5}>
        <Typography variant="overline" sx={{ fontWeight: 900 }}>
          System Assumptions
        </Typography>
        <Divider />
        <Typography variant="body2" color="text.secondary">
          • Property carrying driver rules apply
          <br />• 70 hrs / 8 day cycle selected
          <br />• Fuel stop scheduled every 1000 miles
          <br />• 1 hour allocated for pickup/drop-off
        </Typography>
      </Stack>
    </SectionCard>
  );
}

