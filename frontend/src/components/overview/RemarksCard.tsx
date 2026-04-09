import { Box, Divider, Stack, Typography } from "@mui/material";
import SectionCard from "../common/SectionCard";
import RemarksTimeline, { type RemarkEntry } from "./RemarksTimeline";

export default function RemarksCard({
  entries,
  maxHeight,
}: {
  entries: RemarkEntry[];
  maxHeight: number;
}) {
  return (
    <SectionCard
      sx={{
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <Box
        sx={(t) => ({
          maxHeight,
          overflowY: "auto",
          backgroundColor: t.palette.background.paper,
          position: "relative",
          isolation: "isolate",
        })}
      >
        <Stack
          spacing={1.5}
          sx={(t) => ({
            position: "sticky",
            top: 0,
            zIndex: 10,
            backgroundColor: t.palette.background.paper,
            opacity: 1,
            pt: 0,
            pb: 0,
          })}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>
            Remarks &amp; Duty Changes
          </Typography>
          <Divider />
        </Stack>

        <Box sx={{ pr: 0.5, pt: 1.5, position: "relative", zIndex: 0 }}>
          <RemarksTimeline entries={entries} />
        </Box>
      </Box>
    </SectionCard>
  );
}

