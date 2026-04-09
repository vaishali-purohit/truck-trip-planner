import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import type { PaletteMode } from "@mui/material/styles";
import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Stack, Typography } from "@mui/material";

import App from "../App";
import { buildTheme, COLOR_MODE_STORAGE_KEY } from "./theme";
import { envErrors } from "../config/env";

/**
 * ThemeRoot is separated from `main.tsx` so Fast Refresh can correctly
 * track exports in the entry file (eslint `react-refresh/only-export-components`).
 */
export default function ThemeRoot() {
  const [mode, setMode] = useState<PaletteMode>(() => {
    const saved = localStorage.getItem(COLOR_MODE_STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches
      ? "dark"
      : "light";
  });

  useEffect(() => {
    localStorage.setItem(COLOR_MODE_STORAGE_KEY, mode);
  }, [mode]);

  const theme = useMemo(() => buildTheme(mode), [mode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {envErrors.length ? (
        <Box sx={{ p: 3 }}>
          <Stack spacing={2} sx={{ maxWidth: 720 }}>
            <Typography variant="h5" sx={{ fontWeight: 900 }}>
              App misconfigured
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Fix the environment variables below, then reload.
            </Typography>
            <Alert severity="error">
              <Stack spacing={0.5}>
                {envErrors.map((e) => (
                  <Typography key={e} variant="body2">
                    {e}
                  </Typography>
                ))}
              </Stack>
            </Alert>
          </Stack>
        </Box>
      ) : (
        <App
          colorMode={mode}
          onToggleColorMode={() =>
            setMode((prev) => (prev === "dark" ? "light" : "dark"))
          }
        />
      )}
    </ThemeProvider>
  );
}

