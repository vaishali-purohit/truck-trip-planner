import {
  Box,
  CircularProgress,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { searchLocations, type LocationSuggestion } from "../../api/locationApi";

const FIELD_SX = {
  "& .MuiOutlinedInput-root": {
    borderRadius: 1,
  },
} as const;

export interface RouteDetailsFormProps {
  currentLocation: string;
  pickupLocation: string;
  dropoffLocation: string;
  cycleHoursUsed: number;
  onCurrentChange: (v: string) => void;
  onPickupChange: (v: string) => void;
  onDropoffChange: (v: string) => void;
  onCycleChange: (v: number) => void;
}

export default function RouteDetailsForm({
  currentLocation,
  pickupLocation,
  dropoffLocation,
  cycleHoursUsed,
  onCurrentChange,
  onPickupChange,
  onDropoffChange,
  onCycleChange,
}: RouteDetailsFormProps) {
  return (
    <Stack spacing={1.25}>
      <Typography variant="overline" sx={{ fontWeight: 900 }}>
        Route Details
      </Typography>

      <LocationAutocomplete label="Current Location" value={currentLocation} onChange={onCurrentChange} />
      <LocationAutocomplete label="Pickup Location" value={pickupLocation} onChange={onPickupChange} />
      <LocationAutocomplete label="Drop-off Location" value={dropoffLocation} onChange={onDropoffChange} />

      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
          Current Cycle Used (Hours)
        </Typography>
        <TextField
          type="number"
          size="small"
          fullWidth
          value={cycleHoursUsed}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") {
              onCycleChange(0);
              return;
            }
            const raw = parseFloat(v);
            if (Number.isNaN(raw)) return;
            onCycleChange(Math.min(70, Math.max(0, raw)));
          }}
          slotProps={{
            htmlInput: { min: 0, max: 70, step: 0.1 },
          }}
          helperText="Max 70 hrs (70-hour / 8-day rule)"
          sx={FIELD_SX}
        />
      </Box>
    </Stack>
  );
}

function LocationAutocomplete({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [options, setOptions] = useState<LocationSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const activeRequestId = useRef(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const q = value.trim();
    if (!q) {
      setOptions([]);
      setLoading(false);
      return;
    }

    const handle = window.setTimeout(async () => {
      const requestId = ++activeRequestId.current;
      setLoading(true);
      try {
        const results = await searchLocations(q, 8);
        if (activeRequestId.current !== requestId) return;
        setOptions(Array.isArray(results) ? results : []);
      } catch {
        if (activeRequestId.current !== requestId) return;
        setOptions([]);
      } finally {
        if (activeRequestId.current === requestId) setLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(handle);
  }, [value]);

  const showList = open && options.length > 0;

  return (
    <Box
      sx={{ position: "relative" }}
      onMouseDown={(e) => {
        // Keep focus on input when clicking the list (avoid blur-before-click).
        const t = e.target as HTMLElement;
        if (t.closest("[data-location-suggestion]")) e.preventDefault();
      }}
    >
      <TextField
        label={label}
        size="small"
        fullWidth
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (blurTimer.current) {
            clearTimeout(blurTimer.current);
            blurTimer.current = null;
          }
          setOpen(true);
        }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 150);
        }}
        slotProps={{
          input: {
            endAdornment: loading ? <CircularProgress color="inherit" size={16} /> : null,
          },
        }}
        sx={FIELD_SX}
      />
      {showList ? (
        <Paper
          elevation={4}
          sx={{
            position: "absolute",
            left: 0,
            right: 0,
            zIndex: 20,
            mt: 0.5,
            maxHeight: 260,
            overflow: "auto",
          }}
        >
          <List dense disablePadding>
            {options.map((o, i) => (
              <ListItemButton
                key={`${o.label}-${i}`}
                data-location-suggestion
                onClick={() => {
                  onChange(o.label);
                  setOpen(false);
                }}
              >
                <ListItemText primary={o.label} />
              </ListItemButton>
            ))}
          </List>
        </Paper>
      ) : null}
    </Box>
  );
}
