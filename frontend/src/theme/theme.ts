import { alpha, createTheme, responsiveFontSizes } from "@mui/material/styles";
import type { PaletteMode, Theme } from "@mui/material/styles";
export function buildTheme(mode: PaletteMode): Theme {
  const isDark = mode === "dark";

  const theme = createTheme({
    palette: {
      mode,
      primary: { main: "#2E7DFF" },
      secondary: { main: "#00BFA6" },
      success: { main: isDark ? "#22C55E" : "#16A34A" },
      warning: { main: isDark ? "#FBBF24" : "#F59E0B" },
      error: { main: isDark ? "#FB7185" : "#E11D48" },
      background: {
        default: isDark ? "#0B1220" : "#F6F8FC",
        paper: isDark ? "#0F1A2B" : "#FFFFFF",
      },
      divider: isDark ? alpha("#FFFFFF", 0.12) : alpha("#0B1220", 0.12),
      text: {
        primary: isDark ? "#E7EEF9" : "#0B1220",
        secondary: isDark ? alpha("#E7EEF9", 0.72) : alpha("#0B1220", 0.68),
      },
    },
    shape: { borderRadius: 6 },
    typography: {
      fontFamily:
        'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
      h5: { fontWeight: 700 },
      h6: { fontWeight: 700 },
      subtitle2: { fontWeight: 600 },
      button: { textTransform: "none", fontWeight: 600 },
    },
    components: {
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            border: `1px solid ${alpha(isDark ? "#FFFFFF" : "#0B1220", 0.08)}`,
            backgroundImage: "none",
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            border: `1px solid ${alpha(isDark ? "#FFFFFF" : "#0B1220", 0.08)}`,
          },
        },
      },
      MuiChip: {
        styleOverrides: { root: { fontWeight: 600 } },
      },
      MuiTableCell: {
        styleOverrides: {
          head: { fontWeight: 700 },
        },
      },
    },
  });

  return responsiveFontSizes(theme);
}

export const COLOR_MODE_STORAGE_KEY = "truckTripPlanner.colorMode";
