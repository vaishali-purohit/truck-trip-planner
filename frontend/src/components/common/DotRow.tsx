import { Box, Stack, Typography } from "@mui/material";

export default function DotRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Box
          aria-hidden
          sx={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: color,
          }}
        />
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 700 }}>
          {label}
        </Typography>
      </Stack>
      <Typography variant="body2" sx={{ fontWeight: 900 }}>
        {value}
      </Typography>
    </Stack>
  );
}

