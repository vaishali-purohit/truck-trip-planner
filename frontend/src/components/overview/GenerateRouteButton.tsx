import { Alert, Button } from "@mui/material";
import RouteOutlinedIcon from "@mui/icons-material/RouteOutlined";

export interface GenerateRouteButtonProps {
  disabled?: boolean;
  submitting?: boolean;
  error?: string | null;
  onClick: () => void | Promise<void>;
}

export default function GenerateRouteButton({ disabled, submitting, error, onClick }: GenerateRouteButtonProps) {
  return (
    <>
      <Button
        variant="contained"
        startIcon={<RouteOutlinedIcon />}
        sx={{ alignSelf: "stretch", mt: 0.5 }}
        disabled={Boolean(disabled) || Boolean(submitting)}
        onClick={onClick}
      >
        {submitting ? "Planning…" : "Generate Route & HOS Logs"}
      </Button>

      {error ? (
        <Alert severity="error" sx={{ mt: 1 }}>
          {error}
        </Alert>
      ) : null}
    </>
  );
}

