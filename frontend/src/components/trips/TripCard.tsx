import {
  Box,
  Button,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { useNavigate } from "react-router-dom";

import type { TripSummary } from "../../types/trip";
import SectionCard from "../common/SectionCard";
import LabeledValue from "../common/LabeledValue";
import TripStatusChips from "./TripStatusChips";
import { getTripById } from "../../api/tripApi";
import { exportTripPdf } from "../../utils/exportTripPdf";
import { formatDateISOShort, formatStop } from "../../utils/tripFormat";

export interface TripCardProps {
  trip: TripSummary;
  onViewDetails: (id: string) => void;
}

export default function TripCard({ trip, onViewDetails }: TripCardProps) {
  const navigate = useNavigate();
  return (
    <SectionCard padded sx={{ boxShadow: 1 }}>
      <Stack spacing={1.25}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "1fr 1fr",
              md: "1.1fr 1fr 1fr 1.2fr auto",
            },
            gap: 1,
            alignItems: "center",
          }}
        >
          <Box>
            <Typography variant="overline" color="text.secondary">
              Trip ID
            </Typography>
            <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>
              {trip.tripNo ?? trip.id}
            </Typography>
          </Box>

          <Box>
            <Typography variant="overline" color="text.secondary">
              Date
            </Typography>
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
              {formatDateISOShort(trip.dateISO)}
            </Typography>
          </Box>

          <Box>
            <Typography variant="overline" color="text.secondary">
              Driver
            </Typography>
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
              {trip.driverName}
            </Typography>
          </Box>

          <Box>
            <Typography variant="overline" color="text.secondary">
              Truck / Trailer
            </Typography>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <LocalShippingOutlinedIcon fontSize="small" color="action" />
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                {trip.truckId}
                {trip.trailerId ? ` / ${trip.trailerId}` : ""}
              </Typography>
            </Stack>
          </Box>

          <Box sx={{ justifySelf: { md: "end" } }}>
            <TripStatusChips compliance={trip.compliance} driverLogs={trip.driverLogs} />
          </Box>
        </Box>

        <Divider />

        <Stack
          direction={{ xs: "column", lg: "row" }}
          spacing={{ xs: 1.25, lg: 2 }}
          sx={{ alignItems: { lg: "center" } }}
        >
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ flex: 1 }}>
            <Stack direction="row" spacing={1} sx={{ flex: 1, alignItems: "flex-start" }}>
              <PlaceOutlinedIcon fontSize="small" color="action" />
              <LabeledValue label="Pickup location" value={formatStop(trip.pickup)} />
            </Stack>
            <Stack direction="row" spacing={1} sx={{ flex: 1, alignItems: "flex-start" }}>
              <PlaceOutlinedIcon fontSize="small" color="action" />
              <LabeledValue label="Drop-off location" value={formatStop(trip.dropoff)} />
            </Stack>
          </Stack>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr 1fr 1fr" },
              columnGap: { xs: 1.5, sm: 3 },
              rowGap: 0.5,
              minWidth: { lg: 420 },
            }}
          >
            <LabeledValue label="Total distance" value={`${trip.totalDistanceMi.toFixed(1)} mi`} />
            <LabeledValue label="Driving hours" value={`${trip.drivingHours.toFixed(2)} hrs`} />
            <LabeledValue
              label="Total trip time"
              value={`${trip.totalTripTimeHours.toFixed(1)} hrs`}
              align="right"
            />
          </Box>
        </Stack>

        <Divider />

        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          sx={{ alignItems: { sm: "center" } }}
        >
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
            <Button
              size="small"
              startIcon={<VisibilityOutlinedIcon />}
              variant="contained"
              onClick={() => onViewDetails(trip.id)}
            >
              View Details
            </Button>

            <Button
              size="small"
              startIcon={<DescriptionOutlinedIcon />}
              variant="outlined"
              onClick={() => navigate(`/overview/${trip.id}/logs`)}
            >
              View Driver Logs
            </Button>
            <Button
              size="small"
              startIcon={<PictureAsPdfOutlinedIcon />}
              variant="outlined"
              onClick={async () => {
                const details = await getTripById(trip.id);
                await exportTripPdf(details);
              }}
            >
              Export PDF
            </Button>
          </Stack>
        </Stack>
      </Stack>
    </SectionCard>
  );
}

