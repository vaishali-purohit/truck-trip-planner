import { Box, Chip, Stack, Typography } from "@mui/material";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";

export interface RemarkEntry {
  time: string;
  status: "Off Duty" | "Sleeper" | "Driving" | "On Duty";
  location: string;
  description: string;
}

const STATUS_COLOR: Record<RemarkEntry["status"], "default" | "success" | "warning" | "info"> = {
  "Off Duty": "default",
  Sleeper: "info",
  Driving: "success",
  "On Duty": "warning",
};

/** Fixed gutter (px): rail + dots live here only; all text stays to the right. */
const TIMELINE_GUTTER_PX = 22;
const RAIL_W_PX = 2;
const DOT_PX = 10;
const RAIL_LEFT_PX = (TIMELINE_GUTTER_PX - RAIL_W_PX) / 2;

export interface RemarksTimelineProps {
  entries: RemarkEntry[];
}

/**
 * Vertical timeline: rail in the left gutter, dots centered on the rail, copy in a separate column so nothing overlaps.
 */
export default function RemarksTimeline({ entries }: RemarksTimelineProps) {
  return (
    <Box
      sx={{
        position: "relative",
        pr: 0.5,
        pt: 0.5,
        pb: 0.5,
      }}
    >
      <Box
        aria-hidden
        sx={(t) => ({
          position: "absolute",
          left: RAIL_LEFT_PX,
          top: 14,
          bottom: 14,
          width: RAIL_W_PX,
          borderRadius: 1,
          bgcolor: t.palette.divider,
          zIndex: 0,
        })}
      />

      <Stack spacing={0} sx={{ position: "relative", zIndex: 1 }}>
        {entries.map((e, idx) => (
          <Stack
            key={idx}
            direction="row"
            spacing={1.5}
            sx={{
              alignItems: "flex-start",
              pb: idx < entries.length - 1 ? 2.5 : 0,
            }}
          >
            <Box
              sx={{
                width: TIMELINE_GUTTER_PX,
                flexShrink: 0,
                position: "relative",
                minHeight: DOT_PX + 4,
              }}
            >
              <Box
                sx={(t) => ({
                  position: "absolute",
                  left: "50%",
                  top: 10,
                  width: DOT_PX,
                  height: DOT_PX,
                  marginLeft: `${-DOT_PX / 2}px`,
                  borderRadius: "50%",
                  bgcolor: t.palette.primary.main,
                  border: `2px solid ${t.palette.background.paper}`,
                  boxShadow: `0 0 0 1px ${t.palette.divider}`,
                  zIndex: 2,
                })}
              />
            </Box>

            <Box sx={{ flex: 1, minWidth: 0, pt: 0 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, display: "block" }}>
                {e.time}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", mt: 0.5 }}>
                <Chip size="small" label={e.status} color={STATUS_COLOR[e.status]} variant="outlined" />
                <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                  <PlaceOutlinedIcon sx={{ fontSize: 16 }} color="action" />
                  <Typography variant="body2" color="text.secondary">
                    {e.location}
                  </Typography>
                </Stack>
              </Stack>
              <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.5 }}>
                {e.description}
              </Typography>
            </Box>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
