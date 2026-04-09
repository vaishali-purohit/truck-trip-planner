import {
  AppBar,
  Box,
  Container,
  IconButton,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import { memo, useEffect, useMemo, useState } from "react";

import type { PaletteMode } from "@mui/material/styles";
import { TIME_ZONE_EASTERN, TIME_ZONE_UTC } from "../../utils/timeZones";

/** Horizontal inset for toolbar and main (theme spacing units). */
const LAYOUT_GUTTER_PX = { xs: 2, sm: 2.5, md: 3 };

export interface AppLayoutProps {
  colorMode: PaletteMode;
  onToggleColorMode: () => void;
  children: React.ReactNode;
}

const HeaderClock = memo(function HeaderClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const timeText = useMemo(() => {
    const usTime = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      timeZone: TIME_ZONE_EASTERN,
      timeZoneName: "short",
    }).format(now);

    const gmtTime = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      timeZone: TIME_ZONE_UTC,
      timeZoneName: "short",
    }).format(now);

    return { usTime, gmtTime };
  }, [now]);

  return (
    <Box sx={{ display: { xs: "none", sm: "block" } }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.2, textAlign: "right" }}>
        US (ET): <strong>{timeText.usTime}</strong>
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.2, textAlign: "right" }}>
        GMT: <strong>{timeText.gmtTime}</strong>
      </Typography>
    </Box>
  );
});

export default function AppLayout({
  colorMode,
  onToggleColorMode,
  children,
}: AppLayoutProps) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <AppBar
        position="sticky"
        color="inherit"
        elevation={0}
        sx={(t) => ({
          borderBottom: `1px solid ${t.palette.divider}`,
          backgroundColor: t.palette.background.paper,
        })}
      >
        <Toolbar
          disableGutters
          sx={{
            minHeight: { xs: 56, sm: 64 },
            px: LAYOUT_GUTTER_PX,
            gap: 2,
          }}
        >
          <Container
            maxWidth={false}
            disableGutters
            sx={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 2,
            }}
          >
            <Stack
              direction="row"
              spacing={1.25}
              sx={{ alignItems: "center", flexShrink: 0 }}
            >
              <Box
                aria-hidden
                sx={(t) => ({
                  width: 36,
                  height: 36,
                  borderRadius: 1,
                  background: `linear-gradient(135deg, ${t.palette.primary.main}, ${t.palette.secondary.main})`,
                })}
              />
              <Box>
                <Typography
                  component="span"
                  variant="subtitle1"
                  sx={{ fontWeight: 800, display: "block", lineHeight: 1.2 }}
                >
                  Spotter ELD
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", lineHeight: 1.2 }}
                >
                  Trip Planner &amp; Compliance
                </Typography>
              </Box>
            </Stack>

            <Box sx={{ flex: 1 }} />

            <HeaderClock />

            <Tooltip title={colorMode === "dark" ? "Light mode" : "Dark mode"}>
              <IconButton
                onClick={onToggleColorMode}
                aria-label="Toggle color mode"
                size="small"
              >
                {colorMode === "dark" ?
                  <LightModeOutlinedIcon />
                : <DarkModeOutlinedIcon />}
              </IconButton>
            </Tooltip>
          </Container>
        </Toolbar>
      </AppBar>

      <Box
        component="main"
        sx={{
          flex: 1,
          px: LAYOUT_GUTTER_PX,
          py: { xs: 2.5, sm: 3.5 },
          backgroundColor: "background.default",
        }}
      >
        <Container maxWidth={false} disableGutters sx={{ width: "100%" }}>
          {children}
        </Container>
      </Box>
    </Box>
  );
}
