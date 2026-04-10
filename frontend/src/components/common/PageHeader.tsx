import { Box, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

export default function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <Stack
      direction={{ xs: "column", md: "row" }}
      spacing={1}
      sx={{ alignItems: { md: "center" }, maxWidth: "100%", minWidth: 0 }}
    >
      <Box sx={{ flex: 1, minWidth: 0, maxWidth: "100%" }}>
        <Typography variant="h5">{title}</Typography>
        {subtitle != null ? (
          <Typography variant="body2" color="text.secondary">
            {subtitle}
          </Typography>
        ) : null}
      </Box>
      {actions}
    </Stack>
  );
}

