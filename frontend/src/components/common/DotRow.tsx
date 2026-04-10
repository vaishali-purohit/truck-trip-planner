import { Box, Stack, Typography } from "@mui/material";

export default function DotRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ alignItems: "center", justifyContent: "space-between", width: "100%", minWidth: 0 }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0, flex: 1 }}>
        <Box
          aria-hidden
          sx={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: color,
            flexShrink: 0,
          }}
        />
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}
        >
          {label}
        </Typography>
      </Stack>
      <Typography variant="body2" sx={{ fontWeight: 900, flexShrink: 0, whiteSpace: "nowrap" }}>
        {value}
      </Typography>
    </Stack>
  );
}

