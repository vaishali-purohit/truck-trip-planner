import { Box, Button, Divider, Stack, Typography } from "@mui/material";
import SectionCard from "../common/SectionCard";
import LabeledValue from "../common/LabeledValue";
import EldDutyGraph from "./EldDutyGraph";
import type { EldLogSegment, TripDetails } from "../../types/trip";

function InfoGridCell({ label, value }: { label: string; value: string }) {
  return <LabeledValue label={label} value={value} />;
}

export interface DutyStatusCardProps {
  dutyCardRef?: (el: HTMLDivElement | null) => void;
  routeLabel: string;
  dateISO: string;
  totalMilesToday: number;
  truckId: string;
  trailerId?: string | null;
  carrierName: string;
  mainOfficeAddress: string;
  dutyTotals: TripDetails["dutyTotals"];
  segments?: EldLogSegment[];
}

export default function DutyStatusCard({
  dutyCardRef,
  routeLabel,
  dateISO,
  totalMilesToday,
  truckId,
  trailerId,
  carrierName,
  mainOfficeAddress,
  dutyTotals,
  segments,
}: DutyStatusCardProps) {
  return (
    <SectionCard
      ref={dutyCardRef}
      sx={{
        alignSelf: { lg: "start" },
      }}
    >
      <Stack spacing={2} sx={{ minHeight: 0 }}>
        <Stack
          direction="row"
          sx={{
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 1,
            rowGap: 0.5,
          }}
        >
          <Stack
            direction="row"
            spacing={1}
            sx={{
              flexWrap: "wrap",
              alignItems: "baseline",
              columnGap: 1,
              rowGap: 0.25,
              flex: 1,
              minWidth: 0,
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 900, flexShrink: 0 }}>
              Record of Duty Status
            </Typography>
            <Typography
              component="span"
              variant="body2"
              sx={{
                fontWeight: 700,
                color: "text.primary",
                minWidth: 0,
                whiteSpace: { xs: "normal", sm: "nowrap" },
                overflow: { sm: "hidden" },
                textOverflow: { sm: "ellipsis" },
              }}
              title={routeLabel}
            >
              {routeLabel}
            </Typography>
          </Stack>
          <Button
            variant="outlined"
            size="small"
            sx={{ flexShrink: 0 }}
            onClick={() =>
              document.getElementById("eld-duty-graph")?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              })
            }
          >
            24-Hour Graph
          </Button>
        </Stack>
        <Divider />

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, 1fr)",
              md: "repeat(3, 1fr)",
            },
            gap: 2,
          }}
        >
          <InfoGridCell label="Date" value={new Date(dateISO + "T00:00:00").toDateString()} />
          <InfoGridCell label="Total Miles Driving Today" value={totalMilesToday.toFixed(1)} />
          <InfoGridCell
            label="Truck / Trailer Number"
            value={`${truckId}${trailerId ? ` / ${trailerId}` : ""}`}
          />
          <InfoGridCell label="Carrier Name" value={carrierName} />
          <Box sx={{ gridColumn: { xs: "1", sm: "1 / -1", md: "auto" } }}>
            <InfoGridCell label="Main Office Address" value={mainOfficeAddress} />
          </Box>
        </Box>

        <Divider />

        <Box id="eld-duty-graph">
          <EldDutyGraph dutyTotals={dutyTotals} segments={segments} />
        </Box>
      </Stack>
    </SectionCard>
  );
}

