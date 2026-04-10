import { Box, Collapse, Divider, Link, Stack, Typography } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import SectionCard from "../common/SectionCard";
import LabeledValue from "../common/LabeledValue";
import EldDutyGraph from "./EldDutyGraph";
import type { EldLogSegment, TripDetails } from "../../types/trip";
import { useState, type ReactNode } from "react";

function InfoCell({ label, value }: { label: string; value: string }) {
  return <LabeledValue label={label} value={value} />;
}

export interface DutyStatusCardProps {
  dutyCardRef?: (el: HTMLDivElement | null) => void;
  /** Day / Full Journey tabs — rendered at top of Daily Log card */
  tabs: ReactNode;
  /** When false, only tabs + short message (Full Journey or no sheet). */
  showDayLog: boolean;
  /** Shown when Full Journey is selected, e.g. "Full Journey: A → B". */
  fullJourneyLine: string;
  dateISO: string;
  totalMilesToday: number;
  fromLocation: string;
  toLocation: string;
  truckId: string;
  trailerId?: string | null;
  driverName: string;
  carrierName: string;
  mainOfficeAddress: string;
  dutyTotals: TripDetails["dutyTotals"];
  segments?: EldLogSegment[];
}

export default function DutyStatusCard({
  dutyCardRef,
  tabs,
  showDayLog,
  fullJourneyLine,
  dateISO,
  totalMilesToday,
  fromLocation,
  toLocation,
  truckId,
  trailerId,
  driverName,
  carrierName,
  mainOfficeAddress,
  dutyTotals,
  segments,
}: DutyStatusCardProps) {
  const [metaOpen, setMetaOpen] = useState(true);
  const dateStr = new Date(dateISO + "T12:00:00").toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <SectionCard
      ref={dutyCardRef}
      sx={{
        alignSelf: { lg: "start" },
        maxWidth: "100%",
        minWidth: 0,
      }}
    >
      <Stack spacing={1.5} sx={{ minHeight: 0, width: "100%" }}>
        <Box sx={{ width: "100%", minWidth: 0 }}>{tabs}</Box>

        {!showDayLog ? (
          <Stack spacing={0.75}>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 700 }}>
              {fullJourneyLine}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
              Select a day tab for this trip&apos;s 24-hour graph, header details, and matching remarks.
            </Typography>
          </Stack>
        ) : (
          <>
            <Box
              sx={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1,
                width: "100%",
              }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>
                Daily Log
              </Typography>
              <Link
                component="button"
                type="button"
                underline="hover"
                onClick={() => setMetaOpen((o) => !o)}
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 0.5,
                  cursor: "pointer",
                  border: "none",
                  background: "none",
                  font: "inherit",
                  color: "primary.main",
                  fontWeight: 700,
                  fontSize: 13,
                  p: 0,
                  flexShrink: 0,
                }}
              >
                {metaOpen ? "Collapse Log Sheet" : "Expand Log Sheet"}
                {metaOpen ? (
                  <ExpandLessIcon sx={{ fontSize: 18 }} />
                ) : (
                  <ExpandMoreIcon sx={{ fontSize: 18 }} />
                )}
              </Link>
            </Box>

            <Collapse
              in={metaOpen}
              timeout={0}
              sx={{ width: "100%", "& .MuiCollapse-wrapperInner": { width: "100%" } }}
            >
              <Stack spacing={2} sx={{ width: "100%" }}>
                <Divider />

                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
                    gap: 2,
                  }}
                >
                  <Stack spacing={1.25}>
                    <InfoCell label="Date" value={dateStr} />
                    <InfoCell label="Carrier" value={carrierName || "—"} />
                    <InfoCell label="From" value={fromLocation} />
                  </Stack>
                  <Stack spacing={1.25}>
                    <InfoCell label="Total Miles Driving Today" value={totalMilesToday.toFixed(1)} />
                    <InfoCell label="Main Office" value={mainOfficeAddress || "—"} />
                    <InfoCell label="To" value={toLocation} />
                  </Stack>
                  <Stack spacing={1.25}>
                    <InfoCell label="Truck No" value={truckId || "—"} />
                    <InfoCell label="Trailer No" value={trailerId?.trim() ? trailerId : "—"} />
                    <InfoCell label="Driver" value={driverName || "—"} />
                  </Stack>
                </Box>
              </Stack>
            </Collapse>

            <Divider />

            <Box sx={{ width: "100%", minWidth: 0, overflow: "hidden" }}>
              <EldDutyGraph dutyTotals={dutyTotals} segments={segments} />
            </Box>
          </>
        )}
      </Stack>
    </SectionCard>
  );
}
