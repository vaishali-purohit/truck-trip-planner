import { Autocomplete, Box, CircularProgress, Stack, TextField, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
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

/**
 * Editable route fields: US location autocomplete + cycle hours (clamped 0–70; Generate requires 1–69).
 */
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

      <LocationAutocomplete
        label="Current Location"
        value={currentLocation}
        onChange={onCurrentChange}
      />
      <LocationAutocomplete
        label="Pickup Location"
        value={pickupLocation}
        onChange={onPickupChange}
      />
      <LocationAutocomplete
        label="Drop-off Location"
        value={dropoffLocation}
        onChange={onDropoffChange}
      />

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
  const activeRequestId = useRef(0);

  const optionLabels = useMemo(() => {
    return Array.from(new Set(options.map((o) => o.label).filter(Boolean)));
  }, [options]);

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
        setOptions(results);
      } finally {
        if (activeRequestId.current === requestId) setLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(handle);
  }, [value]);

  return (
    <Autocomplete
      freeSolo
      options={optionLabels}
      loading={loading}
      inputValue={value}
      onInputChange={(_, newInput) => onChange(newInput)}
      onChange={(_, newValue) => {
        if (typeof newValue === "string") onChange(newValue);
      }}
      renderInput={(params) => (
        (() => {
          const p = params as unknown as {
            slotProps?: { input?: { endAdornment?: ReactNode } };
            InputProps?: { endAdornment?: ReactNode };
          };
          return (
        <TextField
          {...params}
          label={label}
          size="small"
          sx={FIELD_SX}
          slotProps={{
            ...p.slotProps,
            input: {
              ...(p.slotProps?.input ?? {}),
              endAdornment: (
                <>
                  {loading ? <CircularProgress color="inherit" size={16} /> : null}
                  {(p.slotProps?.input?.endAdornment ?? p.InputProps?.endAdornment) || null}
                </>
              ),
            },
          }}
        />
          );
        })()
      )}
    />
  );
}
