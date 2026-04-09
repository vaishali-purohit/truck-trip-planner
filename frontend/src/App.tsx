import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import type { PaletteMode } from "@mui/material/styles";
import { Box, Button, Typography } from "@mui/material";

import AppLayout from "./components/layout/AppLayout";
import TripHistoryPage from "./pages/TripHistoryPage";
import TripOverviewPage from "./pages/TripOverviewPage";
import TripLogsPage from "./pages/TripLogsPage";

export interface AppProps {
  colorMode: PaletteMode;
  onToggleColorMode: () => void;
}

function NotFound() {
  return (
    <Box>
      <Typography variant="h5">Page not found</Typography>
      <Button component="a" href="/history" sx={{ mt: 1.5 }} variant="outlined">
        Go to Trip History
      </Button>
    </Box>
  );
}

export default function App({ colorMode, onToggleColorMode }: AppProps) {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/overview" replace />} />

        <Route
          path="/history"
          element={
            <AppLayout colorMode={colorMode} onToggleColorMode={onToggleColorMode}>
              <TripHistoryPage />
            </AppLayout>
          }
        />

        <Route
          path="/overview"
          element={
            <AppLayout colorMode={colorMode} onToggleColorMode={onToggleColorMode}>
              <TripOverviewPage />
            </AppLayout>
          }
        />

        <Route
          path="/overview/:tripId"
          element={
            <AppLayout colorMode={colorMode} onToggleColorMode={onToggleColorMode}>
              <TripOverviewPage />
            </AppLayout>
          }
        />

        <Route
          path="/overview/:tripId/logs"
          element={
            <AppLayout colorMode={colorMode} onToggleColorMode={onToggleColorMode}>
              <TripLogsPage />
            </AppLayout>
          }
        />

        <Route
          path="*"
          element={
            <AppLayout colorMode={colorMode} onToggleColorMode={onToggleColorMode}>
              <NotFound />
            </AppLayout>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
