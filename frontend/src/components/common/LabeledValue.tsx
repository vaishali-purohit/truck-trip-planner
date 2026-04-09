import { Stack, Typography } from "@mui/material";

export interface LabeledValueProps {
  label: string;
  value: React.ReactNode;
  align?: "left" | "right";
}

export default function LabeledValue({
  label,
  value,
  align = "left",
}: LabeledValueProps) {
  return (
    <Stack spacing={0.25} sx={{ textAlign: align }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>
        {value}
      </Typography>
    </Stack>
  );
}

