import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  MenuItem,
  Pagination,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import FilterAltOutlinedIcon from "@mui/icons-material/FilterAltOutlined";
import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";

import SectionCard from "../components/common/SectionCard";
import PageHeader from "../components/common/PageHeader";
import TripCard from "../components/trips/TripCard";
import type { TripSummary } from "../types/trip";
import { listTrips } from "../api/tripApi";
import { tripOverviewPath } from "../utils/tripRoutes";

function sumMiles(trips: TripSummary[]) {
  return trips.reduce((acc, t) => acc + t.totalDistanceMi, 0);
}

function isoDateUTC(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

export default function TripHistoryPage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<TripSummary[]>([]);

  const [query, setQuery] = useState("");
  const [dateRange, setDateRange] = useState("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const pageSize = 5;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [complianceFilter, setComplianceFilter] = useState<"all" | "compliant" | "warning">(
    "all",
  );
  const [logsFilter, setLogsFilter] = useState<"all" | "completed" | "pending">("all");

  useEffect(() => {
    let mounted = true;
    listTrips()
      .then((data) => {
        if (!mounted) return;
        setTrips(data);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const filteredTrips = useMemo(() => {
    const q = query.trim().toLowerCase();
    let next = trips;

    if (dateRange !== "all") {
      const days = dateRange === "7d" ? 7 : 30;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffISO = isoDateUTC(cutoff);
      next = next.filter((t) => t.dateISO >= cutoffISO);
    }

    if (q) {
      next = next.filter((t) => {
        const haystack = [
          t.tripNo != null ? String(t.tripNo) : "",
          t.dateISO,
          t.driverName,
          t.truckId,
          t.trailerId ?? "",
          `${t.pickup.city} ${t.pickup.state}`,
          `${t.dropoff.city} ${t.dropoff.state}`,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }

    if (complianceFilter !== "all") {
      next = next.filter((t) => t.compliance === complianceFilter);
    }
    if (logsFilter !== "all") {
      next = next.filter((t) => t.driverLogs === logsFilter);
    }

    const cmpNewestFirst = (a: TripSummary, b: TripSummary) => {
      const byDate = b.dateISO.localeCompare(a.dateISO);
      if (byDate !== 0) return byDate;
      if (a.tripNo != null && b.tripNo != null && a.tripNo !== b.tripNo) {
        return b.tripNo - a.tripNo;
      }
      return String(b.id).localeCompare(String(a.id));
    };

    next = [...next].sort(sort === "newest" ? cmpNewestFirst : (a, b) => -cmpNewestFirst(a, b));

    return next;
  }, [trips, query, dateRange, sort, complianceFilter, logsFilter]);

  const compliantCount = filteredTrips.filter(
    (t) => t.compliance === "compliant",
  ).length;
  const warningCount = filteredTrips.filter((t) => t.compliance === "warning").length;
  const totalMiles = sumMiles(filteredTrips);

  const pageCount = Math.max(1, Math.ceil(filteredTrips.length / pageSize));
  const pagedTrips = filteredTrips.slice((page - 1) * pageSize, page * pageSize);

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Trip History"
        subtitle={
          <>
            View and manage all past trips and HOS records • As of {new Date().toLocaleDateString()} •{" "}
            <strong>{filteredTrips.length}</strong> trips
          </>
        }
        actions={
          <Button component={RouterLink} to="/overview" variant="outlined" size="small">
            Trip Plan &amp; HOS
          </Button>
        }
      />

      <SectionCard>
        <Stack spacing={1.5}>
          <Stack
            direction={{ xs: "column", lg: "row" }}
            spacing={1.5}
            sx={{ alignItems: { lg: "center" } }}
          >
            <TextField
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search by location, date, or driver..."
              size="small"
              fullWidth
              sx={{ flex: 1, minWidth: { lg: 280 } }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
            />

            <TextField
              select
              size="small"
              label="Date Range"
              value={dateRange}
              onChange={(e) => {
                setDateRange(e.target.value);
                setPage(1);
              }}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="7d">Last 7 days</MenuItem>
              <MenuItem value="30d">Last 30 days</MenuItem>
            </TextField>

            <TextField
              select
              size="small"
              label="Sort"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
              sx={{ minWidth: 170 }}
            >
              <MenuItem value="newest">Newest First</MenuItem>
              <MenuItem value="oldest">Oldest First</MenuItem>
            </TextField>
          </Stack>

          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={1}
            sx={{ alignItems: { md: "center" } }}
          >
            <Stack
              direction="row"
              spacing={2}
              sx={{ alignItems: "center", flexWrap: "wrap", flex: 1 }}
            >
              <Typography variant="body2" color="text.secondary">
                Showing: <strong>{filteredTrips.length}</strong> trips
              </Typography>

              <Typography variant="body2" color="text.secondary">
                <strong style={{ color: "inherit" }}>Compliant:</strong> {compliantCount}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                <strong style={{ color: "inherit" }}>Warnings:</strong> {warningCount}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                <strong style={{ color: "inherit" }}>Total Miles:</strong>{" "}
                {Math.round(totalMiles).toLocaleString()}
              </Typography>
            </Stack>

            <Stack
              direction="row"
              spacing={1}
              sx={{
                alignItems: "center",
                justifyContent: { xs: "flex-start", md: "flex-end" },
                flexWrap: "wrap",
                rowGap: 1,
              }}
            >
              <Button
                size="small"
                variant="outlined"
                startIcon={<FilterAltOutlinedIcon />}
                sx={{ whiteSpace: "nowrap" }}
                onClick={() => setFiltersOpen(true)}
              >
                More Filters
              </Button>
            </Stack>
          </Stack>
        </Stack>
      </SectionCard>

      <Stack spacing={1.25}>
        {loading ? (
          <Typography variant="body2" color="text.secondary">
            Loading trips…
          </Typography>
        ) : (
          pagedTrips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              onViewDetails={(tripNo) => navigate(tripOverviewPath(tripNo))}
            />
          ))
        )}
      </Stack>

      <Stack direction="row" sx={{ py: 1, justifyContent: "center" }}>
        <Pagination
          count={pageCount}
          page={page}
          onChange={(_, next) => setPage(next)}
          size="small"
          shape="rounded"
        />
      </Stack>

      <Dialog open={filtersOpen} onClose={() => setFiltersOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>More Filters</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              select
              size="small"
              label="Compliance"
              value={complianceFilter}
              onChange={(e) => {
                setComplianceFilter(e.target.value as "all" | "compliant" | "warning");
                setPage(1);
              }}
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="compliant">Compliant</MenuItem>
              <MenuItem value="warning">Warning</MenuItem>
            </TextField>

            <TextField
              select
              size="small"
              label="Driver Logs"
              value={logsFilter}
              onChange={(e) => {
                setLogsFilter(e.target.value as "all" | "completed" | "pending");
                setPage(1);
              }}
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="completed">Completed</MenuItem>
              <MenuItem value="pending">Pending</MenuItem>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            variant="text"
            onClick={() => {
              setComplianceFilter("all");
              setLogsFilter("all");
              setPage(1);
            }}
          >
            Reset
          </Button>
          <Button variant="contained" onClick={() => setFiltersOpen(false)}>
            Done
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

