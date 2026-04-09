import { Box, Paper, type PaperProps } from "@mui/material";
import type { SystemStyleObject } from "@mui/system";
import type { Theme } from "@mui/material/styles";
import { forwardRef } from "react";

export type SectionCardProps = Omit<PaperProps, "sx"> & {
  /**
   * Use when you need consistent inner padding across dashboard cards.
   * Defaults to a compact spacing that still feels roomy on large screens.
   */
  padded?: boolean;
  /**
   * MUI v9 has stricter `sx` typing (not all components accept `sx` arrays).
   * We intentionally accept the common, object-based `sx` here to keep this
   * reusable wrapper simple and type-safe.
   */
  sx?: SystemStyleObject<Theme>;
};

const SectionCard = forwardRef<HTMLDivElement, SectionCardProps>(function SectionCard(
  { padded = true, sx, children, ...rest },
  ref,
) {
  return (
    <Paper
      ref={ref}
      {...rest}
      sx={{
        borderRadius: 2,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: (theme) => theme.shadows[1],
        ...(sx ?? {}),
      }}
    >
      <Box
        sx={{
          p: padded ? { xs: 1.5, sm: 2 } : 0,
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </Box>
    </Paper>
  );
});

export default SectionCard;

