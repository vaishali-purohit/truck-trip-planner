import { Chip, Stack } from "@mui/material";
import type { ComplianceStatus, TripDriverLogStatus } from "../../types/trip";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import TaskAltOutlinedIcon from "@mui/icons-material/TaskAltOutlined";
import PendingActionsOutlinedIcon from "@mui/icons-material/PendingActionsOutlined";

export interface TripStatusChipsProps {
  compliance: ComplianceStatus;
  driverLogs: TripDriverLogStatus;
}

export default function TripStatusChips({
  compliance,
  driverLogs,
}: TripStatusChipsProps) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
      {compliance === "compliant" ? (
        <Chip
          size="small"
          color="success"
          icon={<CheckCircleOutlineIcon />}
          label="Compliant"
          variant="outlined"
        />
      ) : (
        <Chip
          size="small"
          color="warning"
          icon={<WarningAmberOutlinedIcon />}
          label="Warning"
          variant="outlined"
        />
      )}

      {driverLogs === "completed" ? (
        <Chip
          size="small"
          color="primary"
          icon={<TaskAltOutlinedIcon />}
          label="Completed"
          variant="outlined"
        />
      ) : (
        <Chip
          size="small"
          color="default"
          icon={<PendingActionsOutlinedIcon />}
          label="Pending"
          variant="outlined"
        />
      )}
    </Stack>
  );
}

